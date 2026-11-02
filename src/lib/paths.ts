import type {EntryNode} from "../types";

export function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function joinRel(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function entryTitle(name: string): string {
  return name.replace(/\.(md|markdown)$/i, "");
}

export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  const result: string[] = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    result.push(current);
  }
  return result;
}

export function hasMarkdownFiles(nodes: EntryNode[]): boolean {
  return nodes.some((node) => (node.isDir ? hasMarkdownFiles(node.children) : true));
}
