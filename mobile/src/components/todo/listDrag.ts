import type { TodoList } from "@/src/services/todoApi";

// Drag-to-move for the Lists home: pure maths, kept apart from the gesture
// code so it can be tested on its own.

// The Lists home's draggable area, top to bottom: ungrouped lists, then
// each group's header followed by its lists (none shown when collapsed).
export type DragRow =
  | { kind: "list"; id: string; group: string | null }
  | { kind: "group"; id: string };

export interface RowLayout {
  y: number;
  height: number;
}

export interface DropTarget {
  group: string | null;
  // Position among that group's lists (the dragged one excluded);
  // Infinity = the end.
  index: number;
  // Where to draw the drop line (content y), or the header to highlight.
  indicatorY: number | null;
  hoverGroupId: string | null;
}

export function rowKey(row: DragRow): string {
  return `${row.kind}:${row.id}`;
}

// Where a list dropped with its centre at `centerY` should go. Held over a
// group's header -> the end of that group (a collapsed group can only be
// dropped into this way). Otherwise between rows: it joins the group of the
// row just above the gap (a header -> that group's start; a list -> that
// list's group), or stays ungrouped above everything.
export function computeDrop(
  rows: DragRow[],
  layouts: Record<string, RowLayout>,
  draggedId: string,
  centerY: number,
): DropTarget {
  const visible = rows.filter((r) => !(r.kind === "list" && r.id === draggedId) && layouts[rowKey(r)]);

  for (const row of visible) {
    if (row.kind !== "group") continue;
    const l = layouts[rowKey(row)];
    if (centerY >= l.y + l.height * 0.2 && centerY <= l.y + l.height * 0.8) {
      return { group: row.id, index: Infinity, indicatorY: null, hoverGroupId: row.id };
    }
  }

  let insertAt = visible.findIndex((r) => {
    const l = layouts[rowKey(r)];
    return l.y + l.height / 2 > centerY;
  });
  if (insertAt === -1) insertAt = visible.length;

  const prev = insertAt > 0 ? visible[insertAt - 1] : null;
  const group = prev ? (prev.kind === "group" ? prev.id : prev.group) : null;
  const index = visible
    .slice(0, insertAt)
    .filter((r) => r.kind === "list" && r.group === group).length;

  const next = visible[insertAt];
  const lastLayout = prev ? layouts[rowKey(prev)] : null;
  const indicatorY = next ? layouts[rowKey(next)].y : lastLayout ? lastLayout.y + lastLayout.height : 0;

  return { group, index, indicatorY, hoverGroupId: null };
}

// The lists after dropping `draggedId` at `target`, plus the reorder
// payload: every list in the destination group (and the group it left)
// renumbered 0..n in its new order. The default Tasks list never moves.
export function applyDrop(
  lists: TodoList[],
  draggedId: string,
  target: Pick<DropTarget, "group" | "index">,
): { lists: TodoList[]; items: { id: string; group: string | null; order: number }[] } {
  const dragged = lists.find((l) => l._id === draggedId);
  if (!dragged || dragged.isDefault) return { lists, items: [] };

  const byOrder = (a: TodoList, b: TodoList) => a.order - b.order;
  const inGroup = (group: string | null) =>
    lists.filter((l) => !l.isDefault && l._id !== draggedId && (l.group ?? null) === group).sort(byOrder);

  const destination = inGroup(target.group);
  destination.splice(Math.min(target.index, destination.length), 0, { ...dragged, group: target.group });

  const changed = new Map<string, TodoList>();
  destination.forEach((l, order) => changed.set(l._id, { ...l, group: target.group, order }));
  if ((dragged.group ?? null) !== target.group) {
    inGroup(dragged.group ?? null).forEach((l, order) => changed.set(l._id, { ...l, order }));
  }

  const items = [...changed.values()]
    .filter((l) => {
      const before = lists.find((x) => x._id === l._id)!;
      return (before.group ?? null) !== l.group || before.order !== l.order;
    })
    .map((l) => ({ id: l._id, group: l.group, order: l.order }));

  return { lists: lists.map((l) => changed.get(l._id) ?? l), items };
}
