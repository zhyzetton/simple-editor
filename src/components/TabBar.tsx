import {Plus, X} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import type {OpenDoc} from "../types";

interface TabBarProps {
  docs: OpenDoc[];
  activeId: string | null;
  previewId: string | null;
  dirtyIds: Set<string>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onPromote: (id: string) => void;
  onReorder: (fromId: string, toIndex: number) => void;
  onNewFile: () => void;
}

const DRAG_THRESHOLD = 5;

interface DragCandidate {
  id: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  moved: boolean;
}

interface DragGhost {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function TabBar({
  docs,
  activeId,
  previewId,
  dirtyIds,
  onActivate,
  onClose,
  onPromote,
  onReorder,
  onNewFile,
}: TabBarProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<DragCandidate | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({block: "nearest", inline: "nearest"});
  }, [activeId, docs.length]);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      if (!drag.moved) {
        const dx = Math.abs(event.clientX - drag.startX);
        const dy = Math.abs(event.clientY - drag.startY);
        if (Math.max(dx, dy) < DRAG_THRESHOLD) {
          return;
        }
        // 真正拖动后才显示浮动标签，避免单击/双击时闪一下
        drag.moved = true;
      }
      setDragGhost({
        id: drag.id,
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
        width: drag.width,
        height: drag.height,
      });
      const from = docs.findIndex((doc) => doc.id === drag.id);
      if (from === -1) {
        return;
      }
      let target = docs.length - 1;
      for (let index = 0; index < docs.length; index += 1) {
        const rect = tabRefs.current.get(docs[index].id)?.getBoundingClientRect();
        if (!rect) {
          continue;
        }
        if (event.clientX < rect.left + rect.width / 2) {
          target = index;
          break;
        }
      }
      if (target !== from) {
        onReorder(drag.id, target);
      }
    },
    [docs, onReorder],
  );

  const endDrag = useCallback(() => {
    if (dragRef.current?.moved) {
      // 拖动结束时浏览器还会补一个 click（落在共同父节点上），给它一个短暂的抑制窗口，避免误切换标签
      suppressClickUntilRef.current = performance.now() + 250;
    }
    dragRef.current = null;
    setDragGhost(null);
  }, []);

  useEffect(() => {
    // 监听常驻：按下标签时才在 dragRef 里记录候选拖动，不必靠 state 触发挂载
    const handlePointerUp = () => endDrag();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        endDrag();
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [endDrag, handlePointerMove]);

  if (docs.length === 0) {
    return null;
  }

  const ghostDoc = dragGhost ? (docs.find((doc) => doc.id === dragGhost.id) ?? null) : null;

  return (
    <div className="tabbar">
      <div className="tabbar__scroll" role="tablist">
        {docs.map((doc) => {
          const active = doc.id === activeId;
          const preview = doc.id === previewId;
          return (
            <div
              key={doc.id}
              ref={(element) => {
                if (!element) {
                  tabRefs.current.delete(doc.id);
                  return;
                }
                tabRefs.current.set(doc.id, element);
                if (active) {
                  activeRef.current = element;
                }
              }}
              role="tab"
              aria-selected={active}
              className={`tab${active ? " is-active" : ""}${preview ? " is-preview" : ""}${
                dragGhost?.id === doc.id ? " is-dragging" : ""
              }`}
              title={preview ? `${doc.path} · 预览中（双击固定）` : doc.path}
              onClick={() => {
                if (performance.now() < suppressClickUntilRef.current) {
                  return;
                }
                onActivate(doc.id);
              }}
              onDoubleClick={(event) => {
                // 双击临时（预览）标签把它固定成持久标签
                if (performance.now() < suppressClickUntilRef.current) {
                  return;
                }
                if (preview && !(event.target as HTMLElement).closest(".tab__close")) {
                  onPromote(doc.id);
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || (event.target as HTMLElement).closest(".tab__close")) {
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                dragRef.current = {
                  id: doc.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  offsetX: event.clientX - rect.left,
                  offsetY: event.clientY - rect.top,
                  width: rect.width,
                  height: rect.height,
                  moved: false,
                };
              }}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onClose(doc.id);
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                }
              }}
            >
              <span className="tab__title">{doc.title}</span>
              {dirtyIds.has(doc.id) ? <span className="tab__dot" title="未保存" /> : null}
              <button
                type="button"
                className="tab__close"
                title="关闭"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(doc.id);
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
      {dragGhost && ghostDoc ? (
        <div
          className={`tab tab--ghost${ghostDoc.id === previewId ? " is-preview" : ""}`}
          style={{
            width: dragGhost.width,
            height: dragGhost.height,
            transform: `translate3d(${dragGhost.x}px, ${dragGhost.y}px, 0)`,
          }}
          aria-hidden="true"
        >
          <span className="tab__title">{ghostDoc.title}</span>
          {dirtyIds.has(ghostDoc.id) ? <span className="tab__dot" /> : null}
          <span className="tab__close">
            <X size={13} />
          </span>
        </div>
      ) : null}
      <button type="button" className="tabbar__new" title="新建文件" onClick={onNewFile}>
        <Plus size={14} />
      </button>
    </div>
  );
}
