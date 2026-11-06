import {createPortal} from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  altLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onAlt?: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确定",
  altLabel,
  danger = false,
  onCancel,
  onAlt,
  onConfirm,
}: ConfirmDialogProps) {
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
      <div className="modal confirm-dialog" role="dialog" aria-label={title}>
        <div className="confirm-dialog__title">{title}</div>
        <div className="confirm-dialog__message">{message}</div>
        <div className="modal__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            取消
          </button>
          {altLabel ? (
            <button type="button" className="button button--danger" onClick={onAlt}>
              {altLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={`button ${danger ? "button--danger" : "button--primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
