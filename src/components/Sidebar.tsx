import {
  ChevronRight,
  FileInput,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type React from "react";
import {useEffect, useMemo, useRef, useState} from "react";
import {ancestorsOf, entryTitle} from "../lib/paths";
import {revealInFolder} from "../lib/storage";
import type {EntryNode, OpenDoc, WorkspaceInfo} from "../types";
import {ConfirmDialog} from "./ConfirmDialog";
import type {ContextMenuItem} from "./ContextMenu";
import {ContextMenu} from "./ContextMenu";

interface SidebarProps {
  workspace: WorkspaceInfo | null;
  tree: EntryNode[];
  activeDoc: OpenDoc | null;
  revealRequest: {path: string; nonce: number} | null;
  loading: boolean;
  onOpenWorkspace: () => void;
  onOpenExternal: () => void;
  onOpenFile: (path: string, preview: boolean) => void;
  onRequestCreate: (type: "file" | "folder", parent: string | null) => void;
  onDeleteFile: (path: string) => void;
  onRefresh: () => void;
}

function filterNodes(nodes: EntryNode[], query: string): EntryNode[] {
  if (!query) {
    return nodes;
  }
  const result: EntryNode[] = [];
  for (const node of nodes) {
    const matches = `${node.name} ${entryTitle(node.name)}`.toLowerCase().includes(query);
    if (node.isDir) {
      const children = filterNodes(node.children, query);
      if (matches || children.length > 0) {
        result.push({...node, children});
      }
    } else if (matches) {
      result.push(node);
    }
  }
  return result;
}

export function Sidebar({
  workspace,
  tree,
  activeDoc,
  revealRequest,
  loading,
  onOpenWorkspace,
  onOpenExternal,
  onOpenFile,
  onRequestCreate,
  onDeleteFile,
  onRefresh,
}: SidebarProps) {
  const [filter, setFilter] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{path: string; title: string} | null>(null);

  useEffect(() => {
    setFilter("");
    if (!workspace) {
      setExpanded(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(`md-editor:expanded:${workspace.path}`);
      setExpanded(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setExpanded(new Set());
    }
  }, [workspace]);

  useEffect(() => {
    if (!workspace) {
      return;
    }
    localStorage.setItem(
      `md-editor:expanded:${workspace.path}`,
      JSON.stringify(Array.from(expanded)),
    );
  }, [expanded, workspace]);

  const expandPaths = (paths: string[]) => {
    if (paths.length === 0) {
      return;
    }
    setExpanded((current) => {
      const next = new Set(current);
      paths.forEach((path) => next.add(path));
      return next;
    });
  };

  useEffect(() => {
    if (activeDoc?.kind === "workspace") {
      expandPaths(ancestorsOf(activeDoc.path));
    }
  }, [activeDoc?.kind, activeDoc?.path]);

  useEffect(() => {
    if (!revealRequest) {
      return;
    }
    setFilter("");
    expandPaths([...ancestorsOf(revealRequest.path), revealRequest.path]);
  }, [revealRequest]);

  const query = filter.trim().toLowerCase();
  const visibleTree = useMemo(() => filterNodes(tree, query), [tree, query]);
  const searching = query.length > 0;
  const activeWorkspacePath =
    activeDoc?.kind === "workspace" ? activeDoc.path : null;

  useEffect(() => {
    const target = activeWorkspacePath ?? revealRequest?.path;
    if (!target) {
      return;
    }
    const timer = window.setTimeout(() => {
      const row = listRef.current?.querySelector<HTMLElement>(
        `.tree-row[data-path="${CSS.escape(target)}"]`,
      );
      row?.scrollIntoView({block: "nearest"});
    }, 60);
    return () => window.clearTimeout(timer);
  }, [activeWorkspacePath, expanded, revealRequest]);

  const openRowMenu = (
    event: React.MouseEvent,
    items: ContextMenuItem[],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({x: event.clientX, y: event.clientY, items});
  };

  const folderMenu = (folder: string): ContextMenuItem[] => [
    {
      label: "新建文件",
      icon: FilePlus,
      onSelect: () => onRequestCreate("file", folder),
    },
    {
      label: "新建文件夹",
      icon: FolderPlus,
      onSelect: () => onRequestCreate("folder", folder),
    },
    {
      label: "在资源管理器中显示",
      icon: FolderOpen,
      onSelect: () => {
        if (!workspace) {
          return;
        }
        const separator = workspace.path.includes("\\") ? "\\" : "/";
        const abs = `${workspace.path.replace(/[\\/]+$/, "")}${separator}${folder.replace(/\//g, separator)}`;
        void revealInFolder(abs);
      },
    },
  ];

  const fileMenu = (node: EntryNode): ContextMenuItem[] => [
    {
      label: "删除",
      icon: Trash2,
      danger: true,
      onSelect: () => setPendingDelete({path: node.path, title: entryTitle(node.name)}),
    },
  ];

  const workspaceMenu = (): ContextMenuItem[] => [
    {label: "打开其他文件夹…", icon: FolderOpen, onSelect: onOpenWorkspace},
    {label: "打开文件…", icon: FileInput, onSelect: onOpenExternal},
    {label: "刷新文件树", icon: RefreshCw, onSelect: onRefresh},
  ];

  const moreButton = (items: ContextMenuItem[]) => (
    <button
      type="button"
      className="tree-row__more"
      title="更多操作"
      onClick={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setMenu({x: rect.left, y: rect.bottom + 4, items});
      }}
    >
      <MoreHorizontal size={14} />
    </button>
  );

  const renderNodes = (nodes: EntryNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      if (node.isDir) {
        const isExpanded = searching || expanded.has(node.path);
        return (
          <div key={`dir-${node.path}`}>
            <div
              className="tree-row tree-row--folder"
              data-path={node.path}
              style={{paddingLeft: `${8 + depth * 14}px`}}
              title={node.path}
              onClick={() => {
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(node.path)) {
                    next.delete(node.path);
                  } else {
                    next.add(node.path);
                  }
                  return next;
                });
              }}
              onContextMenu={(event) => openRowMenu(event, folderMenu(node.path))}
            >
              <span className={`tree-row__chevron${isExpanded ? " is-expanded" : ""}`}>
                <ChevronRight size={14} />
              </span>
              {isExpanded ? (
                <FolderOpen size={15} className="tree-row__icon" />
              ) : (
                <Folder size={15} className="tree-row__icon" />
              )}
              <span className="tree-row__name">{node.name}</span>
              {moreButton(folderMenu(node.path))}
            </div>
            {isExpanded ? (
              node.children.length === 0 ? (
                <div
                  className="tree-row__empty"
                  style={{paddingLeft: `${8 + (depth + 1) * 14 + 20}px`}}
                >
                  空文件夹
                </div>
              ) : (
                renderNodes(node.children, depth + 1)
              )
            ) : null}
          </div>
        );
      }
      const active = node.path === activeWorkspacePath;
      return (
        <div
          key={`file-${node.path}`}
          className={`tree-row tree-row--file${active ? " is-active" : ""}`}
          data-path={node.path}
          style={{paddingLeft: `${8 + depth * 14 + 20}px`}}
          title={node.path}
          onClick={() => onOpenFile(node.path, true)}
          onDoubleClick={() => onOpenFile(node.path, false)}
          onContextMenu={(event) => openRowMenu(event, fileMenu(node))}
        >
          <FileText size={15} className="tree-row__icon" />
          <span className="tree-row__name">{entryTitle(node.name)}</span>
          {moreButton(fileMenu(node))}
        </div>
      );
    });

  return (
    <aside className="sidebar">
      {workspace ? (
        <div className="sidebar__header">
          <span className="sidebar__workspace-icon">
            <FolderOpen size={15} />
          </span>
          <span className="sidebar__title" title={workspace.path}>
            {workspace.name}
          </span>
          <span className="sidebar__spacer" />
          <button
            type="button"
            className="icon-button sidebar__action"
            title="新建文件"
            onClick={() => onRequestCreate("file", null)}
          >
            <FilePlus size={15} />
          </button>
          <button
            type="button"
            className="icon-button sidebar__action"
            title="新建文件夹"
            onClick={() => onRequestCreate("folder", null)}
          >
            <FolderPlus size={15} />
          </button>
          <button
            type="button"
            className="icon-button sidebar__action"
            title="工作区菜单"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({x: rect.left - 120, y: rect.bottom + 4, items: workspaceMenu()});
            }}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      ) : (
        <div className="sidebar__header">
          <span className="sidebar__title">未打开工作区</span>
        </div>
      )}

      {workspace ? (
        <div className="sidebar__search">
          <Search size={14} />
          <input
            value={filter}
            placeholder="搜索文件"
            spellCheck={false}
            onChange={(event) => setFilter(event.target.value)}
          />
          {filter ? (
            <button
              type="button"
              className="icon-button"
              title="清除搜索"
              onClick={() => setFilter("")}
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      ) : null}

      {workspace ? (
        <div className="sidebar__list" ref={listRef}>
          {loading ? (
            <div className="sidebar__empty">正在读取文件树…</div>
          ) : tree.length === 0 ? (
            <div className="sidebar__empty">
              <span>这个文件夹里还没有 Markdown 文件</span>
              <button
                type="button"
                className="button button--ghost sidebar__empty-button"
                onClick={() => onRequestCreate("file", null)}
              >
                新建文件
              </button>
            </div>
          ) : visibleTree.length === 0 ? (
            <div className="sidebar__empty">没有匹配的文件</div>
          ) : (
            renderNodes(visibleTree, 0)
          )}
        </div>
      ) : (
        <div className="sidebar__start">
          <div className="sidebar__start-icon">
            <FolderOpen size={22} />
          </div>
          <p>打开一个文件夹作为工作区，所有 Markdown 文件都会显示在这里。</p>
          <button type="button" className="button button--primary" onClick={onOpenWorkspace}>
            打开文件夹
          </button>
          <button type="button" className="button button--ghost" onClick={onOpenExternal}>
            打开文件
          </button>
        </div>
      )}

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__workspace"
          title={workspace?.path ?? "尚未打开工作区"}
          disabled={!workspace}
          onClick={() => {
            if (workspace) {
              void revealInFolder(workspace.path);
            }
          }}
        >
          <FolderOpen size={14} />
          <span>{workspace ? workspace.path : "本地 Markdown"}</span>
        </button>
        <span className="sidebar__version">v0.2.0</span>
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除文件"
        message={`确定删除「${pendingDelete?.title ?? ""}」吗？文件会被移动到工作区的 .trash 目录。`}
        confirmLabel="删除"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            onDeleteFile(pendingDelete.path);
          }
          setPendingDelete(null);
        }}
      />
    </aside>
  );
}
