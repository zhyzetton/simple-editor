import {Extension, InputRule, markInputRule} from "@tiptap/core";
import type {Editor as TiptapEditor} from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import Placeholder from "@tiptap/extension-placeholder";
import Strike from "@tiptap/extension-strike";
import {Table, TableCell, TableHeader, TableRow} from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import type {EditorView} from "@tiptap/pm/view";
import {EditorContent, ReactNodeViewRenderer, useEditor} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {common, createLowlight} from "lowlight";
import {useEffect, useMemo, useRef, useState} from "react";
import {MathBlock, MathInline, insertMathNode} from "../editor/math";
import {docToMarkdown, markdownToHTML} from "../editor/markdown";
import {createSlashCommand} from "../editor/slash";
import {FluidLastTableColumn} from "../editor/tableLayout";
import {insertImageAt} from "../lib/insertImage";
import {openExternal} from "../lib/links";
import {
  importAssetPath,
  isTauri,
  resolveAssetSrc,
  saveAsset,
  setAssetBaseDir,
} from "../lib/storage";
import type {DocStats, OutlineItem} from "../types";
import {BubbleToolbar} from "./BubbleToolbar";
import {CodeBlockView} from "./CodeBlockView";
import {ImageToolbar} from "./ImageToolbar";
import {MathDialog} from "./MathDialog";

const lowlight = createLowlight(common);

function looseMarkFinder(pattern: RegExp, blockedPrev: string[] = []) {
  return (text: string) => {
    const match = pattern.exec(text);
    if (!match) {
      return null;
    }
    if (match.index > 0) {
      const previous = text[match.index - 1];
      if (previous === "\\" || blockedPrev.includes(previous)) {
        return null;
      }
    }
    return {index: match.index, text: match[0], replaceWith: match[1]};
  };
}

const LooseBold = Bold.extend({
  addInputRules() {
    return [
      markInputRule({
        find: looseMarkFinder(/\*\*(?!\s+\*\*)([^*\n]+)\*\*(?!\s+\*\*)$/, ["*"]),
        type: this.type,
      }),
    ];
  },
});

const LooseItalic = Italic.extend({
  addInputRules() {
    return [
      markInputRule({
        find: looseMarkFinder(/\*(?!\s+\*)([^*\n]+)\*(?!\s+\*)$/, ["*"]),
        type: this.type,
      }),
    ];
  },
});

const LooseStrike = Strike.extend({
  addInputRules() {
    return [
      markInputRule({
        find: looseMarkFinder(/~~(?!\s+~~)([^~\n]+)~~(?!\s+~~)$/, ["~"]),
        type: this.type,
      }),
    ];
  },
});

const LooseHighlight = Highlight.extend({
  addInputRules() {
    return [
      markInputRule({
        find: looseMarkFinder(/==(?!\s+==)([^=\n]+)==(?!\s+==)$/, ["="]),
        type: this.type,
      }),
    ];
  },
});

const LinkInput = Extension.create({
  name: "markdownLinkInput",
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^[\]\n]+)\]\(([^()\s]+)\)$/,
        handler: ({state, range, match}) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === "codeBlock") {
            return;
          }
          const text = match[1] ?? "";
          const href = match[2] ?? "";
          if (!text || !href) {
            return;
          }
          const linkType = state.schema.marks.link;
          if (!linkType) {
            return;
          }
          state.tr.replaceWith(
            range.from,
            range.to,
            state.schema.text(text, [linkType.create({href})]),
          );
        },
      }),
    ];
  },
});

const ExtendedCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

const AssetImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("src"),
        renderHTML: (attributes: Record<string, unknown>) => ({
          src: resolveAssetSrc(String(attributes.src ?? "")),
        }),
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = Number.parseInt(element.getAttribute("width") ?? "", 10);
          return value > 0 ? value : null;
        },
      },
      align: {
        default: "left",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-align") === "center" ? "center" : "left",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-align": attributes.align,
        }),
      },
    };
  },
});

async function insertFilesIntoView(
  view: EditorView,
  files: File[],
  assetDir: string,
  pos?: number,
) {
  for (const file of files) {
    const src = await saveAsset(assetDir, file);
    const node = view.state.schema.nodes.image.create({src, alt: file.name.replace(/\.[^.]+$/, "")});
    const transaction =
      typeof pos === "number"
        ? view.state.tr.insert(Math.min(pos, view.state.doc.content.size), node)
        : view.state.tr.replaceSelectionWith(node);
    view.dispatch(transaction.scrollIntoView());
  }
}

function collectOutline(editor: TiptapEditor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      items.push({
        id: `heading-${pos}`,
        level: Number(node.attrs.level) || 1,
        text: node.textContent || "未命名标题",
        pos,
      });
    }
  });
  return items;
}

function collectStats(editor: TiptapEditor): DocStats {
  return {
    chars: editor.getText().replace(/\s/g, "").length,
    blocks: editor.state.doc.childCount,
  };
}

interface EditorProps {
  initialMarkdown: string;
  onContentChange: (markdown: string) => void;
  onOutlineChange: (items: OutlineItem[]) => void;
  onStatsChange: (stats: DocStats) => void;
  editorRef: React.MutableRefObject<TiptapEditor | null>;
  assetDir: string;
  onOpenLink: (href: string) => Promise<boolean>;
}

