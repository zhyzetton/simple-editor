import {
  CheckCircle2,
  ChevronRight,
  Copy,
  FileInput,
  FolderOpen,
  ListTree,
  Loader2,
  Maximize2,
  Minus,
  PanelLeft,
  Save,
  Settings,
  Square,
  X,
} from "lucide-react";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {useEffect, useState} from "react";
import {isMacOS} from "../lib/platform";
import {isTauri} from "../lib/storage";
import type {OpenDoc, SaveState, WorkspaceInfo} from "../types";

interface TopBarProps {
  workspace: WorkspaceInfo | null;
  activeDoc: OpenDoc | null;
  saveState: SaveState;
  outlineOpen: boolean;
  onToggleSidebar: () => void;
  onToggleOutline: () => void;
  onOpenSettings: () => void;
  onOpenWorkspace: () => void;
  onOpenExternal: () => void;
  onSave: () => void;
}

function breadcrumb(workspace: WorkspaceInfo | null, activeDoc: OpenDoc | null): string[] {
  if (!activeDoc) {
    return [workspace ? workspace.name : "未打开工作区"];
  }
  if (activeDoc.kind === "external") {
    return ["外部文件", activeDoc.title];
  }
  const segments: string[] = [];
  if (workspace) {
    segments.push(workspace.name);
  }
  const parts = activeDoc.path.split("/").filter(Boolean);
  parts.pop();
  segments.push(...parts, activeDoc.title);
  return segments;
}

export function TopBar({
  workspace,
  activeDoc,
  saveState,
  outlineOpen,
  onToggleSidebar,
  onToggleOutline,
  onOpenSettings,
  onOpenWorkspace,
  onOpenExternal,
  onSave,
}: TopBarProps) {
  const segments = breadcrumb(workspace, activeDoc);
  const tauri = isTauri();
  const mac = tauri && isMacOS();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void appWindow.isMaximized().then((value) => {
      if (!disposed) {
        setMaximized(value);
      }
    });
    void appWindow
      .onResized(async () => {
        const value = await appWindow.isMaximized();
        if (!disposed) {
          setMaximized(value);
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
  }, [tauri]);

  const minimizeWindow = () => {
    if (tauri) {
      void getCurrentWindow().minimize();
    }
  };

  const toggleMaximizeWindow = async () => {
    if (!tauri) {
      return;
    }
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    setMaximized(await appWindow.isMaximized());
  };

  const closeWindow = () => {
    if (tauri) {
      // 走 close() 才能触发 App 里的未保存确认流程
      void getCurrentWindow().close();
    }
  };

  return (
    <header className="topbar" data-tauri-drag-region="deep">
      {mac ? (
        <div className="mac-controls">
          <button
            type="button"
            className="mac-control mac-control--close"
            title="关闭"
            onClick={closeWindow}
          >
            <X size={8} />
          </button>
          <button
            type="button"
            className="mac-control mac-control--minimize"
            title="最小化"
            onClick={minimizeWindow}
          >
            <Minus size={8} />
          </button>
          <button
            type="button"
            className="mac-control mac-control--maximize"
            title={maximized ? "还原" : "最大化"}
            onClick={() => void toggleMaximizeWindow()}
          >
            <Maximize2 size={7} />
          </button>
        </div>
      ) : null}
      <button type="button" className="icon-button" title="切换侧边栏" onClick={onToggleSidebar}>
        <PanelLeft size={17} />
      </button>
      <div className="topbar__breadcrumb">
        {segments.map((segment, index) => (
          <span className="topbar__segment" key={`${segment}-${index}`}>
            {index > 0 ? <ChevronRight size={13} className="topbar__chevron" /> : null}
            <span
              className={`topbar__crumb${
                index === segments.length - 1 ? " topbar__crumb--active" : ""
              }`}
              title={segment}
            >
              {segment}
            </span>
          </span>
        ))}
      </div>
      <span className="topbar__spacer" />
      {activeDoc ? (
        <button
          type="button"
          className={`topbar__save topbar__save--${saveState}`}
          title="保存到磁盘（Ctrl/Cmd + S）"
          disabled={saveState === "saved"}
          onClick={onSave}
        >
          {saveState === "saved" ? (
            <CheckCircle2 size={14} />
          ) : saveState === "saving" ? (
            <Loader2 size={14} className="is-spinning" />
          ) : (
            <Save size={14} />
          )}
          {saveState === "saved" ? "已保存" : saveState === "saving" ? "保存中…" : "未保存"}
        </button>
      ) : null}
      <button
        type="button"
        className="icon-button"
        title="打开 Markdown 文件（Ctrl/Cmd + O）"
        onClick={onOpenExternal}
      >
        <FileInput size={17} />
      </button>
      <button
        type="button"
        className="icon-button"
        title="打开文件夹作为工作区（Ctrl/Cmd + Shift + O）"
        onClick={onOpenWorkspace}
      >
        <FolderOpen size={17} />
      </button>
      <button
        type="button"
        className={`icon-button${outlineOpen ? " is-active" : ""}`}
        title="切换大纲"
        disabled={!activeDoc}
        onClick={onToggleOutline}
      >
        <ListTree size={17} />
      </button>
      <button
        type="button"
        className="icon-button"
        title="设置"
        onClick={onOpenSettings}
      >
        <Settings size={17} />
      </button>
      {tauri && !mac ? (
        <div className="window-controls">
          <button type="button" className="window-control" title="最小化" onClick={minimizeWindow}>
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="window-control"
            title={maximized ? "还原" : "最大化"}
            onClick={() => void toggleMaximizeWindow()}
          >
            {maximized ? <Copy size={12} /> : <Square size={11} />}
          </button>
          <button
            type="button"
            className="window-control window-control--close"
            title="关闭"
            onClick={closeWindow}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
    </header>
  );
}
