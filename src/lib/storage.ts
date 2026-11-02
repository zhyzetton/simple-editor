import {convertFileSrc, invoke} from "@tauri-apps/api/core";
import {open as openDialog} from "@tauri-apps/plugin-dialog";
import {revealItemInDir} from "@tauri-apps/plugin-opener";
import welcomeMd from "../assets/welcome.md?raw";
import type {
  EntryNode,
  ExternalFileDoc,
  FileDoc,
  FileMeta,
  WorkspaceInfo,
} from "../types";

const TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const MOCK_KEY = "md-editor:mock-workspace:v2";
const MOCK_ROOT = "C:/Users/Link/Documents/示例工作区";
const MOCK_TEMP_ROOT = "C:/Users/Link/Documents";

let assetBaseDir = "";

export function isTauri(): boolean {
  return TAURI;
}

export function setAssetBaseDir(dir: string) {
  assetBaseDir = dir;
}

function joinPath(dir: string, relative: string): string {
  if (!dir) {
    return relative;
  }
  const separator = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${separator}${relative.replace(/\//g, separator)}`;
}

export function resolveAssetSrc(src: string): string {
  if (!src) {
    return src;
  }
  if (/^(https?:|data:|blob:|file:|asset:)/i.test(src) || src.startsWith("#")) {
    return src;
  }
  if (!TAURI) {
    return src;
  }
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("/") || src.startsWith("\\\\")) {
    return convertFileSrc(src);
  }
  if (!assetBaseDir) {
    return src;
  }
  return convertFileSrc(joinPath(assetBaseDir, src));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < buffer.length; index += chunk) {
    binary += String.fromCharCode(...buffer.subarray(index, index + chunk));
  }
  return btoa(binary);
}

interface AssetInfo {
  src: string;
  absolutePath: string;
}

export async function saveAsset(assetDir: string, file: File): Promise<string> {
  if (TAURI) {
    const info = await invoke<AssetInfo>("save_asset", {
      targetDir: assetDir,
      fileName: file.name || "image.png",
      dataBase64: await fileToBase64(file),
    });
    return info.src;
  }
  return readFileAsDataUrl(file);
}

export async function pickImage(assetDir: string): Promise<string | null> {
  if (TAURI) {
    const picked = await openDialog({
      multiple: false,
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
        },
      ],
    });
    if (!picked || Array.isArray(picked)) {
      return null;
    }
    const info = await invoke<AssetInfo>("import_asset", {
      targetDir: assetDir,
      sourcePath: picked,
    });
    return info.src;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await readFileAsDataUrl(file) : null);
    };
    input.click();
  });
}

export async function importAssetPath(assetDir: string, sourcePath: string): Promise<string> {
  const info = await invoke<AssetInfo>("import_asset", {targetDir: assetDir, sourcePath});
  return info.src;
}

export async function pickFolderPath(): Promise<string | null> {
  if (!TAURI) {
    return MOCK_ROOT;
  }
  const picked = await openDialog({
    directory: true,
    multiple: false,
    title: "打开文件夹作为工作区",
  });
  return typeof picked === "string" ? picked : null;
}

export async function pickMarkdownPath(): Promise<string | null> {
  if (!TAURI) {
    return pickMockMarkdownPath();
  }
  const picked = await openDialog({
    multiple: false,
    title: "打开 Markdown 文件",
    filters: [{name: "Markdown", extensions: ["md", "markdown"]}],
  });
  return typeof picked === "string" ? picked : null;
}

export async function revealInFolder(path: string): Promise<void> {
  if (!TAURI || !path) {
    return;
  }
  await revealItemInDir(path);
}

export async function getWorkspace(): Promise<WorkspaceInfo | null> {
  if (TAURI) {
    return invoke<WorkspaceInfo | null>("get_workspace");
  }
  return mockWorkspaceInfo();
}

export async function openWorkspace(path: string): Promise<WorkspaceInfo> {
  if (TAURI) {
    return invoke<WorkspaceInfo>("open_workspace", {path});
  }
  void path;
  return mockWorkspaceInfo();
}

export async function listTree(): Promise<EntryNode[]> {
  if (TAURI) {
    return invoke<EntryNode[]>("list_tree");
  }
  return mockTree();
}

export async function readWorkspaceFile(path: string): Promise<FileDoc> {
  if (TAURI) {
    return invoke<FileDoc>("read_workspace_file", {path});
  }
  return mockReadWorkspaceFile(path);
}

export async function saveWorkspaceFile(
  path: string,
  content: string,
  frontmatter: string | null,
): Promise<FileMeta> {
  if (TAURI) {
    return invoke<FileMeta>("save_workspace_file", {path, content, frontmatter});
  }
  return mockSaveWorkspaceFile(path, content, frontmatter);
}