export function Editor({
  initialMarkdown,
  onContentChange,
  onOutlineChange,
  onStatsChange,
  editorRef,
  assetDir,
  onOpenLink,
}: EditorProps) {
  setAssetBaseDir(assetDir);
  const assetDirRef = useRef(assetDir);
  assetDirRef.current = assetDir;
  const openLinkRef = useRef(onOpenLink);
  openLinkRef.current = onOpenLink;
  const [initialHtml] = useState(() => markdownToHTML(initialMarkdown));
  const [mathRequest, setMathRequest] = useState<{mode: "inline" | "block"; pos: number} | null>(
    null,
  );

  const contentCallback = useRef(onContentChange);
  const outlineCallback = useRef(onOutlineChange);
  const statsCallback = useRef(onStatsChange);
  contentCallback.current = onContentChange;
  outlineCallback.current = onOutlineChange;
  statsCallback.current = onStatsChange;

  const openMathRef = useRef<(mode: "inline" | "block", pos: number) => void>(() => {});
  openMathRef.current = (mode, pos) => setMathRequest({mode, pos});

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        bold: false,
        italic: false,
        strike: false,
        // 关掉自动补尾段落：否则文档以代码块/表格/列表结尾时，点大纲这种纯选区事务也会改动文档，
        // 被脏检查误判成“编辑过”。需要空段落时用块手柄或 gap cursor。
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {rel: "noopener noreferrer"},
        },
      }),
      LooseBold,
      LooseItalic,
      LooseStrike,
      LinkInput,
      TaskList,
      TaskItem.configure({nested: true}),
      Table.configure({
        resizable: true,
        allowTableNodeSelection: true,
        // 和 CSS 里 th/td 的 min-width 对齐，否则列拖到最窄时边界和鼠标会错位
        cellMinWidth: 40,
        // 最外侧那条边只会改变整张表的宽度，不给手柄
        lastColumnResizable: false,
      }),
      FluidLastTableColumn,
      TableRow,
      TableHeader,
      TableCell,
      AssetImage.configure({
        inline: false,
        allowBase64: true,
        resize: {
          enabled: true,
          minWidth: 48,
          minHeight: 48,
          alwaysPreserveAspectRatio: true,
        },
      }),
      LooseHighlight.configure({multicolor: false}),
      ExtendedCodeBlock.configure({
        lowlight,
        defaultLanguage: null,
        enableTabIndentation: true,
        tabSize: 4,
      }),
      Placeholder.configure({placeholder: "输入 / 唤起命令"}),
      MathInline,
      MathBlock,
      createSlashCommand({
        openMath: (mode, pos) => openMathRef.current(mode, pos),
        insertImage: (current, pos) => {
          void insertImageAt(current, assetDirRef.current, pos);
        },
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: initialHtml,
    editorProps: {
      attributes: {
        class: "tiptap",
        spellcheck: "false",
        autocapitalize: "off",
      },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (files.length === 0) {
          return false;
        }
        event.preventDefault();
        void insertFilesIntoView(view, files, assetDirRef.current);
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) {
          return false;
        }
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (files.length === 0) {
          return false;
        }
        event.preventDefault();
        const pos = view.posAtCoords({left: event.clientX, top: event.clientY})?.pos;
        void insertFilesIntoView(view, files, assetDirRef.current, pos);
        return true;
      },
      handleClick(_view, _pos, event) {
        const anchor = (event.target as HTMLElement | null)?.closest("a");
        if (anchor && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          const href = anchor.getAttribute("href") || "";
          void openLinkRef.current(href).then((handled) => {
            if (!handled) {
              void openExternal(href);
            }
          });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({editor: current}) => {
      contentCallback.current(docToMarkdown(current.state.doc));
      outlineCallback.current(collectOutline(current));
      statsCallback.current(collectStats(current));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    editorRef.current = editor;
    outlineCallback.current(collectOutline(editor));
    statsCallback.current(collectStats(editor));
    return () => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor || !isTauri()) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/webview").then(({getCurrentWebview}) => {
      void getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type !== "drop") {
            return;
          }
          const images = event.payload.paths.filter((path) =>
            /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(path),
          );
          if (images.length === 0) {
            return;
          }
          void (async () => {
            for (const path of images) {
              const src = await importAssetPath(assetDirRef.current, path);
              editor
                .chain()
                .focus()
                .insertContent({type: "image", attrs: {src, alt: ""}})
                .run();
            }
          })();
        })
        .then((stop) => {
          if (disposed) {
            stop();
          } else {
            unlisten = stop;
          }
        });
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="editor-area">
      <EditorContent editor={editor} />
      <BubbleToolbar
        editor={editor}
        onInsertMath={() =>
          setMathRequest({mode: "inline", pos: editor.state.selection.from})
        }
      />
      <ImageToolbar editor={editor} />
      <MathDialog
        open={mathRequest !== null}
        mode={mathRequest?.mode ?? "inline"}
        onCancel={() => setMathRequest(null)}
        onConfirm={(latex) => {
          if (mathRequest) {
            insertMathNode(editor, mathRequest.mode, latex, mathRequest.pos);
          }
          setMathRequest(null);
        }}
      />
    </div>
  );
}
