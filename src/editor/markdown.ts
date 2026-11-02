import {Marked} from "marked";
import type {TokenizerAndRendererExtension} from "marked";
import {MarkdownSerializer, defaultMarkdownSerializer} from "prosemirror-markdown";
import type {MarkdownSerializerState} from "prosemirror-markdown";
import type {Node as PMNode} from "@tiptap/pm/model";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const blockMathExtension = {
  name: "blockMath",
  level: "block" as const,
  start(src: string) {
    return src.indexOf("$$");
  },
  tokenizer(src: string) {
    const match = /^\$\$([\s\S]+?)\$\$(?:\n+|$)/.exec(src);
    if (!match) {
      return undefined;
    }
    return {
      type: "blockMath",
      raw: match[0],
      text: match[1].trim(),
    };
  },
  renderer(token: {text: string}) {
    return `<div data-type="block-math" data-latex="${escapeAttr(token.text)}"></div>`;
  },
};

const inlineMathExtension = {
  name: "inlineMath",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("$");
  },
  tokenizer(src: string) {
    const match = /^\$([^$\n]+?)\$/.exec(src);
    if (!match) {
      return undefined;
    }
    return {
      type: "inlineMath",
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: {text: string}) {
    return `<span data-type="inline-math" data-latex="${escapeAttr(token.text)}"></span>`;
  },
};

const highlightExtension: TokenizerAndRendererExtension = {
  name: "highlightMark",
  level: "inline",
  start(src: string) {
    return src.indexOf("==");
  },
  tokenizer(src: string) {
    const match = /^==([^=\n]+?)==/.exec(src);
    if (!match) {
      return undefined;
    }
    return {
      type: "highlightMark",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
  },
};

const marked = new Marked();
marked.use({
  gfm: true,
  breaks: false,
  extensions: [blockMathExtension, inlineMathExtension, highlightExtension],
});

function normalizeTaskLists(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>('li > input[type="checkbox"]'));
  for (const input of inputs) {
    const li = input.closest("li");
    if (!li) {
      continue;
    }
    const checked = input.hasAttribute("checked") || input.checked;
    const list = li.parentElement;
    if (list && list.tagName === "UL") {
      list.setAttribute("data-type", "taskList");
    }
    li.setAttribute("data-type", "taskItem");
    li.setAttribute("data-checked", checked ? "true" : "false");

    const nested: Element[] = [];
    for (const child of Array.from(li.children)) {
      if (child.tagName === "UL" || child.tagName === "OL") {
        nested.push(child);
      }
    }

    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input[type="checkbox"]').forEach((node) => node.remove());
    clone.querySelectorAll("ul, ol").forEach((node) => node.remove());
    const wrapper = doc.createElement("div");
    wrapper.innerHTML = clone.innerHTML.trim();
    const paragraphs = Array.from(wrapper.querySelectorAll("p"));
    const inner =
      paragraphs.length > 0
        ? paragraphs.map((paragraph) => paragraph.innerHTML).join("<br>")
        : wrapper.innerHTML;

    li.innerHTML = "";
    const label = doc.createElement("label");
    const box = doc.createElement("input");
    box.type = "checkbox";
    if (checked) {
      box.setAttribute("checked", "checked");
    }
    label.append(box, doc.createElement("span"));

    const content = doc.createElement("div");
    const paragraph = doc.createElement("p");
    paragraph.innerHTML = inner;
    content.append(paragraph, ...nested);
    li.append(label, content);
  }
  return doc.body.innerHTML;
}

export function markdownToHTML(markdown: string): string {
  if (!markdown.trim()) {
    return "";
  }
  const html = marked.parse(markdown, {async: false}) as string;
  return normalizeTaskLists(html);
}

function escapeInlineText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]|$~=<])/g, "\\$1");
}

function imageMarkdown(node: PMNode): string {
  const alt = String(node.attrs.alt ?? "");
  const rawSrc = String(node.attrs.src ?? "");
  const width = Number(node.attrs.width ?? 0);
  const align = String(node.attrs.align ?? "left");
  if (width > 0 || align !== "left") {
    const attrs = [`src="${escapeAttr(rawSrc)}"`, `alt="${escapeAttr(alt)}"`];
    if (width > 0) {
      attrs.push(`width="${width}"`);
    }
    if (align !== "left") {
      attrs.push(`data-align="${escapeAttr(align)}"`);
    }
    return `<img ${attrs.join(" ")}>`;
  }
  const src = rawSrc.replace(/[()]/g, "\\$&");
  const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : "";
  return `![${alt}](${src}${title})`;
}