export async function createWorkspaceFile(
  parent: string | null,
  name: string,
): Promise<FileDoc> {
  if (TAURI) {
    return invoke<FileDoc>("create_workspace_file", {parent, name});
  }
  return mockCreateFile(parent, name);
}

export async function createWorkspaceFolder(
  parent: string | null,
  name: string,
): Promise<string> {
  if (TAURI) {
    return invoke<string>("create_workspace_folder", {parent, name});
  }
  return mockCreateFolder(parent, name);
}

export async function renameWorkspaceFile(path: string, newName: string): Promise<FileMeta> {
  if (TAURI) {
    return invoke<FileMeta>("rename_workspace_file", {path, newName});
  }
  return mockRenameWorkspaceFile(path, newName);
}

export async function deleteWorkspaceFile(path: string): Promise<void> {
  if (TAURI) {
    await invoke("delete_workspace_file", {path});
    return;
  }
  mockDeleteWorkspaceFile(path);
}

export async function readExternalFile(path: string): Promise<ExternalFileDoc> {
  if (TAURI) {
    return invoke<ExternalFileDoc>("read_external_file", {path});
  }
  return mockReadExternalFile(path);
}

export async function saveExternalFile(
  path: string,
  content: string,
  frontmatter: string | null,
): Promise<FileMeta> {
  if (TAURI) {
    return invoke<FileMeta>("save_external_file", {path, content, frontmatter});
  }
  return mockSaveExternalFile(path, content, frontmatter);
}

export async function renameExternalFile(path: string, newName: string): Promise<FileMeta> {
  if (TAURI) {
    return invoke<FileMeta>("rename_external_file", {path, newName});
  }
  return mockRenameExternalFile(path, newName);
}

/* ------------------------------------------------------------------ */
/* Browser mock                                                        */
/* ------------------------------------------------------------------ */

interface MockStored {
  content: string;
  frontmatter: string | null;
  updatedAt: number;
}

interface MockStore {
  workspace: {
    name: string;
    path: string;
    folders: string[];
    files: Record<string, MockStored>;
    trash: string[];
  };
  external: Record<string, MockStored>;
}

function splitMockFrontmatter(raw: string): {frontmatter: string | null; content: string} {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (normalized.startsWith("---\n")) {
    const end = normalized.indexOf("\n---\n", 4);
    if (end !== -1) {
      return {
        frontmatter: normalized.slice(4, end),
        content: normalized.slice(end + 5),
      };
    }
  }
  return {frontmatter: null, content: normalized};
}

function mockSeed(): MockStore {
  const now = Date.now();
  return {
    workspace: {
      name: "示例工作区",
      path: MOCK_ROOT,
      folders: ["指南", "指南/进阶", "归档"],
      files: {
        "欢迎使用.md": {
          content: welcomeMd,
          frontmatter: null,
          updatedAt: now,
        },
        "指南/编辑技巧.md": {
          content: `## 文件树

左侧现在是一个真正的文件夹工作区：

- 点击文件夹展开或收起
- 右键文件夹可以在里面新建文件或文件夹
- 文件名就是文档标题，可直接在上方修改

## 外部文件

顶部「打开文件」可以打开工作区之外的 Markdown 文件，它会出现在左侧的「外部文件」区。

> 所有内容仍然是纯 Markdown，不会写入额外的元数据。`,
          frontmatter: null,
          updatedAt: now,
        },
        "指南/进阶/数学与代码.md": {
          content: `### 公式

行内公式：$e^{i\\pi} + 1 = 0$

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

### 代码

\`\`\`ts
const notes = await listTree();
console.log(notes.length);
\`\`\``,
          frontmatter: null,
          updatedAt: now,
        },
      },
      trash: [],
    },
    external: {},
  };
}

function loadMock(): MockStore {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (!raw) {
      const seed = mockSeed();
      localStorage.setItem(MOCK_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as MockStore;
  } catch {
    const seed = mockSeed();
    localStorage.setItem(MOCK_KEY, JSON.stringify(seed));
    return seed;
  }
}

function saveMock(store: MockStore) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(store));
}

function mockWorkspaceInfo(): WorkspaceInfo {
  const store = loadMock();
  return {path: store.workspace.path, name: store.workspace.name};
}

function pathTitle(path: string): string {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  return name.replace(/\.(md|markdown)$/i, "");
}

function parentOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function mockAbsDir(relDir: string): string {
  const store = loadMock();
  return relDir ? `${store.workspace.path}/${relDir}` : store.workspace.path;
}

