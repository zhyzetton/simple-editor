import {AlertCircle, Info, X} from "lucide-react";
import {useEffect} from "react";
import {createPortal} from "react-dom";
import type {ToastMessage} from "../types";

interface ToastProps {
  message: ToastMessage | null;
  onClose: () => void;
}

export function Toast({message, onClose}: ToastProps) {
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) {
    return null;
  }

  const Icon = message.kind === "error" ? AlertCircle : Info;

  return createPortal(
    <div className={`toast toast--${message.kind}`} role="status">
      <Icon size={16} />
      <span>{message.text}</span>
      <button type="button" className="toast__close" title="关闭" onClick={onClose}>
        <X size={14} />
      </button>
    </div>,
    document.body,
  );
}
