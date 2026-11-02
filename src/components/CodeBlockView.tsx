import {NodeViewContent, NodeViewWrapper} from "@tiptap/react";
import type {NodeViewProps} from "@tiptap/react";
import {Check, Copy} from "lucide-react";
import {useState} from "react";

const LANGUAGES = [
  {value: "", label: "纯文本"},
  {value: "javascript", label: "JavaScript"},
  {value: "typescript", label: "TypeScript"},
  {value: "jsx", label: "JSX"},
  {value: "tsx", label: "TSX"},
  {value: "python", label: "Python"},
  {value: "rust", label: "Rust"},
  {value: "go", label: "Go"},
  {value: "java", label: "Java"},
  {value: "c", label: "C"},
  {value: "cpp", label: "C++"},
  {value: "csharp", label: "C#"},
  {value: "html", label: "HTML"},
  {value: "css", label: "CSS"},
  {value: "json", label: "JSON"},
  {value: "yaml", label: "YAML"},
  {value: "bash", label: "Shell"},
  {value: "sql", label: "SQL"},
  {value: "markdown", label: "Markdown"},
];

export function CodeBlockView({node, updateAttributes, editor}: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = String(node.attrs.language ?? "");
  const knownLanguage = LANGUAGES.some((item) => item.value === language);

  const copyCode = async () => {
    const code = node.textContent;
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <NodeViewWrapper className="code-block" data-language={language || undefined}>
      <div className="code-block__toolbar" contentEditable={false}>
        <select
          className="code-block__language"
          aria-label="代码语言"
          value={language}
          onChange={(event) => {
            const next = event.target.value;
            updateAttributes({language: next || null});
            window.setTimeout(() => editor.commands.focus(), 0);
          }}
        >
          {!knownLanguage && language ? <option value={language}>{language}</option> : null}
          {LANGUAGES.map((item) => (
            <option key={item.value || "plain"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="code-block__copy"
          title="复制代码"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void copyCode()}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="code-block__pre">
        <NodeViewContent<"code">
          as="code"
          className={language ? `language-${language}` : undefined}
          spellCheck={false}
        />
      </pre>
    </NodeViewWrapper>
  );
}