function mockWorkspaceDoc(rel: string, stored: MockStored): FileDoc {
  return {
    path: rel,
    title: pathTitle(rel),
    dir: mockAbsDir(parentOf(rel)),
    modifiedAt: stored.updatedAt,
    content: stored.content,
    frontmatter: stored.frontmatter,
  };
}

function validateMockName(raw: string, extension: string | null): string {
  let name = raw.trim();
  if (!name) {
    throw new Error("名称不能为空");
  }
  if (name === "." || name === "..") {
    throw new Error("名称无效");
  }
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name)) {
    throw new Error("名称包含非法字符");
  }
  if (/[. ]$/.test(name)) {
    throw new Error("名称不能以点或空格结尾");
  }
  if (extension) {
    const lower = name.toLowerCase();
    if (!lower.endsWith(".md") && !lower.endsWith(".markdown")) {
      name += extension;
    }
  }
  return name;
}

function mockPathExists(store: MockStore, rel: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(store.workspace.files, rel) ||
    store.workspace.folders.includes(rel)
  );
}

function mockUniquePath(store: MockStore, parent: string, name: string): string {
  const join = (value: string) => (parent ? `${parent}/${value}` : value);
  if (!mockPathExists(store, join(name))) {
    return join(name);
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 2; index < 1000; index++) {
    const candidate = join(`${stem} ${index}${extension}`);
    if (!mockPathExists(store, candidate)) {
      return candidate;
    }
  }
  return join(`${stem}-${Date.now().toString(36)}${extension}`);
}

function mockReadWorkspaceFile(path: string): FileDoc {
  const store = loadMock();
  const stored = store.workspace.files[path];
  if (!stored) {
    throw new Error("文件已被移动或删除");
  }
  return mockWorkspaceDoc(path, stored);
}

function mockSaveWorkspaceFile(
  path: string,
  content: string,
  frontmatter: string | null,
): FileMeta {
  const store = loadMock();
  const stored = store.workspace.files[path];
  if (!stored) {
    throw new Error("文件已被移动或删除");
  }
  stored.content = content;
  stored.frontmatter = frontmatter;
  stored.updatedAt = Date.now();
  saveMock(store);
  return {
    path,
    title: pathTitle(path),
    dir: mockAbsDir(parentOf(path)),
    modifiedAt: stored.updatedAt,
  };
}

function mockCreateFile(parent: string | null, name: string): FileDoc {
  const store = loadMock();
  const parentDir = parent ?? "";
  if (parentDir && !store.workspace.folders.includes(parentDir)) {
    throw new Error("目标文件夹不存在");
  }
  const fileName = validateMockName(name, ".md");
  const rel = mockUniquePath(store, parentDir, fileName);
  const stored: MockStored = {content: "", frontmatter: null, updatedAt: Date.now()};
  store.workspace.files[rel] = stored;
  saveMock(store);
  return mockWorkspaceDoc(rel, stored);
}

function mockCreateFolder(parent: string | null, name: string): string {
  const store = loadMock();
  const parentDir = parent ?? "";
  if (parentDir && !store.workspace.folders.includes(parentDir)) {
    throw new Error("目标文件夹不存在");
  }
  const folderName = validateMockName(name, null);
  const rel = mockUniquePath(store, parentDir, folderName);
  store.workspace.folders.push(rel);
  saveMock(store);
  return rel;
}

function mockRenameWorkspaceFile(path: string, newName: string): FileMeta {
  const store = loadMock();
  const stored = store.workspace.files[path];
  if (!stored) {
    throw new Error("文件已被移动或删除");
  }
  const dot = path.lastIndexOf(".");
  const extension = dot > 0 ? path.slice(dot) : ".md";
  const fileName = validateMockName(newName, extension);
  const parent = parentOf(path);
  const target = parent ? `${parent}/${fileName}` : fileName;
  if (target !== path) {
    if (mockPathExists(store, target)) {
      throw new Error("同名文件已存在");
    }
    delete store.workspace.files[path];
    store.workspace.files[target] = stored;
    stored.updatedAt = Date.now();
    saveMock(store);
  }
  return {
    path: target,
    title: pathTitle(target),
    dir: mockAbsDir(parent),
    modifiedAt: stored.updatedAt,
  };
}

function mockDeleteWorkspaceFile(path: string) {
  const store = loadMock();
  if (!store.workspace.files[path]) {
    return;
  }
  delete store.workspace.files[path];
  store.workspace.trash.push(path);
  saveMock(store);
}

