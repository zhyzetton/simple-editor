import type {Editor} from "@tiptap/core";
import {pickImage} from "./storage";

export async function insertImageAt(editor: Editor, assetDir: string, at?: number) {
  const src = await pickImage(assetDir);
  if (!src) {
    return;
  }
  const content = {type: "image", attrs: {src, alt: "图片"}};
  if (typeof at === "number") {
    editor.chain().focus().insertContentAt(at, content).run();
    return;
  }
  editor.chain().focus().insertContent(content).run();
}
