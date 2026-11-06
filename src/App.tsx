import {getCurrentWindow} from "@tauri-apps/api/window";
import {FileInput, FilePlus2, FolderOpen, LoaderCircle} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {ConfirmDialog} from "./components/ConfirmDialog";
import {DocumentPane} from "./components/DocumentPane";
import {PromptDialog} from "./components/PromptDialog";
import {SettingsDialog} from "./components/SettingsDialog";
import {Sidebar} from "./components/Sidebar";
import {TabBar} from "./components/TabBar";
import {Toast} from "./components/Toast";
import {TopBar} from "./components/TopBar";
import {WindowResizeHandles} from "./components/WindowResizeHandles";
import {resolveMarkdownTarget} from "./lib/links";
import {applyFontSettings, readFontSettings, saveFontSettings} from "./lib/appearance";
import type {FontSettings} from "./lib/appearance";
import {hasMarkdownFiles, parentPath} from "./lib/paths";
import {isTheme, THEME_STORAGE_KEY} from "./lib/themes";
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspaceEntry,
  clearWorkspaceTrash,
  getWorkspace,
  isTauri,
  listTree,
  onFileOpen,
  openWorkspace,
  pickFolderPath,
  pickMarkdownPath,
  readExternalFile,
  readWorkspaceFile,
  renameExternalFile,
  renameWorkspaceFile,
  saveExternalFile,
  saveWorkspaceFile,
  takeStartupFiles,
} from "./lib/storage";
import type {
  DocKind,
  DocSaver,
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
const OUTLINE_KEY = "md-editor:outline-open";

interface TabSession {
  docs: {kind: DocKind; path: string; preview?: boolean}[];
  active: string | null;
}

type UnsavedChoice = "save" | "discard" | "cancel";

interface UnsavedPrompt {
  title: string;
  message: string;
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
    // 顶栏的保存状态跟着活动标签走：切到一个还没保存的标签，按钮要立刻可用
    setSaveState(next !== null && dirtyIdsRef.current.has(next) ? "dirty" : "saved");
  }, []);
  const commitPreviewId = useCallback((next: string | null) => {
    previewTabIdRef.current = next;
    setPreviewTabId(next);
  }, []);
  const markDirty = useCallback((ids: string[], dirty: boolean) => {
    const current = dirtyIdsRef.current;
    if (!ids.some((id) => current.has(id) !== dirty)) {
      return;
    }
    const next = new Set(current);
    ids.forEach((id) => {
      if (dirty) {
        next.add(id);
      } else {
        next.delete(id);
      }
    });
    dirtyIdsRef.current = next;
    setDirtyIds(next);
  }, []);

  const askUnsaved = useCallback(
    (prompt: UnsavedPrompt) =>
      new Promise<UnsavedChoice>((resolve) => {
        unsavedResolverRef.current = resolve;
        setUnsavedPrompt(prompt);
      }),
    [],
  );

  const dirtyOpenIds = useCallback(
    () =>
      openDocsRef.current.filter((doc) => dirtyIdsRef.current.has(doc.id)).map((doc) => doc.id),
    [],
  );

  const answerUnsaved = useCallback((choice: UnsavedChoice) => {
    setUnsavedPrompt(null);
    const resolve = unsavedResolverRef.current;
    unsavedResolverRef.current = null;
    resolve?.(choice);
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(
    () => localStorage.getItem(OUTLINE_KEY) === "1",
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [theme, setTheme] = useState<Theme>(() => {
    const applied = document.documentElement.dataset.theme;
    return isTheme(applied) ? applied : "light";
  });
  const [fontSettings, setFontSettings] = useState<FontSettings>(readFontSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPrompt | null>(null);
  const [revealRequest, setRevealRequest] = useState<{path: string; nonce: number} | null>(null);
  const [createRequest, setCreateRequest] = useState<{
    type: "file" | "folder";
    parent: string | null;
  } | null>(null);

  const saveRef = useRef<DocSaver | null>(null);
  const busyRef = useRef(false);
  const dirtyIdsRef = useRef<Set<string>>(dirtyIds);
  const unsavedResolverRef = useRef<((choice: UnsavedChoice) => void) | null>(null);
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

  const saveTabById = useCallback(
    async (id: string): Promise<boolean> => {
      if (!dirtyIdsRef.current.has(id)) {
        return true;
      }
      if (id === activeDocIdRef.current && saveRef.current) {
        await saveRef.current.save();
        return !dirtyIdsRef.current.has(id);
      }
      const doc = openDocsRef.current.find((item) => item.id === id);
      const content = liveContentRef.current.get(id);
      if (!doc || content === undefined) {
        markDirty([id], false);
        return true;
      }
      try {
        const meta =
          doc.kind === "workspace"
            ? await saveWorkspaceFile(doc.path, content, doc.frontmatter)
            : await saveExternalFile(doc.path, content, doc.frontmatter);
        commitDocs(
          openDocsRef.current.map((item) => (item.id === id ? {...item, ...meta, content} : item)),
        );
        markDirty([id], false);
        return true;
      } catch (cause) {
        notify(`保存失败：${errorMessage(cause)}`, "error");
        return false;
      }
    },
    [commitDocs, markDirty, notify],
  );

  // 只在显式动作（关标签 / 换工作区 / 退出）前调用，返回 false 表示这次操作应当中止
  const guardUnsaved = useCallback(
    async (ids: string[], title: string): Promise<boolean> => {
      const pending = ids.filter((id) => dirtyIdsRef.current.has(id));
      if (pending.length === 0) {
        return true;
      }
      const names = openDocsRef.current
        .filter((doc) => pending.includes(doc.id))
        .map((doc) => `「${doc.title}」`);
      const message =
        pending.length === 1
          ? `${names[0]} 有未保存的修改。`
          : `${pending.length} 个文件有未保存的修改：${names.join("、")}。`;
      const choice = await askUnsaved({title, message});
      if (choice === "cancel") {
        return false;
      }
      if (choice === "discard") {
        pending.forEach((id) => liveContentRef.current.delete(id));
        markDirty(pending, false);
        return true;
      }
      for (const id of pending) {
        if (!(await saveTabById(id))) {
          return false;
        }
      }
      return true;
    },
    [askUnsaved, markDirty, saveTabById],
  );

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
      }
      if (previewTabIdRef.current !== null && ids.includes(previewTabIdRef.current)) {
        commitPreviewId(null);
      }
      commitDocs(remaining);
      ids.forEach((id) => liveContentRef.current.delete(id));
      markDirty(ids, false);
    },
    [commitActiveId, commitDocs, commitPreviewId, markDirty],
  );

  const reorderTabs = useCallback(
    (fromId: string, toIndex: number) => {
      const current = openDocsRef.current;
      const from = current.findIndex((doc) => doc.id === fromId);
      if (from === -1) {
        return;
      }
      const target = Math.max(0, Math.min(current.length - 1, toIndex));
      if (target === from) {
        return;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      commitDocs(next);
    },
    [commitDocs],
  );

  const activateTab = useCallback(
    (id: string) => {
      if (id === activeDocIdRef.current) {
        return;
      }
      // 手动保存：切标签只换活动文档，未保存的内容留在内存里，不写盘
      commitActiveId(id);
    },
    [commitActiveId],
  );

  const promoteTab = useCallback(
    (id: string) => {
      // 双击预览标签：清除预览标记，之后单击别的文件不会再顶掉它
      if (previewTabIdRef.current === id) {
        commitPreviewId(null);
      }
    },
    [commitPreviewId],
  );

  const closeTab = useCallback(
    async (id: string) => {
      if (!(await guardUnsaved([id], "关闭前保存？"))) {
        return;
      }
      removeTabs([id]);
    },
    [guardUnsaved, removeTabs],
  );

  const cycleTab = useCallback(
    (delta: number) => {
      const docs = openDocsRef.current;
      if (docs.length < 2) {
        return;
      }
      const index = docs.findIndex((doc) => doc.id === activeDocIdRef.current);
      activateTab(docs[(index + delta + docs.length) % docs.length].id);
    },
    [activateTab],
  );

  const openWorkspacePath = useCallback(
    async (path: string, options: {preview?: boolean} = {}) => {
      const {preview = false} = options;
      const findExisting = () =>
        openDocsRef.current.find((doc) => doc.kind === "workspace" && doc.path === path) ?? null;
      const reuse = (tab: OpenDoc) => {
        if (!preview && tab.id === previewTabIdRef.current) {
          commitPreviewId(null);
        }
        activateTab(tab.id);
      };
      const existing = findExisting();
      if (existing) {
        reuse(existing);
        return;
      }
      const doc = await readWorkspaceFile(path);
      const openedByEarlierTask = findExisting();
      if (openedByEarlierTask) {
        reuse(openedByEarlierTask);
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
      const doc = await readExternalFile(path);
      if (doc.workspacePath) {
        await openWorkspacePath(doc.workspacePath);
        return;
      }
      const existing = openDocsRef.current.find(
        (item) => item.kind === "external" && item.path === doc.path,
      );
      if (existing) {
        activateTab(existing.id);
        return;
      }
      pushTab(makeOpenDoc(doc, "external"));
    },
    [activateTab, openWorkspacePath, pushTab],
  );

  const openPathRef = useRef(openPath);
  openPathRef.current = openPath;

  const openPathQueued = useCallback(
    (path: string) =>
      enqueueOpen(() => openPathRef.current(path)).catch((cause) =>
        notify(errorMessage(cause), "error"),
      ),
    [enqueueOpen, notify],
  );

  // 双击 .md / 「打开方式」启动时，文件路径在命令行参数里，由 Rust 侧暂存
  const drainStartupFiles = useCallback(async () => {
    if (!isTauri()) {
      return;
    }
    let files: string[] = [];
    try {
      files = await takeStartupFiles();
    } catch (cause) {
      console.error(cause);
      return;
    }
    for (const path of files) {
      await openPathQueued(path);
    }
  }, [openPathQueued]);

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
      if (!(await guardUnsaved(dirtyOpenIds(), "切换工作区前保存？"))) {
        return;
      }
      const info = await openWorkspace(path);
      const nodes = await listTree();
      setWorkspace(info);
      setTree(nodes);
      setError("");
      setSaveState("saved");
      await restoreTabs(info);
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      busyRef.current = false;
    }
  }, [dirtyOpenIds, guardUnsaved, notify, restoreTabs]);

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
    (meta: FileMeta, content: string) => {
      commitDocs(
        openDocsRef.current.map((doc) =>
          doc.id === activeDocIdRef.current && doc.path === meta.path
            ? {
                ...doc,
                title: meta.title,
                dir: meta.dir,
                modifiedAt: meta.modifiedAt,
                content,
              }
            : doc,
        ),
      );
    },
    [commitDocs],
  );

  const handleDirtyChange = useCallback(
    (id: string, dirty: boolean) => {
      markDirty([id], dirty);
    },
    [markDirty],
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

  const handleDeleteEntry = useCallback(
    async (path: string) => {
      try {
        await deleteWorkspaceEntry(path);
        // 删文件夹会连带里面的文件，按路径前缀把受影响的标签一起关掉
        removeTabs(
          openDocsRef.current
            .filter(
              (doc) =>
                doc.kind === "workspace" &&
                (doc.path === path || doc.path.startsWith(`${path}/`)),
            )
            .map((doc) => doc.id),
        );
        try {
          await refreshTree();
        } catch (cause) {
          console.error(cause);
        }
        notify("已移动到工作区的 .trash 目录");
      } catch (cause) {
        notify(errorMessage(cause), "error");
      }
    },
    [notify, refreshTree, removeTabs],
  );

  const handleClearTrash = useCallback(() => {
    void (async () => {
      try {
        const removed = await clearWorkspaceTrash();
        notify(removed > 0 ? `已永久删除 ${removed} 项` : "回收站已经是空的");
      } catch (cause) {
        notify(errorMessage(cause), "error");
      }
    })();
  }, [notify]);

  const handleRefresh = useCallback(() => {
    void refreshTree().catch((cause) => notify(errorMessage(cause), "error"));
  }, [notify, refreshTree]);

  const handleSaveClick = useCallback(() => {
    const id = activeDocIdRef.current;
    if (id !== null) {
      void saveTabById(id);
    }
  }, [saveTabById]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyFontSettings(fontSettings);
    saveFontSettings(fontSettings);
  }, [fontSettings]);

  useEffect(() => {
    localStorage.setItem(OUTLINE_KEY, outlineOpen ? "1" : "0");
  }, [outlineOpen]);

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
      // 恢复完标签再处理「打开方式」传进来的文件，否则会被 restoreTabs 覆盖掉
      if (!cancelled) {
        await drainStartupFiles();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drainStartupFiles, restoreTabs]);

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

  // 已运行时再从资源管理器「打开方式」启动，第二个实例会把路径转交给本实例
  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let disposed = false;
    let stop: (() => void) | undefined;
    void onFileOpen((path) => {
      if (!disposed) {
        void openPathQueued(path);
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stop = unlisten;
      }
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [openPathQueued]);

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
        if (!(await guardUnsaved(dirtyOpenIds(), "退出前保存？"))) {
          closing = false;
          return;
        }
        await appWindow.destroy();
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
  }, [dirtyOpenIds, guardUnsaved]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        cycleTab(event.shiftKey ? -1 : 1);
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
        outlineOpen={outlineOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenWorkspace={() => void openWorkspaceFlow()}
        onOpenExternal={() => void openExternalFlow()}
        onSave={handleSaveClick}
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
            onDeleteEntry={(path) => void handleDeleteEntry(path)}
            onClearTrash={handleClearTrash}
            onRefresh={handleRefresh}
          />
        ) : null}
        <main className="app__main">
          <TabBar
            docs={openDocs}
            activeId={activeDocId}
            previewId={previewTabId}
            dirtyIds={dirtyIds}
            onActivate={activateTab}
            onClose={(id) => void closeTab(id)}
            onPromote={promoteTab}
            onReorder={reorderTabs}
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
              onDirtyChange={handleDirtyChange}
              onSaveStateChange={handleSaveStateChange}
              onRename={handleRename}
              onOpenLink={openLinkFlow}
              notify={notify}
              saveRef={saveRef}
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

      <ConfirmDialog
        open={unsavedPrompt !== null}
        title={unsavedPrompt?.title ?? ""}
        message={unsavedPrompt?.message ?? ""}
        confirmLabel="保存"
        altLabel="放弃修改"
        onCancel={() => answerUnsaved("cancel")}
        onAlt={() => answerUnsaved("discard")}
        onConfirm={() => answerUnsaved("save")}
      />

      <Toast message={toast} onClose={dismissToast} />
      <SettingsDialog
        open={settingsOpen}
        theme={theme}
        fontSettings={fontSettings}
        onSelectTheme={setTheme}
        onChangeFontSettings={(patch) =>
          setFontSettings((current) => ({...current, ...patch}))
        }
        onClose={() => setSettingsOpen(false)}
      />
      <WindowResizeHandles />
    </div>
  );
}
