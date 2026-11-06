import type {Editor as TiptapEditor} from "@tiptap/core";
import {FileText} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {saveExternalFile, saveWorkspaceFile} from "../lib/storage";
import type {
  DocSaver,
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
  onSaved: (meta: FileMeta, content: string) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onSaveStateChange: (state: SaveState) => void;
  onRename: (newTitle: string) => Promise<FileMeta>;
  onOpenLink: (href: string) => Promise<boolean>;
  notify: (text: string, kind?: ToastKind) => void;
  saveRef: React.MutableRefObject<DocSaver | null>;
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
  onDirtyChange,
  onSaveStateChange,
  onRename,
  onOpenLink,
  notify,
  saveRef,
  liveContent,
}: DocumentPaneProps) {
  // 标签切换会重新挂载本组件，编辑器内容以 liveContent 为准，磁盘上的 doc.content 只是上次保存的快照
  const [initialMarkdown] = useState(() => liveContent.get(doc.id) ?? doc.content);
  const [initialDirty] = useState(() => {
    const cached = liveContent.get(doc.id);
    // 序列化结果会 trim，磁盘原文常带结尾换行，比较前统一规范化
    return cached !== undefined && cached !== doc.content.trim();
  });
  const [title, setTitle] = useState(doc.title);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [stats, setStats] = useState<DocStats>({chars: 0, blocks: 0});
  const [saveState, setSaveState] = useState<SaveState>(initialDirty ? "dirty" : "saved");

  const editorRef = useRef<TiptapEditor | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const latestContent = useRef(initialMarkdown);
  const lastSavedContentRef = useRef(doc.content.trim());
  const dirtyRef = useRef(initialDirty);
  const titleRef = useRef(doc.title);
  const pathRef = useRef(doc.path);
  const frontmatterRef = useRef(doc.frontmatter);
  const lastCommittedTitleRef = useRef(doc.title);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const renamingRef = useRef(false);

  const onSavedRef = useRef(onSaved);
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onRenameRef = useRef(onRename);
  const notifyRef = useRef(notify);
  onSavedRef.current = onSaved;
  onSaveStateChangeRef.current = onSaveStateChange;
  onDirtyChangeRef.current = onDirtyChange;
  onRenameRef.current = onRename;
  notifyRef.current = notify;
  titleRef.current = title;

  const reportSaveState = useCallback((state: SaveState) => {
    setSaveState(state);
    onSaveStateChangeRef.current(state);
  }, []);

  const reportDirty = useCallback(
    (dirty: boolean) => {
      if (dirtyRef.current === dirty) {
        return;
      }
      dirtyRef.current = dirty;
      onDirtyChangeRef.current(doc.id, dirty);
    },
    [doc.id],
  );

  useEffect(() => {
    pathRef.current = doc.path;
    frontmatterRef.current = doc.frontmatter;
  }, [doc.dir, doc.frontmatter, doc.path]);

  const persist = useCallback(async () => {
    if (!dirtyRef.current) {
      reportSaveState("saved");
      return;
    }
    if (renamingRef.current || savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    pendingRef.current = false;
    reportSaveState("saving");
    const savedContent = latestContent.current;
    const savedPath = pathRef.current;
    try {
      const meta =
        doc.kind === "workspace"
          ? await saveWorkspaceFile(savedPath, savedContent, frontmatterRef.current)
          : await saveExternalFile(savedPath, savedContent, frontmatterRef.current);
      lastSavedContentRef.current = savedContent;
      reportDirty(false);
      onSavedRef.current(meta, savedContent);
    } catch (error) {
      console.error(error);
      reportDirty(true);
      notifyRef.current(`保存失败：${errorMessage(error)}`, "error");
    } finally {
      savingRef.current = false;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      void persist();
      return;
    }
    reportSaveState(dirtyRef.current ? "dirty" : "saved");
  }, [doc.kind, reportDirty, reportSaveState]);

  useEffect(() => {
    saveRef.current = {save: persist, isDirty: () => dirtyRef.current};
    return () => {
      if (saveRef.current?.save === persist) {
        saveRef.current = null;
      }
    };
  }, [persist, saveRef]);

  // 挂载时把本标签的保存状态报给顶栏，切回未保存的标签时按钮要可用
  useEffect(() => {
    reportSaveState(initialDirty ? "dirty" : "saved");
  }, [initialDirty, reportSaveState]);

  const commitTitle = useCallback(
    async (focusEditorAfter: boolean) => {
      if (renamingRef.current) {
        return;
      }
      const next = titleRef.current.trim();
      if (!next) {
        setTitle(lastCommittedTitleRef.current);
        if (focusEditorAfter) {
          editorRef.current?.commands.focus("end");
        }
        return;
      }
      if (next === lastCommittedTitleRef.current) {
        if (focusEditorAfter) {
          editorRef.current?.commands.focus("end");
        }
        return;
      }
      renamingRef.current = true;
      try {
        const meta = await onRenameRef.current(next);
        pathRef.current = meta.path;
        lastCommittedTitleRef.current = meta.title;
        setTitle(meta.title);
        if (focusEditorAfter) {
          editorRef.current?.commands.focus("end");
        }
      } catch (error) {
        setTitle(lastCommittedTitleRef.current);
        notifyRef.current(errorMessage(error), "error");
      } finally {
        renamingRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          void persist();
        }
      }
    },
    [persist],
  );

  useEffect(() => {
    if (initialMarkdown.trim()) {
      return;
    }
    const timer = window.setTimeout(() => {
      editorRef.current?.commands.focus("end");
    }, 80);
    return () => window.clearTimeout(timer);
  }, [initialMarkdown, doc.id]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persist();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [persist]);

  const handleContentChange = useCallback(
    (markdown: string) => {
      latestContent.current = markdown;
      liveContent.set(doc.id, markdown);
      const dirty = markdown !== lastSavedContentRef.current;
      reportDirty(dirty);
      reportSaveState(dirty ? "dirty" : "saved");
    },
    [doc.id, liveContent, reportDirty, reportSaveState],
  );

  const goToHeading = (pos: number) => {
    const current = editorRef.current;
    if (!current) {
      return;
    }
    const dom = current.view.nodeDOM(pos);
    // 先聚焦，但不让 focus / setTextSelection 触发自动滚动：
    // tiptap 的 focus 命令会在下一帧再执行 scrollIntoView（瞬时滚动），
    // 会和这里的平滑滚动互相抢位置，导致有时直接跳、有时平滑滚。
    current.view.dom.focus({preventScroll: true});
    current.commands.setTextSelection(pos + 1);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({behavior: "smooth", block: "start"});
    }
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
