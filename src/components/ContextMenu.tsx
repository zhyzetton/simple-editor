import type {LucideIcon} from "lucide-react";
import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({x, y, items, onClose}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({left: x, top: y});

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPosition({left: Math.max(8, left), top: Math.max(8, top)});
  }, [x, y]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handlePointer, true);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", handlePointer, true);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{left: position.left, top: position.top}}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`context-menu__item${item.danger ? " is-danger" : ""}`}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {Icon ? <Icon size={14} /> : <span className="context-menu__icon-placeholder" />}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
