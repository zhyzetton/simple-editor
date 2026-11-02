import katex from "katex";
import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";

interface MathDialogProps {
  open: boolean;
  mode: "inline" | "block";
  initialLatex?: string;
  onCancel: () => void;
  onConfirm: (latex: string) => void;
}

export function MathDialog({open, mode, initialLatex, onCancel, onConfirm}: MathDialogProps) {
  const [value, setValue] = useState(initialLatex ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialLatex ?? "");
      window.setTimeout(() => textareaRef.current?.focus(), 30);
    }
  }, [open, initialLatex]);

  const preview = useMemo(() => {
    if (!value.trim()) {
      return "";
    }
    return katex.renderToString(value, {
      displayMode: mode === "block",
      throwOnError: false,
      strict: false,
      trust: false,
    });
  }, [mode, value]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="modal math-dialog" role="dialog" aria-label="插入公式">
        <div className="math-dialog__header">
          <span>{mode === "block" ? "公式块" : "行内公式"}</span>
          <span className="math-dialog__tip">Enter 插入 · Shift+Enter 换行 · Esc 取消</span>
        </div>
        <textarea
          ref={textareaRef}
          className="math-dialog__input"
          value={value}
          rows={mode === "block" ? 4 : 2}
          spellCheck={false}
          placeholder={mode === "block" ? "\\int_0^1 x^2 dx" : "e^{i\\pi} + 1 = 0"}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (value.trim()) {
                onConfirm(value.trim());
              }
            }
          }}
        />
        <div className="math-dialog__preview">
          {preview ? (
            <span dangerouslySetInnerHTML={{__html: preview}} />
          ) : (
            <span className="math-dialog__empty">实时预览</span>
          )}
        </div>
        <div className="modal__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!value.trim()}
            onClick={() => onConfirm(value.trim())}
          >
            插入
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
