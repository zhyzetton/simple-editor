import {Plus, X} from "lucide-react";
import {useEffect, useRef} from "react";
import type {OpenDoc} from "../types";

interface TabBarProps {
  docs: OpenDoc[];
  activeId: string | null;
  previewId: string | null;
  dirty: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNewFile: () => void;
}

export function TabBar({
  docs,
  activeId,
  previewId,
  dirty,
  onActivate,
  onClose,
  onNewFile,
}: TabBarProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({block: "nearest", inline: "nearest"});
  }, [activeId, docs.length]);

  if (docs.length === 0) {
    return null;
  }

  return (
    <div className="tabbar">
      <div className="tabbar__scroll" role="tablist">
        {docs.map((doc) => {
          const active = doc.id === activeId;
          const preview = doc.id === previewId;
          return (
            <div
              key={doc.id}
              ref={active ? activeRef : undefined}
              role="tab"
              aria-selected={active}
              className={`tab${active ? " is-active" : ""}${preview ? " is-preview" : ""}`}
              title={preview ? `${doc.path} · 预览中` : doc.path}
              onClick={() => onActivate(doc.id)}
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
              {active && dirty ? <span className="tab__dot" title="未保存" /> : null}
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
      <button type="button" className="tabbar__new" title="新建文件" onClick={onNewFile}>
        <Plus size={14} />
      </button>
    </div>
  );
}
