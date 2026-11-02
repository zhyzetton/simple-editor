import type {DocStats, SaveState} from "../types";

interface StatusBarProps {
  stats: DocStats;
  saveState: SaveState;
}

export function StatusBar({stats, saveState}: StatusBarProps) {
  const saveText =
    saveState === "saved" ? "已保存" : saveState === "saving" ? "保存中…" : "未保存";

  return (
    <footer className="status-bar">
      <span>{stats.chars} 字</span>
      <span className="status-bar__dot" />
      <span>{stats.blocks} 个块</span>
      <span className="status-bar__spacer" />
      <span className="status-bar__save" data-state={saveState}>
        {saveText}
      </span>
      <span className="status-bar__dot" />
      <span>Markdown · 本地文件</span>
    </footer>
  );
}