function mockReadExternalFile(path: string): ExternalFileDoc {
  const store = loadMock();
  const normalized = path.replace(/\\/g, "/");
  const root = store.workspace.path.replace(/[/\\]+$/, "");
  if (normalized.startsWith(`${root}/`)) {
    const rel = normalized.slice(root.length + 1);
    const inWorkspace = store.workspace.files[rel];
    if (inWorkspace) {
      return {...mockWorkspaceDoc(rel, inWorkspace), path: normalized, workspacePath: rel};
    }
  }
  const stored = store.external[path];
  if (!stored) {
    throw new Error("文件已被移动或删除");
  }
  const slash = path.lastIndexOf("/");
  return {
    path,
    title: pathTitle(path),
    dir: slash > 0 ? path.slice(0, slash) : MOCK_TEMP_ROOT,
    modifiedAt: stored.updatedAt,
    content: stored.content,
    frontmatter: stored.frontmatter,
    workspacePath: null,
  };
}

function mockSaveExternalFile(
  path: string,
  content: string,
  frontmatter: string | null,
): FileMeta {
  const store = loadMock();
  const stored = store.external[path];
  if (!stored) {
    throw new Error("文件已被移动或删除");
  }
  stored.content = content;
  stored.frontmatter = frontmatter;
  stored.updatedAt = Date.now();
  saveMock(store);
  const slash = path.lastIndexOf("/");
  return {
    path,
    title: pathTitle(path),
    dir: slash > 0 ? path.slice(0, slash) : MOCK_TEMP_ROOT,
    modifiedAt: stored.updatedAt,
  };
}

function mockRenameExternalFile(path: string, newName: string): FileMeta {
  const store = loadMock();
  const stored = store.external[path];
  if (!stored) {
    throw new Error("文件已被移动或删除");
  }
  const dot = path.lastIndexOf(".");
  const extension = dot > 0 ? path.slice(dot) : ".md";
  const fileName = validateMockName(newName, extension);
  const slash = path.lastIndexOf("/");
  const parent = slash > 0 ? path.slice(0, slash) : MOCK_TEMP_ROOT;
  const target = `${parent}/${fileName}`;
  if (target !== path) {
    if (store.external[target]) {
      throw new Error("同名文件已存在");
    }
    delete store.external[path];
    store.external[target] = stored;
    stored.updatedAt = Date.now();
    saveMock(store);
  }
  return {
    path: target,
    title: pathTitle(target),
    dir: parent,
    modifiedAt: stored.updatedAt,
  };
}

function pickMockMarkdownPath(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      const parsed = splitMockFrontmatter(await file.text());
      const store = loadMock();
      let path = `${MOCK_TEMP_ROOT}/${file.name}`;
      if (store.external[path] || store.workspace.files[path]) {
        const base = file.name.replace(/\.(md|markdown)$/i, "");
        const extension = file.name.match(/\.(md|markdown)$/i)?.[0] ?? ".md";
        let index = 2;
        while (store.external[`${MOCK_TEMP_ROOT}/${base} ${index}${extension}`]) {
          index += 1;
        }
        path = `${MOCK_TEMP_ROOT}/${base} ${index}${extension}`;
      }
      store.external[path] = {
        content: parsed.content,
        frontmatter: parsed.frontmatter,
        updatedAt: Date.now(),
      };
      saveMock(store);
      resolve(path);
    };
    input.click();
  });
}

function mockTree(): EntryNode[] {
  const store = loadMock();
  interface MutableNode extends EntryNode {
    children: MutableNode[];
  }
  const folders = new Map<string, MutableNode>();
  const ensureFolder = (path: string): MutableNode => {
    const existing = folders.get(path);
    if (existing) {
      return existing;
    }
    const node: MutableNode = {
      name: path.split("/").pop() ?? path,
      path,
      isDir: true,
      modifiedAt: 0,
      children: [],
    };
    folders.set(path, node);
    const parent = parentOf(path);
    if (parent) {
      ensureFolder(parent).children.push(node);
    }
    return node;
  };
  for (const folder of store.workspace.folders) {
    ensureFolder(folder);
  }
  const roots: MutableNode[] = [];
  for (const [path, node] of folders) {
    if (!parentOf(path)) {
      roots.push(node);
    }
  }
  for (const [path, stored] of Object.entries(store.workspace.files)) {
    const node: MutableNode = {
      name: path.split("/").pop() ?? path,
      path,
      isDir: false,
      modifiedAt: stored.updatedAt,
      children: [],
    };
    const parent = parentOf(path);
    if (parent) {
      ensureFolder(parent).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: MutableNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      const left = a.name.toLowerCase();
      const right = b.name.toLowerCase();
      return left < right ? -1 : left > right ? 1 : 0;
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}
