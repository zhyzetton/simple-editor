import {ListTree, X} from "lucide-react";
import type {OutlineItem} from "../types";

interface OutlineProps {
  items: OutlineItem[];
  onSelect: (pos: number) => void;
  onClose: () => void;
}

export function Outline({items, onSelect, onClose}: OutlineProps) {
  return (
    <aside className="outline">
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
