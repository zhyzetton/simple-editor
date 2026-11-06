import {Extension} from "@tiptap/core";
import type {Node} from "@tiptap/pm/model";
import {Plugin, PluginKey} from "@tiptap/pm/state";
import type {Transaction} from "@tiptap/pm/state";
import {TableMap} from "@tiptap/pm/tables";

/**
 * prosemirror-tables 一旦发现每列都有像素宽，就把 table.style.width 设成这些宽度之和：
 * 拖表格右边缘时整张表会跟着缩，右边空出一截，列边界也和鼠标对不齐（看起来就是抖动）。
 * 这里把最后一列的宽度抹掉，让它始终吸收剩余空间，表格就永远占满行宽，拖动只移动那一条边界。
 */
export const FluidLastTableColumn = Extension.create({
  name: "fluidLastTableColumn",

  addProseMirrorPlugins() {
    const key = new PluginKey("fluidLastTableColumn");
    return [
      new Plugin({
        key,
        appendTransaction(transactions, _oldState, state) {
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }
          const tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "table") {
              return true;
            }
            if (clearLastColumnWidths(node, pos, tr)) {
              changed = true;
            }
            return false;
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

function clearLastColumnWidths(table: Node, tablePos: number, tr: Transaction): boolean {
  const map = TableMap.get(table);
  const lastCol = map.width - 1;
  const visited = new Set<number>();
  let changed = false;
  for (const cellPos of map.map) {
    if (visited.has(cellPos)) {
      continue;
    }
    visited.add(cellPos);
    const cell = table.nodeAt(cellPos);
    if (!cell) {
      continue;
    }
    const colspan = Number(cell.attrs.colspan) || 1;
    if (map.colCount(cellPos) + colspan - 1 !== lastCol) {
      continue;
    }
    const widths = cell.attrs.colwidth;
    if (!Array.isArray(widths) || !widths.some((width: unknown) => width != null)) {
      continue;
    }
    tr.setNodeMarkup(tablePos + 1 + cellPos, null, {
      ...cell.attrs,
      colwidth: widths.map(() => null),
    });
    changed = true;
  }
  return changed;
}
