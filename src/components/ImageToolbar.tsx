import type {Editor} from "@tiptap/core";
import {NodeSelection} from "@tiptap/pm/state";
import {BubbleMenu} from "@tiptap/react/menus";
import {useEditorState} from "@tiptap/react";
import {AlignCenter, AlignLeft} from "lucide-react";

interface ImageToolbarProps {
  editor: Editor;
}

export function ImageToolbar({editor}: ImageToolbarProps) {
  const align = useEditorState({
    editor,
    selector: ({editor: current}) =>
      (current.getAttributes("image").align as string | undefined) ?? "left",
  });

  const setAlign = (value: "left" | "center") => {
    editor.chain().updateAttributes("image", {align: value}).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      className="bubble-menu"
      options={{placement: "top", offset: 8}}
      shouldShow={({state}) =>
        state.selection instanceof NodeSelection &&
        state.selection.node.type.name === "image"
      }
    >
      <button
        type="button"
        className={`bubble-menu__button${align === "left" ? " is-active" : ""}`}
        title="靠左"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setAlign("left")}
      >
        <AlignLeft size={15} />
      </button>
      <button
        type="button"
        className={`bubble-menu__button${align === "center" ? " is-active" : ""}`}
        title="居中"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setAlign("center")}
      >
        <AlignCenter size={15} />
      </button>
    </BubbleMenu>
  );
}
