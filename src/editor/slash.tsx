import {Extension} from "@tiptap/core";
import {ReactRenderer} from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {SlashMenu} from "../components/SlashMenu";
import type {SlashMenuHandle, SlashMenuProps} from "../components/SlashMenu";
import {filterSlashItems} from "./slashItems";
import type {SlashItem} from "./slashItems";

export interface SlashCommandOptions {
  openMath: (mode: "inline" | "block", pos: number) => void;
  insertImage: (editor: import("@tiptap/core").Editor, pos: number) => void;
}

export function createSlashCommand(options: SlashCommandOptions) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: "/",
          allowSpaces: false,
          startOfLine: false,
          placement: "bottom-start",
          offset: {mainAxis: 6, crossAxis: 0},
          allow: ({state, range}) => {
            const $from = state.doc.resolve(range.from);
            return $from.parent.type.name !== "codeBlock";
          },
          items: ({query}) => filterSlashItems(query),
          command: ({editor, range, props}) => {
            const at = range.from;
            editor.chain().focus().deleteRange(range).run();
            props.run(editor, at, {
              openMath: options.openMath,
              insertImage: (pos) => options.insertImage(editor, pos),
            });
          },
          render: () => {
            let component: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
            let unmount: (() => void) | null = null;

            const cleanup = () => {
              unmount?.();
              unmount = null;
              component?.destroy();
              component = null;
            };

            return {
              onStart: (props) => {
                component = new ReactRenderer<SlashMenuHandle, SlashMenuProps>(SlashMenu, {
                  props,
                  editor: props.editor,
                });
                // mount() 只给包裹层定位，z-index 仍是 auto，会被代码块工具栏等绝对定位元素盖住
                component.element.style.zIndex = "900";
                unmount = props.mount(component.element);
              },
              onUpdate: (props) => {
                component?.updateProps(props);
              },
              onExit: () => {
                cleanup();
              },
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  cleanup();
                  return true;
                }
                return component?.ref?.onKeyDown(props.event) ?? false;
              },
            };
          },
        }),
      ];
    },
  });
}
