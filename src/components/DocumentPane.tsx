import type {Editor as TiptapEditor} from "@tiptap/core";
import {FileText} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {saveExternalFile, saveWorkspaceFile} from "../lib/storage";
import type {
  DocStats,
  FileMeta,
  OpenDoc,
  OutlineItem,
  SaveState,
  ToastKind,
} from "../types";
import {Editor} from "./Editor";
import {Outline} from "./Outline";
import {StatusBar} from "./StatusBar";

interface DocumentPaneProps {
  doc: OpenDoc;
  outlineOpen: boolean;
  onCloseOutline: () => void;
  onSaved: (meta: FileMeta) => void;
  onSaveStateChange: (state: SaveState) => void;
  onRename: (newTitle: string) => Promise<FileMeta>;
  onOpenLink: (href: string) => Promise<boolean>;
  notify: (text: string, kind?: ToastKind) => void;
  flushRef: React.MutableRefObject<(() => Promise<void>) | null>;
  liveContent: Map<string, string>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DocumentPane({
  doc,
  outlineOpen,
  onCloseOutline,
  onSaved,
  onSaveStateChange,
  onRename,
  onOpenLink,
  notify,
  flushRef,
  liveContent,
}: DocumentPaneProps) {
  // 标签切换会重新挂载本组件，编辑器内容以 liveContent 为准，磁盘上的 doc.content 只是首次打开的快照
  const [initialMarkdown] = useState(() => liveContent.get(doc.id) ?? doc.content);
  const [title, setTitle] = useState(doc.title);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [stats, setStats] = useState<DocStats>({chars: 0, blocks: 0});
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const editorRef = useRef<TiptapEditor | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const latestContent = useRef(initialMarkdown);
  const titleRef = useRef(doc.title);
  const pathRef = useRef(doc.path);
  const frontmatterRef = useRef(doc.frontmatter);
  const lastCommittedTitleRef = useRef(doc.title);
  const lastSavedContentRef = useRef(initialMarkdown);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const renamingRef = useRef(false);
  const revisionRef = useRef(0);

  const onSavedRef = useRef(onSaved);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onRenameRef = useRef(onRename);
  const notifyRef = useRef(notify);
  onSavedRef.current = onSaved;
  onSaveStateChangeRef.current = onSaveStateChange;
  onRenameRef.current = onRename;
  notifyRef.current = notify;
  titleRef.current = title;

  const reportSaveState = useCallback((state: SaveState) => {
    setSaveState(state);
    onSaveStateChangeRef.current(state);
  }, []);

  useEffect(() => {
    pathRef.current = doc.path;
    frontmatterRef.current = doc.frontmatter;
  }, [doc.dir, doc.frontmatter, doc.path]);

  const persist = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (renamingRef.current) {
      pendingRef.current = true;
      return;
    }
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    pendingRef.current = false;
    reportSaveState("saving");
    const revision = revisionRef.current;
    const savedContent = latestContent.current;
    const savedPath = pathRef.current;
    try {
      const meta =
        doc.kind === "workspace"
          ? await saveWorkspaceFile(savedPath, savedContent, frontmatterRef.current)
          : await saveExternalFile(savedPath, savedContent, frontmatterRef.current);
      lastSavedContentRef.current = savedContent;
      onSavedRef.current(meta);
      if (revisionRef.current === revision) {
        reportSaveState("saved");
      } else {
        reportSaveState("dirty");
        pendingRef.current = true;
      }
    } catch (error) {
      console.error(error);
      reportSaveState("dirty");
      notifyRef.current(`保存失败：${errorMessage(error)}`, "error");
    } finally {
      savingRef.current = false;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      void persist();
    }
  }, [doc.kind, reportSaveState]);

  const scheduleSave = useCallback(() => {
    revisionRef.current += 1;
    reportSaveState("dirty");
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      void persist();
    }, 650);
  }, [persist, reportSaveState]);

  const flush = useCallback(async () => {
    if (
      lastSavedContentRef.current !== latestContent.current ||
      savingRef.current ||
      pendingRef.current
    ) {
      await persist();
    }
    let guard = 0;
    while ((savingRef.current || pendingRef.current) && guard < 100) {
      guard += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
  }, [persist]);

  const focusEditorEnd = () => {
    editorRef.current?.commands.focus("end");
  };

  const commitTitle = useCallback(
    async (focusEditorAfter: boolean) => {
      if (renamingRef.current) {
        return;
      }
      const next = titleRef.current.trim();
      if (!next) {
        setTitle(lastCommittedTitleRef.current);
        if (focusEditorAfter) {
          focusEditorEnd();
        }
        return;
      }
      if (next === lastCommittedTitleRef.current) {
        if (focusEditorAfter) {
          focusEditorEnd();
        }
        return;
      }
      renamingRef.current = true;
      try {
        await flush();
        const meta = await onRenameRef.current(next);
        pathRef.current = meta.path;
        lastCommittedTitleRef.current = meta.title;
        setTitle(meta.title);
        if (focusEditorAfter) {
          focusEditorEnd();
        }
      } catch (error) {
        setTitle(lastCommittedTitleRef.current);
        notifyRef.current(errorMessage(error), "error");
      } finally {
        renamingRef.current = false;
        if (
          pendingRef.current ||
          lastSavedContentRef.current !== latestContent.current
        ) {
          pendingRef.current = false;
          void persist();
        }
      }
    },
    [flush, persist],
  );

  const flushAll = useCallback(async () => {
    await flush();
    if (
      titleRef.current.trim() &&
      titleRef.current.trim() !== lastCommittedTitleRef.current
    ) {
      await commitTitle(false);
    }
    await flush();
  }, [commitTitle, flush]);

  useEffect(() => {
    flushRef.current = flushAll;
    return () => {
      if (flushRef.current === flushAll) {
        flushRef.current = null;
      }
    };
  }, [flushAll, flushRef]);

  useEffect(() => {
    if (!initialMarkdown.trim()) {
      const timer = window.setTimeout(() => {
        editorRef.current?.commands.focus("end");
      }, 80);
      return () => window.clearTimeout(timer);
    }
  }, [initialMarkdown, doc.id]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persist();
      }
    };
    const handleBlur = () => {
      if (lastSavedContentRef.current !== latestContent.current) {
        void persist();
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("blur", handleBlur);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [persist]);

  const handleContentChange = useCallback(
    (markdown: string) => {
      latestContent.current = markdown;
      liveContent.set(doc.id, markdown);
      scheduleSave();
    },
    [doc.id, liveContent, scheduleSave],
  );

  const goToHeading = (pos: number) => {
    const current = editorRef.current;
    if (!current) {
      return;
    }
    const dom = current.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({behavior: "smooth", block: "start"});
    }
    current.chain().focus().setTextSelection(pos + 1).run();
  };

  return (
    <div className="document-pane">
      <div className="document-main">
        <div className="doc-scroll">
          <div className="doc-page">
            <div className="doc-name" title="文件名（修改后会重命名文件）">
              <FileText size={13} />
              <input
                ref={titleInputRef}
                className="doc-title"
                value={title}
                placeholder="未命名"
                maxLength={120}
                spellCheck={false}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => {
                  void commitTitle(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitTitle(true);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    titleRef.current = lastCommittedTitleRef.current;
                    setTitle(lastCommittedTitleRef.current);
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
            <Editor
              key={doc.id}
              initialMarkdown={initialMarkdown}
              onContentChange={handleContentChange}
              onOutlineChange={setOutline}
              onStatsChange={setStats}
              editorRef={editorRef}
              assetDir={doc.dir}
              onOpenLink={onOpenLink}
            />
          </div>
        </div>
        <StatusBar stats={stats} saveState={saveState} />
      </div>
      {outlineOpen ? (
        <Outline items={outline} onSelect={goToHeading} onClose={onCloseOutline} />
      ) : null}
    </div>
  );
}
