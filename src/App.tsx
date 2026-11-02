import {getCurrentWindow} from "@tauri-apps/api/window";
import {FileInput, FilePlus2, FolderOpen, LoaderCircle} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {DocumentPane} from "./components/DocumentPane";
import {PromptDialog} from "./components/PromptDialog";
import {Sidebar} from "./components/Sidebar";
import {TabBar} from "./components/TabBar";
import {Toast} from "./components/Toast";
import {TopBar} from "./components/TopBar";
import {resolveMarkdownTarget} from "./lib/links";
import {hasMarkdownFiles, parentPath} from "./lib/paths";
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspaceFile,
  getWorkspace,
  isTauri,
  listTree,
  openWorkspace,
  pickFolderPath,
  pickMarkdownPath,
  readExternalFile,
  readWorkspaceFile,
  renameExternalFile,
  renameWorkspaceFile,
} from "./lib/storage";
import type {
  DocKind,
  EntryNode,
  FileDoc,
  FileMeta,
  OpenDoc,
  SaveState,
  Theme,
  ToastKind,
  ToastMessage,
  WorkspaceInfo,
} from "./types";

const TABS_KEY = "md-editor:open-tabs";
const THEME_KEY = "md-editor:theme";

interface TabSession {
  docs: {kind: DocKind; path: string; preview?: boolean}[];
  active: string | null;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeOpenDoc(doc: FileDoc, kind: DocKind): OpenDoc {
  return {...doc, kind, id: makeId()};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readSessions(): Record<string, TabSession> {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TabSession>) : {};
  } catch {
    return {};
  }
}

