import {ListTree, X} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import type {OutlineItem} from "../types";

const WIDTH_KEY = "md-editor:outline-width";
const DEFAULT_WIDTH = 224;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;

function clampWidth(value: number): number {
  // 正文至少留 480px，否则文档区会被挤没了
  const upper = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - 480));
  return Math.min(Math.max(value, MIN_WIDTH), upper);
}

function readStoredWidth(): number {
  const stored = Number(localStorage.getItem(WIDTH_KEY));
  return clampWidth(stored > 0 ? stored : DEFAULT_WIDTH);
}

interface OutlineProps {
  items: OutlineItem[];
  onSelect: (pos: number) => void;
  onClose: () => void;
}

export function Outline({items, onSelect, onClose}: OutlineProps) {
  const [width, setWidth] = useState(readStoredWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{startX: number; startWidth: number} | null>(null);

  useEffect(() => {
    if (!resizing) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        setWidth(clampWidth(drag.startWidth - (event.clientX - drag.startX)));
      }
    };
    const stop = () => setResizing(false);
    document.body.classList.add("is-resizing-outline");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      document.body.classList.remove("is-resizing-outline");
      dragRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [resizing]);

  useEffect(() => {
    const handleResize = () => setWidth((current) => clampWidth(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 松手后再落盘，免得每次 pointermove 都写一次 localStorage
  useEffect(() => {
    if (!resizing) {
      localStorage.setItem(WIDTH_KEY, String(width));
    }
  }, [width, resizing]);

  return (
    <aside
      className={`outline${resizing ? " is-resizing" : ""}`}
      style={{width: `${width}px`}}
    >
      <div
        className="outline__resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整大纲宽度"
        title="拖动调整大纲宽度"
        onPointerDown={(event) => {
          event.preventDefault();
          dragRef.current = {startX: event.clientX, startWidth: width};
          setResizing(true);
        }}
      />
      <div className="outline__header">
        <span className="outline__heading">
          <ListTree size={15} />
          大纲
        </span>
        <button type="button" className="icon-button" title="关闭大纲" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="outline__list">
        {items.length === 0 ? (
          <div className="outline__empty">当前文档还没有标题</div>
        ) : (
          items.map((item) => (
            <button
              type="button"
              key={item.id}
              className="outline__item"
              data-level={item.level}
              style={{paddingLeft: `${12 + (item.level - 1) * 13}px`}}
              title={item.text}
              onClick={() => onSelect(item.pos)}
            >
              {item.text}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
