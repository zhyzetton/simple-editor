export type DocKind = "workspace" | "external";

export interface WorkspaceInfo {
  path: string;
  name: string;
}

export interface EntryNode {
  name: string;
  path: string;
  isDir: boolean;
  modifiedAt: number;
  children: EntryNode[];
}

export interface FileMeta {
  path: string;
  title: string;
  dir: string;
  modifiedAt: number;
}

export interface FileDoc extends FileMeta {
  content: string;
  frontmatter: string | null;
}

export interface ExternalFileDoc extends FileDoc {
  workspacePath: string | null;
}

export interface OpenDoc extends FileDoc {
  id: string;
  kind: DocKind;
}

export type SaveState = "saved" | "saving" | "dirty";

export interface DocSaver {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

export type Theme =
  | "light"
  | "dark"
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "tokyo-night";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export interface DocStats {
  chars: number;
  blocks: number;
}

export type ToastKind = "info" | "error";

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}
