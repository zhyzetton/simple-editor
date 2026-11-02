import {useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

interface PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PromptDialog({
  open,
  title,
  label,
  description,
  defaultValue = "",
  placeholder,
  confirmLabel = "创建",
  onClose,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    setValue(defaultValue);
    setError("");
    setPending(false);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [defaultValue, open]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    if (pending) {
      return;
    }
    const next = value.trim();
    if (!next) {
      setError("名称不能为空");
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSubmit(next);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
    >
      <form
        className="modal prompt-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="prompt-dialog__title">{title}</div>
        {description ? <div className="prompt-dialog__description">{description}</div> : null}
        <label className="prompt-dialog__field">
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            spellCheck={false}
            disabled={pending}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !pending) {
                onClose();
              }
            }}
          />
        </label>
        {error ? <div className="prompt-dialog__error">{error}</div> : null}
        <div className="modal__actions">
          <button
            type="button"
            className="button button--ghost"
            disabled={pending}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={pending || !value.trim()}
          >
            {pending ? "创建中…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
