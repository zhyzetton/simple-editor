import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileInput,
  FolderOpen,
  ListTree,
  Loader2,
  Moon,
  PanelLeft,
  Sun,
} from "lucide-react";
import type {OpenDoc, SaveState, Theme, WorkspaceInfo} from "../types";

interface TopBarProps {
  workspace: WorkspaceInfo | null;
  activeDoc: OpenDoc | null;
  saveState: SaveState;
  theme: Theme;
  outlineOpen: boolean;
  onToggleSidebar: () => void;
  onToggleOutline: () => void;
  onToggleTheme: () => void;
  onOpenWorkspace: () => void;
  onOpenExternal: () => void;
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
  theme,
  outlineOpen,
  onToggleSidebar,
  onToggleOutline,
  onToggleTheme,
  onOpenWorkspace,
  onOpenExternal,
}: TopBarProps) {
  const segments = breadcrumb(workspace, activeDoc);

  return (
    <header className="topbar">
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
        <span className={`topbar__save topbar__save--${saveState}`}>
          {saveState === "saved" ? (
            <CheckCircle2 size={14} />
          ) : saveState === "saving" ? (
            <Loader2 size={14} className="is-spinning" />
          ) : (
            <CircleDashed size={14} />
          )}
          {saveState === "saved" ? "已保存" : saveState === "saving" ? "保存中…" : "未保存"}
        </span>
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
      <button type="button" className="icon-button" title="切换主题" onClick={onToggleTheme}>
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
    </header>
  );
}