function writeSession(workspacePath: string, session: TabSession) {
  const sessions = readSessions();
  if (session.docs.length > 0) {
    sessions[workspacePath] = session;
  } else {
    delete sessions[workspacePath];
  }
  localStorage.setItem(TABS_KEY, JSON.stringify(sessions));
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [tree, setTree] = useState<EntryNode[]>([]);
  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [previewTabId, setPreviewTabId] = useState<string | null>(null);
  const activeDoc = openDocs.find((doc) => doc.id === activeDocId) ?? null;
  // 标签状态以 ref 为准并即时更新：连续打开（如双击）会排队执行，不能等 React 重渲染后才看到上一个任务的结果
  const openDocsRef = useRef(openDocs);
  const activeDocIdRef = useRef(activeDocId);
  const previewTabIdRef = useRef(previewTabId);
  const commitDocs = useCallback((next: OpenDoc[]) => {
    openDocsRef.current = next;
    setOpenDocs(next);
  }, []);
  const commitActiveId = useCallback((next: string | null) => {
    activeDocIdRef.current = next;
    setActiveDocId(next);
  }, []);
  const commitPreviewId = useCallback((next: string | null) => {
    previewTabIdRef.current = next;
    setPreviewTabId(next);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [revealRequest, setRevealRequest] = useState<{path: string; nonce: number} | null>(null);
  const [createRequest, setCreateRequest] = useState<{
    type: "file" | "folder";
    parent: string | null;
  } | null>(null);

  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const busyRef = useRef(false);
  const liveContentRef = useRef(new Map<string, string>());
  const openChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueOpen = useCallback((task: () => Promise<unknown>) => {
    const next = openChainRef.current.then(task, task);
    openChainRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const notify = useCallback((text: string, kind: ToastKind = "info") => {
    setToast({id: Date.now() + Math.random(), kind, text});
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const refreshTree = useCallback(async () => {
    const nodes = await listTree();
    setTree(nodes);
    return nodes;
  }, []);

  const pushTab = useCallback(
    (doc: OpenDoc, options: {preview?: boolean; replaceId?: string | null} = {}) => {
      const {preview = false, replaceId = null} = options;
      if (replaceId !== null) {
        liveContentRef.current.delete(replaceId);
      }
      const current = openDocsRef.current;
      commitDocs(
        replaceId === null
          ? [...current, doc]
          : current.map((item) => (item.id === replaceId ? doc : item)),
      );
      commitActiveId(doc.id);
      if (preview) {
        commitPreviewId(doc.id);
      }
      setOutlineOpen(false);
      setSaveState("saved");
    },
    [commitActiveId, commitDocs, commitPreviewId],
  );

  const removeTabs = useCallback(
    (ids: string[]) => {
      const current = openDocsRef.current;
      const remaining = current.filter((doc) => !ids.includes(doc.id));
      if (remaining.length === current.length) {
        return;
      }
      const activeId = activeDocIdRef.current;
      if (activeId !== null && ids.includes(activeId)) {
        const index = current.findIndex((doc) => doc.id === activeId);
        const next = remaining[index - 1] ?? remaining[index] ?? null;
        commitActiveId(next ? next.id : null);
        setOutlineOpen(false);
        setSaveState("saved");
      }
      if (previewTabIdRef.current !== null && ids.includes(previewTabIdRef.current)) {
        commitPreviewId(null);
      }
      commitDocs(remaining);
      ids.forEach((id) => liveContentRef.current.delete(id));
    },
    [commitActiveId, commitDocs, commitPreviewId],
  );

  const activateTab = useCallback(
    async (id: string) => {
      if (id === activeDocIdRef.current) {
        return;
      }
      await flushRef.current?.();
      commitActiveId(id);
      setOutlineOpen(false);
      setSaveState("saved");
    },
    [commitActiveId],
  );

  const closeTab = useCallback(
    async (id: string) => {
      await flushRef.current?.();
      removeTabs([id]);
    },
    [removeTabs],
  );

  const cycleTab = useCallback(
    async (delta: number) => {
      const docs = openDocsRef.current;
      if (docs.length < 2) {
        return;
      }
      const index = docs.findIndex((doc) => doc.id === activeDocIdRef.current);
      await activateTab(docs[(index + delta + docs.length) % docs.length].id);
    },
    [activateTab],
  );

  const openWorkspacePath = useCallback(
    async (path: string, options: {skipFlush?: boolean; preview?: boolean} = {}) => {
      const {skipFlush = false, preview = false} = options;
      const findExisting = () =>
        openDocsRef.current.find((doc) => doc.kind === "workspace" && doc.path === path) ?? null;
      const reuse = async (tab: OpenDoc) => {
        if (!preview && tab.id === previewTabIdRef.current) {
          commitPreviewId(null);
        }
        await activateTab(tab.id);
      };
      const existing = findExisting();
      if (existing) {
        await reuse(existing);
        return;
      }
      if (!skipFlush) {
        await flushRef.current?.();
      }
      const doc = await readWorkspaceFile(path);
      const openedByEarlierTask = findExisting();
      if (openedByEarlierTask) {
        await reuse(openedByEarlierTask);
        return;
      }
      const previewTab = preview
        ? (openDocsRef.current.find((item) => item.id === previewTabIdRef.current) ?? null)
        : null;
      pushTab(makeOpenDoc(doc, "workspace"), {
        preview,
        replaceId: previewTab ? previewTab.id : null,
      });
    },
    [activateTab, commitPreviewId, pushTab],
  );

  const openPath = useCallback(
    async (path: string) => {
      await flushRef.current?.();
      const doc = await readExternalFile(path);
      if (doc.workspacePath) {
        await openWorkspacePath(doc.workspacePath, {skipFlush: true});
        return;
      }
      const existing = openDocsRef.current.find(
        (item) => item.kind === "external" && item.path === doc.path,
      );
      if (existing) {
        await activateTab(existing.id);
        return;
      }
      pushTab(makeOpenDoc(doc, "external"));
    },
    [activateTab, openWorkspacePath, pushTab],
  );

  const openExternalFlow = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      const path = await pickMarkdownPath();
      if (!path) {
        return;
      }
      await enqueueOpen(() => openPath(path));
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      busyRef.current = false;
    }
  }, [enqueueOpen, notify, openPath]);

  const openLinkFlow = useCallback(
    async (href: string): Promise<boolean> => {
      const target = resolveMarkdownTarget(href, activeDoc?.dir ?? "");
      if (!target) {
        return false;
      }
      if (busyRef.current) {
        return true;
      }
      busyRef.current = true;
      try {
        await enqueueOpen(() => openPath(target));
      } catch (cause) {
        notify(`打开链接失败：${errorMessage(cause)}`, "error");
      } finally {
        busyRef.current = false;
      }
      return true;
    },
    [activeDoc?.dir, enqueueOpen, notify, openPath],
  );

  const restoreTabs = useCallback(async (info: WorkspaceInfo) => {
    const session = readSessions()[info.path];
    const restored: OpenDoc[] = [];
    let restoredPreviewId: string | null = null;
    for (const item of session?.docs ?? []) {
      try {
        const doc =
          item.kind === "workspace"
            ? await readWorkspaceFile(item.path)
            : await readExternalFile(item.path);
        const opened = makeOpenDoc(doc, item.kind);
        if (item.preview) {
          restoredPreviewId = opened.id;
        }
        restored.push(opened);
      } catch {
        // 文件被删除或移走了，跳过这个标签
      }
    }
    const kept = openDocsRef.current.filter(
      (doc) => doc.kind === "external" && !restored.some((item) => item.path === doc.path),
    );
    const merged = [...kept, ...restored];
    const active =
      merged.find((doc) => doc.path === session?.active) ?? merged[merged.length - 1] ?? null;
    commitDocs(merged);
    commitActiveId(active ? active.id : null);
    commitPreviewId(restoredPreviewId);
  }, [commitActiveId, commitDocs, commitPreviewId]);

  const openWorkspaceFlow = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      const path = await pickFolderPath();
      if (!path) {
        return;
      }
      await flushRef.current?.();
      const info = await openWorkspace(path);
      const nodes = await listTree();
      setWorkspace(info);
      setTree(nodes);
      setError("");
      setOutlineOpen(false);
      setSaveState("saved");
      await restoreTabs(info);
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      busyRef.current = false;
    }
  }, [notify, restoreTabs]);

  const handleOpenFile = useCallback(
    (path: string, preview: boolean) => {
      // 双击会连着触发 click/click/dblclick，并发打开会看不到彼此刚建的标签，所以排队执行
      void enqueueOpen(() => openWorkspacePath(path, {preview})).catch((cause) =>
        notify(errorMessage(cause), "error"),
      );
    },
    [enqueueOpen, notify, openWorkspacePath],
  );

  const handleSaveStateChange = useCallback(
    (state: SaveState) => {
      setSaveState(state);
      // 预览标签一有改动就固定住，否则会被下一次单击顶掉
      const active = activeDocIdRef.current;
      if (state !== "saved" && active !== null && active === previewTabIdRef.current) {
        commitPreviewId(null);
      }
    },
    [commitPreviewId],
  );

  const handleSaved = useCallback(
    (meta: FileMeta) => {
      commitDocs(
        openDocsRef.current.map((doc) =>
          doc.id === activeDocIdRef.current && doc.path === meta.path
            ? {
                ...doc,
                title: meta.title,
                dir: meta.dir,
                modifiedAt: meta.modifiedAt,
              }
            : doc,
        ),
      );
    },
    [commitDocs],
  );

  const handleRename = useCallback(
    async (newTitle: string): Promise<FileMeta> => {
      if (!activeDoc) {
        throw new Error("没有打开的文档");
      }
      const meta =
        activeDoc.kind === "workspace"
          ? await renameWorkspaceFile(activeDoc.path, newTitle)
          : await renameExternalFile(activeDoc.path, newTitle);
      commitDocs(
        openDocsRef.current.map((doc) =>
          doc.id === activeDoc.id
            ? {
                ...doc,
                path: meta.path,
                title: meta.title,
                dir: meta.dir,
                modifiedAt: meta.modifiedAt,
              }
            : doc,
        ),
      );
      if (activeDoc.kind === "workspace") {
        try {
          await refreshTree();
        } catch (cause) {
          console.error(cause);
        }
      }
      return meta;
    },
    [activeDoc, commitDocs, refreshTree],
  );

  const requestCreate = useCallback(
    (type: "file" | "folder", parent: string | null) => {
      if (!workspace) {
        notify("请先打开一个文件夹作为工作区", "info");
        return;
      }
      setCreateRequest({type, parent});
    },
    [notify, workspace],
  );

  const submitCreate = async (value: string) => {
    if (!createRequest || !workspace) {
      throw new Error("请先打开一个文件夹作为工作区");
    }
    await flushRef.current?.();
    if (createRequest.type === "file") {
      const doc = await createWorkspaceFile(createRequest.parent, value);
      pushTab(makeOpenDoc(doc, "workspace"));
      setRevealRequest({path: parentPath(doc.path), nonce: Date.now()});
      try {
        await refreshTree();
      } catch (cause) {
        console.error(cause);
      }
    } else {
      const folder = await createWorkspaceFolder(createRequest.parent, value);
      setRevealRequest({path: folder, nonce: Date.now()});
      try {
        await refreshTree();
      } catch (cause) {
        console.error(cause);
      }
      notify(`已创建文件夹「${folder.split("/").pop() ?? folder}」`);
    }
  };

  const handleDeleteFile = useCallback(
    async (path: string) => {
      try {
        await flushRef.current?.();
        await deleteWorkspaceFile(path);
        removeTabs(
          openDocsRef.current
            .filter((doc) => doc.kind === "workspace" && doc.path === path)
            .map((doc) => doc.id),
        );
        try {
          await refreshTree();
        } catch (cause) {
          console.error(cause);
        }
        notify("文件已移动到工作区的 .trash 目录");
      } catch (cause) {
        notify(errorMessage(cause), "error");
      }
    },
    [notify, refreshTree, removeTabs],
  );

  const handleRefresh = useCallback(() => {
    void refreshTree().catch((cause) => notify(errorMessage(cause), "error"));
  }, [notify, refreshTree]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await getWorkspace();
        if (info) {
          const nodes = await listTree();
          if (cancelled) {
            return;
          }
          setWorkspace(info);
          setTree(nodes);
          if (!cancelled) {
            await restoreTabs(info);
          }
        }
      } catch (cause) {
        console.error(cause);
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreTabs]);

  useEffect(() => {
    if (!workspace) {
      return;
    }
    const active = openDocs.find((doc) => doc.id === activeDocId) ?? null;
    writeSession(workspace.path, {
      docs: openDocs.map((doc) => ({
        kind: doc.kind,
        path: doc.path,
        preview: doc.id === previewTabId,
      })),
      active: active ? active.path : null,
    });
  }, [activeDocId, openDocs, previewTabId, workspace]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let closing = false;
    const appWindow = getCurrentWindow();
    void appWindow
      .onCloseRequested(async (event) => {
        if (closing) {
          return;
        }
        event.preventDefault();
        closing = true;
        try {
          await flushRef.current?.();
        } finally {
          await appWindow.destroy();
        }
      })
      .then((stop) => {
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void cycleTab(event.shiftKey ? -1 : 1);
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "w") {
        const id = activeDocIdRef.current;
        if (id !== null) {
          event.preventDefault();
          void closeTab(id);
        }
        return;
      }
      if (key === "o") {
        event.preventDefault();
        if (event.shiftKey) {
          void openWorkspaceFlow();
        } else {
          void openExternalFlow();
        }
        return;
      }
      if (key === "n" && !event.shiftKey) {
        if (workspace) {
          event.preventDefault();
          requestCreate("file", null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTab, cycleTab, openExternalFlow, openWorkspaceFlow, requestCreate, workspace]);

  const workspaceHasFiles = hasMarkdownFiles(tree);

  return (
    <div className="app">
      <TopBar
        workspace={workspace}
        activeDoc={activeDoc}
        saveState={saveState}
        theme={theme}
        outlineOpen={outlineOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
        onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        onOpenWorkspace={() => void openWorkspaceFlow()}
        onOpenExternal={() => void openExternalFlow()}
      />
      <div className="app__body">
        {sidebarOpen ? (
          <Sidebar
            workspace={workspace}
            tree={tree}
            activeDoc={activeDoc}
            revealRequest={revealRequest}
            loading={loading}
            onOpenWorkspace={() => void openWorkspaceFlow()}
            onOpenExternal={() => void openExternalFlow()}
            onOpenFile={handleOpenFile}
            onRequestCreate={requestCreate}
            onDeleteFile={(path) => void handleDeleteFile(path)}
            onRefresh={handleRefresh}
          />
        ) : null}
        <main className="app__main">
          <TabBar
            docs={openDocs}
            activeId={activeDocId}
            previewId={previewTabId}
            dirty={saveState !== "saved"}
            onActivate={(id) => void activateTab(id)}
            onClose={(id) => void closeTab(id)}
            onNewFile={() => requestCreate("file", null)}
          />
          {loading ? (
            <div className="state-screen">
              <LoaderCircle size={22} className="is-spinning" />
              <span>正在打开工作区…</span>
            </div>
          ) : error ? (
            <div className="state-screen">
              <span className="state-screen__title">工作区加载失败</span>
              <span className="state-screen__message">{error}</span>
              <button
                type="button"
                className="button button--primary"
                onClick={() => location.reload()}
              >
                重试
              </button>
            </div>
          ) : activeDoc ? (
            <DocumentPane
              key={activeDoc.id}
              doc={activeDoc}
              outlineOpen={outlineOpen}
              onCloseOutline={() => setOutlineOpen(false)}
              onSaved={handleSaved}
              onSaveStateChange={handleSaveStateChange}
              onRename={handleRename}
              onOpenLink={openLinkFlow}
              notify={notify}
              flushRef={flushRef}
              liveContent={liveContentRef.current}
            />
          ) : !workspace ? (
            <div className="start-screen">
              <div className="start-screen__icon">
                <FolderOpen size={28} />
              </div>
              <h1>打开一个文件夹</h1>
              <p>
                像 Typora 一样，直接用本地文件夹管理 Markdown。文件不会被导入数据库，
                也不会被改写结构——YAML frontmatter 会原样保留。
              </p>
              <div className="start-screen__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void openWorkspaceFlow()}
                >
                  <FolderOpen size={15} />
                  打开文件夹
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void openExternalFlow()}
                >
                  <FileInput size={15} />
                  打开文件
                </button>
              </div>
              <span className="start-screen__hint">
                快捷键：Ctrl/Cmd + Shift + O 打开文件夹，Ctrl/Cmd + O 打开文件
              </span>
            </div>
          ) : (
            <div className="state-screen workspace-home">
              <div className="workspace-home__icon">
                <FolderOpen size={26} />
              </div>
              <span className="state-screen__title">{workspace.name}</span>
              <span className="state-screen__message">
                {workspaceHasFiles
                  ? "从左侧选择一个 Markdown 文件，或者新建一篇。"
                  : "这个文件夹里还没有 Markdown 文件。"}
              </span>
              <div className="start-screen__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => requestCreate("file", null)}
                >
                  <FilePlus2 size={15} />
                  新建文件
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => requestCreate("folder", null)}
                >
                  新建文件夹
                </button>
              </div>
              <span className="workspace-home__path" title={workspace.path}>
                {workspace.path}
              </span>
            </div>
          )}
        </main>
      </div>

      <PromptDialog
        open={createRequest !== null}
        title={createRequest?.type === "folder" ? "新建文件夹" : "新建文件"}
        label={createRequest?.type === "folder" ? "文件夹名称" : "文件名（自动添加 .md）"}
        description={
          createRequest
            ? `位置：${createRequest.parent ? `/${createRequest.parent}` : "工作区根目录"}`
            : undefined
        }
        defaultValue={createRequest?.type === "folder" ? "新建文件夹" : "未命名"}
        placeholder={createRequest?.type === "folder" ? "例如：项目笔记" : "例如：第一篇笔记"}
        confirmLabel="创建"
        onClose={() => setCreateRequest(null)}
        onSubmit={submitCreate}
      />

      <Toast message={toast} onClose={dismissToast} />
    </div>
  );
}
