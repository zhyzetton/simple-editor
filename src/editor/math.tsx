import {InputRule, mergeAttributes, Node} from "@tiptap/core";
import type {Editor} from "@tiptap/core";
import {NodeViewWrapper, ReactNodeViewRenderer} from "@tiptap/react";
import type {NodeViewProps} from "@tiptap/react";
import katex from "katex";
import type React from "react";
import {useEffect, useMemo, useRef, useState} from "react";

function MathNodeView({node, updateAttributes, selected, editor, getPos, extension}: NodeViewProps) {
  const displayMode = extension.name === "mathBlock";
  const latex = String(node.attrs.latex ?? "");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(latex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(latex);
  }, [latex]);

  useEffect(() => {
    if (editing) {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.select();
    }
  }, [editing]);

  const html = useMemo(
    () =>
      katex.renderToString(latex || "\\text{空公式}", {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      }),
    [displayMode, latex],
  );

  const commit = () => {
    setEditing(false);
    const next = value.trim() || "\\text{空公式}";
    if (next !== latex) {
      updateAttributes({latex: next});
    }
  };

  const cancel = () => {
    setEditing(false);
    setValue(latex);
  };

  return (
    <NodeViewWrapper
      as={displayMode ? "div" : "span"}
      className={`math-node ${displayMode ? "math-node--block" : "math-node--inline"}${
        selected ? " is-selected" : ""
      }`}
      data-type={displayMode ? "block-math" : "inline-math"}
      contentEditable={false}
      title="双击编辑公式"
      onClick={() => {
        if (!editing) {
          const pos = getPos();
          if (typeof pos === "number") {
            editor.commands.setNodeSelection(pos);
          }
        }
      }}
      onDoubleClick={(event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {editing ? (
        <span
          className={`math-edit${displayMode ? " math-edit--block" : ""}`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            rows={displayMode ? 3 : 1}
            value={value}
            spellCheck={false}
            onChange={(event) => setValue(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commit();
              }
            }}
          />
        </span>
      ) : (
        <span className="math-render" dangerouslySetInnerHTML={{__html: html}} />
      )}
    </NodeViewWrapper>
  );
}

function latexAttributes() {
  return {
    latex: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-latex") ?? "",
      renderHTML: (attributes: Record<string, unknown>) => ({
        "data-latex": attributes.latex,
      }),
    },
  };
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: latexAttributes,
  parseHTML() {
    return [{tag: 'span[data-type="inline-math"]'}];
  },
  renderHTML({HTMLAttributes}) {
    return ["span", mergeAttributes(HTMLAttributes, {"data-type": "inline-math"})];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: (text: string) => {
          const match = /(^|[^$])\$([^$\n]+?)\$(?!\$)$/.exec(text);
          if (!match) {
            return null;
          }
          const offset = match[1] ? match[1].length : 0;
          return {
            index: match.index + offset,
            text: match[0].slice(offset),
            replaceWith: match[2],
          };
        },
        handler: ({state, range, match}) => {
          const latex = (match[1] ?? "").trim();
          if (!latex) {
            return;
          }
          state.tr.replaceWith(range.from, range.to, type.create({latex}));
        },
      }),
    ];
  },
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,
  addAttributes: latexAttributes,
  parseHTML() {
    return [{tag: 'div[data-type="block-math"]'}];
  },
  renderHTML({HTMLAttributes}) {
    return ["div", mergeAttributes(HTMLAttributes, {"data-type": "block-math"})];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: /^\$\$([^$\n]+?)\$\$$/,
        handler: ({state, range, match}) => {
          const latex = (match[1] ?? "").trim();
          if (!latex) {
            return;
          }
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name !== "paragraph") {
            return;
          }
          state.tr.replaceWith($from.before(), $from.after(), type.create({latex}));
        },
      }),
    ];
  },
});

export function insertMathNode(
  editor: Editor,
  mode: "inline" | "block",
  latex: string,
  pos?: number,
) {
  const type = mode === "inline" ? editor.schema.nodes.mathInline : editor.schema.nodes.mathBlock;
  if (!type) {
    return;
  }
  const node = type.create({latex});
  if (typeof pos === "number") {
    if (mode === "block") {
      const $pos = editor.state.doc.resolve(pos);
      if ($pos.parent.isTextblock && $pos.parent.content.size === 0) {
        editor
          .chain()
          .focus()
          .command(({tr}) => {
            tr.replaceWith($pos.before(), $pos.after(), node);
            return true;
          })
          .run();
        return;
      }
    }
    editor.chain().focus().insertContentAt(pos, node).run();
    return;
  }
  editor.chain().focus().insertContent(node).run();
}
