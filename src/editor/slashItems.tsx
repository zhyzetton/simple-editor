import type {Editor} from "@tiptap/core";
import type {LucideIcon} from "lucide-react";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Sigma,
  Table2,
  TextQuote,
  Type,
} from "lucide-react";
export interface SlashHelpers {
  openMath: (mode: "inline" | "block", pos: number) => void;
  insertImage: (pos: number) => void;
}

export interface SlashItem {
  id: string;
  title: string;
  group: string;
  aliases: string[];
  hint?: string;
  icon: LucideIcon;
  run: (editor: Editor, at: number, helpers: SlashHelpers) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "paragraph",
    title: "文本",
    group: "基础",
    aliases: ["text", "paragraph", "p", "正文"],
    hint: "P",
    icon: Type,
    run: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    id: "heading-1",
    title: "一级标题",
    group: "基础",
    aliases: ["h1", "heading 1", "title", "标题"],
    hint: "H1",
    icon: Heading1,
    run: (editor) => {
      editor.chain().focus().setNode("heading", {level: 1}).run();
    },
  },
  {
    id: "heading-2",
    title: "二级标题",
    group: "基础",
    aliases: ["h2", "heading 2", "标题"],
    hint: "H2",
    icon: Heading2,
    run: (editor) => {
      editor.chain().focus().setNode("heading", {level: 2}).run();
    },
  },
  {
    id: "heading-3",
    title: "三级标题",
    group: "基础",
    aliases: ["h3", "heading 3", "标题"],
    hint: "H3",
    icon: Heading3,
    run: (editor) => {
      editor.chain().focus().setNode("heading", {level: 3}).run();
    },
  },
  {
    id: "bullet-list",
    title: "无序列表",
    group: "基础",
    aliases: ["bullet", "ul", "list", "列表"],
    hint: "-",
    icon: List,
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "ordered-list",
    title: "有序列表",
    group: "基础",
    aliases: ["ordered", "ol", "number", "列表"],
    hint: "1.",
    icon: ListOrdered,
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "task-list",
    title: "任务列表",
    group: "基础",
    aliases: ["task", "todo", "check", "待办"],
    hint: "[]",
    icon: ListTodo,
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: "quote",
    title: "引用",
    group: "插入",
    aliases: ["quote", "blockquote", "bq"],
    hint: ">",
    icon: TextQuote,
    run: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: "code-block",
    title: "代码块",
    group: "插入",
    aliases: ["code", "fence", "pre", "代码"],
    hint: "```",
    icon: Code2,
    run: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: "table",
    title: "表格",
    group: "插入",
    aliases: ["table", "grid"],
    hint: "3×3",
    icon: Table2,
    run: (editor) => {
      editor.chain().focus().insertTable({rows: 3, cols: 3, withHeaderRow: true}).run();
    },
  },
  {
    id: "divider",
    title: "分割线",
    group: "插入",
    aliases: ["divider", "hr", "rule", "line"],
    hint: "---",
    icon: Minus,
    run: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    id: "math-block",
    title: "公式块",
    group: "插入",
    aliases: ["math", "latex", "formula", "公式"],
    hint: "$$",
    icon: Sigma,
    run: (_editor, at, helpers) => {
      helpers.openMath("block", at);
    },
  },
  {
    id: "math-inline",
    title: "行内公式",
    group: "插入",
    aliases: ["inline math", "latex", "formula", "公式"],
    hint: "$",
    icon: Sigma,
    run: (_editor, at, helpers) => {
      helpers.openMath("inline", at);
    },
  },
  {
    id: "image",
    title: "图片",
    group: "插入",
    aliases: ["image", "picture", "photo", "img", "图片"],
    hint: "",
    icon: ImageIcon,
    run: (_editor, at, helpers) => {
      helpers.insertImage(at);
    },
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return SLASH_ITEMS;
  }
  return SLASH_ITEMS.filter((item) => {
    const haystack = [item.title, item.group, ...item.aliases].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}