function inlineMarkdown(node: PMNode): string {
  let result = "";
  node.forEach((child) => {
    if (child.isText) {
      let text = escapeInlineText(child.text ?? "");
      const findMark = (name: string) => child.marks.find((mark) => mark.type.name === name);
      if (findMark("code")) {
        text = `\`${text.replace(/`/g, "\\`")}\``;
      }
      if (findMark("bold")) {
        text = `**${text}**`;
      }
      if (findMark("italic")) {
        text = `*${text}*`;
      }
      if (findMark("strike")) {
        text = `~~${text}~~`;
      }
      if (findMark("highlight")) {
        text = `==${text}==`;
      }
      if (findMark("underline")) {
        text = `<u>${text}</u>`;
      }
      const link = findMark("link");
      if (link) {
        text = `[${text}](${String(link.attrs.href)})`;
      }
      result += text;
      return;
    }
    if (child.type.name === "hardBreak") {
      result += "<br>";
      return;
    }
    if (child.type.name === "mathInline") {
      result += `$${String(child.attrs.latex ?? "")}$`;
      return;
    }
    if (child.type.name === "image") {
      result += imageMarkdown(child);
      return;
    }
    if (child.isTextblock) {
      result += inlineMarkdown(child);
    }
  });
  return result;
}

function fenceFor(code: string): string {
  const runs = code.match(/`{3,}/g);
  const longest = runs ? Math.max(...runs.map((run) => run.length)) : 2;
  return "`".repeat(Math.max(3, longest + 1));
}

function serializeTable(state: MarkdownSerializerState, node: PMNode) {
  const rows: string[][] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(inlineMarkdown(cell).trim());
    });
    rows.push(cells);
  });
  if (rows.length === 0) {
    return;
  }
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (cells: string[]) => {
    const copy = [...cells];
    while (copy.length < width) {
      copy.push("");
    }
    return copy;
  };
  state.write(`| ${pad(rows[0]).join(" | ")} |`);
  state.ensureNewLine();
  state.write(`| ${Array(width).fill("---").join(" | ")} |`);
  state.ensureNewLine();
  for (let index = 1; index < rows.length; index++) {
    state.write(`| ${pad(rows[index]).join(" | ")} |`);
    state.ensureNewLine();
  }
  state.closeBlock(node);
}

const serializer = new MarkdownSerializer(
  {
    text: defaultMarkdownSerializer.nodes.text,
    paragraph: defaultMarkdownSerializer.nodes.paragraph,
    heading: defaultMarkdownSerializer.nodes.heading,
    blockquote: defaultMarkdownSerializer.nodes.blockquote,
    horizontalRule: defaultMarkdownSerializer.nodes.horizontal_rule,
    hardBreak: defaultMarkdownSerializer.nodes.hard_break,
    bulletList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    orderedList(state, node) {
      const start = Number(node.attrs.start ?? 1);
      const maxWidth = String(start + node.childCount - 1).length;
      const space = state.repeat(" ", maxWidth + 2);
      state.renderList(node, space, (index) => {
        const number = String(start + index);
        return state.repeat(" ", maxWidth - number.length) + number + ". ";
      });
    },
    listItem: defaultMarkdownSerializer.nodes.list_item,
    image(state, node) {
      state.write(imageMarkdown(node));
      state.closeBlock(node);
    },
    codeBlock(state, node) {
      const code = node.textContent;
      const fence = fenceFor(code);
      const language = node.attrs.language ? String(node.attrs.language) : "";
      state.write(fence + language);
      state.ensureNewLine();
      state.text(code, false);
      state.ensureNewLine();
      state.write(fence);
      state.closeBlock(node);
    },
    taskList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    taskItem(state, node) {
      state.write(node.attrs.checked ? "[x] " : "[ ] ");
      state.renderContent(node);
    },
    mathInline(state, node) {
      state.write(`$${String(node.attrs.latex ?? "")}$`);
    },
    mathBlock(state, node) {
      state.write("$$");
      state.ensureNewLine();
      state.write(String(node.attrs.latex ?? ""));
      state.ensureNewLine();
      state.write("$$");
      state.closeBlock(node);
    },
    table: serializeTable,
    tableRow() {},
    tableHeader() {},
    tableCell() {},
  },
  {
    bold: defaultMarkdownSerializer.marks.strong,
    italic: defaultMarkdownSerializer.marks.em,
    code: defaultMarkdownSerializer.marks.code,
    link: defaultMarkdownSerializer.marks.link,
    strike: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    highlight: {
      open: "==",
      close: "==",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    underline: {
      open: "<u>",
      close: "</u>",
      mixable: true,
    },
  },
  {
    escapeExtraCharacters: /\$/g,
    hardBreakNodeName: "hardBreak",
  },
);

export function docToMarkdown(doc: PMNode): string {
  return serializer.serialize(doc, {tightLists: true}).trim();
}
