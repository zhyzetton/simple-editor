import type {SuggestionProps} from "@tiptap/suggestion";
import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from "react";
import type {SlashItem} from "../editor/slashItems";

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export type SlashMenuProps = SuggestionProps<SlashItem, SlashItem>;

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(props, ref) {
  const {items, command} = props;
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(0);
  }, [items]);

  const groups = useMemo(() => {
    const map = new Map<string, {item: SlashItem; index: number}[]>();
    items.forEach((item, index) => {
      const group = map.get(item.group) ?? [];
      group.push({item, index});
      map.set(item.group, group);
    });
    return Array.from(map.entries());
  }, [items]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    active?.scrollIntoView({block: "nearest"});
  }, [selected]);

  const execute = (index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (items.length === 0) {
          return false;
        }
        if (event.key === "ArrowDown") {
          setSelected((current) => (current + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((current) => (current - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          execute(selected);
          return true;
        }
        return false;
      },
    }),
    [items, selected],
  );

  return (
    <div className="slash-menu" ref={listRef}>
      {items.length === 0 ? <div className="slash-menu__empty">没有匹配的命令</div> : null}
      {groups.map(([group, entries]) => (
        <div className="slash-menu__group" key={group}>
          <div className="slash-menu__label">{group}</div>
          {entries.map(({item, index}) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                data-index={index}
                className={`slash-menu__item${selected === index ? " is-selected" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setSelected(index)}
                onClick={() => execute(index)}
              >
                <span className="slash-menu__icon">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <span className="slash-menu__title">{item.title}</span>
                {item.hint ? <span className="slash-menu__hint">{item.hint}</span> : null}
              </button>
            );
          })}
        </div>
      ))}
      <div className="slash-menu__footer">↑↓ 选择 · Enter 确认 · Esc 关闭</div>
    </div>
  );
});
