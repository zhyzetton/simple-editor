import type {Editor} from "@tiptap/core";
import {NodeSelection} from "@tiptap/pm/state";
import {BubbleMenu} from "@tiptap/react/menus";
import {useEditorState} from "@tiptap/react";
import {Bold, Code, Highlighter, Italic, Link2, Sigma, Strikethrough, Unlink} from "lucide-react";
import {useState} from "react";

interface BubbleToolbarProps {
  editor: Editor;
  onInsertMath: () => void;
}

export function BubbleToolbar({editor, onInsertMath}: BubbleToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");

  const active = useEditorState({
    editor,
    selector: ({editor}) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      highlight: editor.isActive("highlight"),
      link: editor.isActive("link"),
      href: (editor.getAttributes("link").href as string) || "",
    }),
  });

  const applyLink = () => {
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({href: value}).run();
    }
    setLinkOpen(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      className="bubble-menu"
      options={{placement: "bottom", offset: 8}}
      shouldShow={({state, editor: current}) => {
        if (state.selection.empty) {
          return false;
        }
        if (state.selection instanceof NodeSelection) {
          return false;
        }
        if (current.isActive("codeBlock")) {
          return false;
        }
        return true;
      }}
    >
      <button
        type="button"
        className={`bubble-menu__button${active.bold ? " is-active" : ""}`}
        title="加粗"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} />
      </button>
      <button
        type="button"
        className={`bubble-menu__button${active.italic ? " is-active" : ""}`}
        title="斜体"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} />
      </button>
      <button
        type="button"
        className={`bubble-menu__button${active.strike ? " is-active" : ""}`}
        title="删除线"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={15} />
      </button>
      <button
        type="button"
        className={`bubble-menu__button${active.code ? " is-active" : ""}`}
        title="行内代码"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={15} />
      </button>
      <button
        type="button"
        className={`bubble-menu__button${active.highlight ? " is-active" : ""}`}
        title="高亮"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter size={15} />
      </button>
      <span className="bubble-menu__divider" />
      <button
        type="button"
        className={`bubble-menu__button${active.link ? " is-active" : ""}`}
        title="链接"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setHref(active.link ? active.href : "");
          setLinkOpen((open) => !open);
        }}
      >
        <Link2 size={15} />
      </button>
      {active.link ? (
        <button
          type="button"
          className="bubble-menu__button"
          title="移除链接"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink size={15} />
        </button>
      ) : null}
      <button
        type="button"
        className="bubble-menu__button"
        title="行内公式"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onInsertMath}
      >
        <Sigma size={15} />
      </button>
      {linkOpen ? (
        <form
          className="bubble-menu__link"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <input
            autoFocus
            value={href}
            placeholder="粘贴链接后回车"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setLinkOpen(false);
              }
            }}
          />
        </form>
      ) : null}
    </BubbleMenu>
  );
}
