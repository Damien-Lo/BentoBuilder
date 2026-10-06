import express from "express";

import TodoGroup from "../models/TodoGroup.js";
import TodoList from "../models/TodoList.js";
import TodoTask, { MAX_TASK_DEPTH, TASK_PRIORITIES, TASK_STATUSES } from "../models/TodoTask.js";

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SMART_LISTS = ["myday", "important", "planned", "all"];

// The client's "today" (its own timezone decides when My Day rolls over);
// the server's date only as a fallback.
function todayFrom(req) {
  const t = req.query.today ?? req.body?.today;
  if (typeof t === "string" && DATE_RE.test(t)) return t;
  return new Date().toISOString().slice(0, 10);
}

// The built-in "Tasks" list — created the first time anything needs it.
async function getDefaultList() {
  const existing = await TodoList.findOne({ isDefault: true });
  if (existing) return existing;
  return TodoList.create({ name: "Tasks", color: "blue", isDefault: true, order: -1 });
}

function smartFilter(smart, today) {
  switch (smart) {
    case "myday": return { myDayDate: today };
    case "important": return { important: true };
    case "planned": return { $or: [{ dueDate: { $ne: null } }, { doDate: { $ne: null } }] };
    default: return {};
  }
}

function sendError(res, error, status = 400) {
  return res.status(status).json({ success: false, message: error.message || String(error) });
}

/**
 * GET /api/todo/overview?today=YYYY-MM-DD
 * Everything the Lists home needs: groups, lists (with open-task counts)
 * and the smart lists' counts.
 */
router.get("/overview", async (req, res) => {
  try {
    const today = todayFrom(req);
    await getDefaultList();
    const [groups, lists, allOpen] = await Promise.all([
      TodoGroup.find({}).sort({ order: 1, createdAt: 1 }),
      TodoList.find({}).sort({ order: 1, createdAt: 1 }),
      // Top-level items only — subtasks count through their task.
      TodoTask.find({ completed: false, parent: null }).select("list important myDayDate dueDate doDate").lean(),
    ]);

    const openByList = new Map();
    for (const t of allOpen) openByList.set(String(t.list), (openByList.get(String(t.list)) ?? 0) + 1);
    // The smart lists only cover tasks lists, never checklists.
    const checklistIds = new Set(lists.filter((l) => l.type === "checklist").map((l) => String(l._id)));
    const openTasks = allOpen.filter((t) => !checklistIds.has(String(t.list)));

    return res.json({
      success: true,
      data: {
        groups,
        lists: lists.map((l) => ({ ...l.toObject(), openCount: openByList.get(String(l._id)) ?? 0 })),
        smartCounts: {
          myday: openTasks.filter((t) => t.myDayDate === today).length,
          important: openTasks.filter((t) => t.important).length,
          planned: openTasks.filter((t) => t.dueDate || t.doDate).length,
          all: openTasks.length,
        },
      },
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

// --- Groups ---

router.post("/groups", async (req, res) => {
  try {
    const count = await TodoGroup.countDocuments();
    const group = await TodoGroup.create({ name: req.body.name, order: count });
    return res.status(201).json({ success: true, data: group });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch("/groups/:id", async (req, res) => {
  try {
    const { name, collapsed } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (collapsed !== undefined) update.collapsed = !!collapsed;
    const group = await TodoGroup.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!group) return sendError(res, new Error("Group not found"), 404);
    return res.json({ success: true, data: group });
  } catch (error) {
    return sendError(res, error);
  }
});

// Deleting a group keeps its lists — they just become ungrouped.
router.delete("/groups/:id", async (req, res) => {
  try {
    const group = await TodoGroup.findByIdAndDelete(req.params.id);
    if (!group) return sendError(res, new Error("Group not found"), 404);
    await TodoList.updateMany({ group: group._id }, { group: null });
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

// --- Lists ---

router.post("/lists", async (req, res) => {
  try {
    const { name, color, group, type, shopping } = req.body;
    const count = await TodoList.countDocuments();
    const list = await TodoList.create({
      name,
      color,
      group: group || null,
      order: count,
      type: type === "checklist" ? "checklist" : "tasks",
      shopping: type === "checklist" && !!shopping,
    });
    return res.status(201).json({ success: true, data: list });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * PATCH /api/todo/lists/reorder
 * Body: { items: [{ id, group, order }] } — the result of dragging a list
 * on the Lists home: every list whose group or position changed, with its
 * new group (null = ungrouped) and order within it. Registered before
 * "/lists/:id" so "reorder" isn't read as an id.
 */
router.patch("/lists/reorder", async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const defaults = await TodoList.find({ _id: { $in: items.map((i) => i.id) }, isDefault: true }).select("_id");
    if (defaults.length > 0) throw new Error("The Tasks list can't be moved.");
    await TodoList.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item.id },
          update: { $set: { group: item.group || null, order: Number(item.order) || 0 } },
        },
      })),
    );
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch("/lists/:id", async (req, res) => {
  try {
    const list = await TodoList.findById(req.params.id);
    if (!list) return sendError(res, new Error("List not found"), 404);
    const { name, color, group, type, shopping } = req.body;
    if (shopping !== undefined) list.shopping = !!shopping;
    if (type !== undefined) {
      if (list.isDefault && type !== "tasks") throw new Error("The Tasks list can't be a checklist.");
      list.type = type === "checklist" ? "checklist" : "tasks";
      if (list.type === "tasks") list.shopping = false;
    }
    if (name !== undefined) list.name = name;
    if (color !== undefined) list.color = color;
    if (group !== undefined) {
      if (list.isDefault && group) throw new Error("The Tasks list can't be put in a group.");
      list.group = group || null;
    }
    await list.save();
    return res.json({ success: true, data: list });
  } catch (error) {
    return sendError(res, error);
  }
});

// Deleting a list deletes its tasks too.
router.delete("/lists/:id", async (req, res) => {
  try {
    const list = await TodoList.findById(req.params.id);
    if (!list) return sendError(res, new Error("List not found"), 404);
    if (list.isDefault) throw new Error("The Tasks list can't be deleted.");
    await TodoTask.deleteMany({ list: list._id });
    await list.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

// --- Tasks ---

const LIST_FIELDS = "name color isDefault type";

function cleanStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
}

// Every descendant of the given tasks (their subtasks, and theirs).
async function descendantsOf(ids) {
  const all = [];
  let level = ids;
  for (let depth = 0; depth < MAX_TASK_DEPTH && level.length; depth++) {
    const children = await TodoTask.find({ parent: { $in: level } });
    all.push(...children);
    level = children.map((c) => c._id);
  }
  return all;
}

// 0–100: the share of its subtasks (all levels) that are completed, or the
// hand-set value when it has none. A completed task is always 100.
function progressOf(task, descendants) {
  if (task.completed) return 100;
  if (descendants.length === 0) return task.manualProgress ?? 0;
  return Math.round((descendants.filter((d) => d.completed).length / descendants.length) * 100);
}

// A task as the app receives it: plus subtask counts and progress.
function present(task, descendants = []) {
  const json = typeof task.toObject === "function" ? task.toObject() : task;
  return {
    ...json,
    progress: progressOf(json, descendants),
    subtaskCount: descendants.length,
    openSubtaskCount: descendants.filter((d) => !d.completed).length,
  };
}

// present() for many top-level tasks with one descendants query.
async function presentMany(tasks) {
  const all = await descendantsOf(tasks.map((t) => t._id));
  const byParent = new Map();
  for (const d of all) {
    const key = String(d.parent);
    byParent.set(key, [...(byParent.get(key) ?? []), d]);
  }
  const collect = (id) => (byParent.get(String(id)) ?? []).flatMap((c) => [c, ...collect(c._id)]);
  return tasks.map((t) => present(t, collect(t._id)));
}

async function taskListIds() {
  const lists = await TodoList.find({ type: { $ne: "checklist" } }).select("_id");
  return lists.map((l) => l._id);
}

async function nextNumber() {
  const last = await TodoTask.findOne({ number: { $ne: null } }).sort({ number: -1 }).select("number");
  return (last?.number ?? 0) + 1;
}

function setCompleted(task, completed) {
  if (completed === task.completed) return;
  if (completed) {
    task.previousStatus = task.status === "completed" ? "not_started" : task.status;
    task.status = "completed";
    task.completedAt = new Date();
  } else {
    task.status = task.previousStatus === "completed" ? "not_started" : task.previousStatus;
    task.completedAt = null;
  }
  task.completed = completed;
}

/**
 * GET /api/todo/tasks?list=<id>  or  ?smart=myday|important|planned|all&today=
 * Top-level items, open and completed together (the client splits them),
 * each with its list and its subtask counts / progress. Smart lists only
 * cover tasks lists.
 */
router.get("/tasks", async (req, res) => {
  try {
    let filter;
    if (req.query.list) {
      filter = { list: req.query.list };
    } else if (SMART_LISTS.includes(req.query.smart)) {
      filter = { ...smartFilter(req.query.smart, todayFrom(req)), list: { $in: await taskListIds() } };
    } else {
      throw new Error("Pass ?list=<id> or ?smart=myday|important|planned|all");
    }
    const tasks = await TodoTask.find({ ...filter, parent: null })
      .populate("list", LIST_FIELDS)
      .sort({ order: 1, createdAt: 1 });
    return res.json({ success: true, data: await presentMany(tasks) });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * GET /api/todo/dashboard?today=YYYY-MM-DD
 * The Lists home's summary of top-level tasks (tasks lists only): counts,
 * overall completion, and the recent and overdue ones.
 */
router.get("/dashboard", async (req, res) => {
  try {
    const today = todayFrom(req);
    const tasks = await TodoTask.find({ parent: null, list: { $in: await taskListIds() } })
      .populate("list", LIST_FIELDS)
      .sort({ updatedAt: -1 });
    const presented = await presentMany(tasks);
    const open = presented.filter((t) => !t.completed);
    const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
    return res.json({
      success: true,
      data: {
        total: presented.length,
        inProgress: presented.filter((t) => t.status === "in_progress").length,
        completed: presented.filter((t) => t.completed).length,
        overdue: overdue.length,
        completion: presented.length
          ? Math.round(presented.reduce((sum, t) => sum + t.progress, 0) / presented.length)
          : 0,
        recent: open.slice(0, 5),
        overdueTasks: overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 10),
      },
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

/**
 * GET /api/todo/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Tasks and subtasks switched on for the calendar, due in the range — each
 * with its top-level task (`root`) so the calendar can label and group them.
 */
router.get("/calendar", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from ?? "") || !DATE_RE.test(to ?? "")) throw new Error("from and to must be YYYY-MM-DD dates");
    const tasks = await TodoTask.find({ showInCalendar: true, dueDate: { $gte: from, $lte: to } })
      .sort({ dueDate: 1, depth: 1 })
      .lean();
    // Walk each subtask up to its top-level task.
    const byId = new Map(tasks.map((t) => [String(t._id), t]));
    let missing = tasks.map((t) => t.parent).filter((p) => p && !byId.has(String(p)));
    for (let i = 0; i < MAX_TASK_DEPTH && missing.length; i++) {
      const parents = await TodoTask.find({ _id: { $in: missing } }).lean();
      for (const p of parents) byId.set(String(p._id), p);
      missing = parents.map((p) => p.parent).filter((p) => p && !byId.has(String(p)));
    }
    const rootOf = (task) => {
      let current = task;
      while (current.parent && byId.get(String(current.parent))) current = byId.get(String(current.parent));
      return current;
    };
    return res.json({
      success: true,
      data: tasks.map((t) => {
        const root = rootOf(t);
        return {
          _id: t._id,
          title: t.title,
          dueDate: t.dueDate,
          depth: t.depth ?? 0,
          completed: !!t.completed,
          status: t.status,
          priority: t.priority,
          number: t.number,
          root: { _id: root._id, title: root.title, number: root.number },
        };
      }),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * GET /api/todo/tasks/:id
 * The task with its subtask tree (`subtasks`, each with its own `subtasks`)
 * and the chain of tasks above it (`ancestors`, top-level first).
 */
router.get("/tasks/:id", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id).populate("list", LIST_FIELDS);
    if (!task) return sendError(res, new Error("Task not found"), 404);

    const all = await descendantsOf([task._id]);
    const childrenOf = (id) => all.filter((d) => String(d.parent) === String(id));
    const under = (id) => childrenOf(id).flatMap((c) => [c, ...under(c._id)]);
    const tree = (id) =>
      childrenOf(id)
        .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
        .map((c) => ({ ...present(c, under(c._id)), subtasks: tree(c._id) }));

    const ancestors = [];
    let parentId = task.parent;
    while (parentId) {
      const parent = await TodoTask.findById(parentId).select("title number parent");
      if (!parent) break;
      ancestors.unshift({ _id: parent._id, title: parent.title, number: parent.number });
      parentId = parent.parent;
    }

    return res.json({ success: true, data: { ...present(task, all), subtasks: tree(task._id), ancestors } });
  } catch (error) {
    return sendError(res, error);
  }
});

// A task added from a smart list (no `list`) goes to the default Tasks
// list. With `parent`, it's a subtask: same list, one level deeper.
router.post("/tasks", async (req, res) => {
  try {
    const { list, parent, title, important, myDayDate, dueDate, doDate, description } = req.body;
    const dateOrNull = (value) => (typeof value === "string" && DATE_RE.test(value) ? value : null);
    let listId = list;
    let depth = 0;
    if (parent) {
      const parentTask = await TodoTask.findById(parent);
      if (!parentTask) throw new Error("Parent task not found");
      if ((parentTask.depth ?? 0) >= MAX_TASK_DEPTH) throw new Error(`Subtasks can only go ${MAX_TASK_DEPTH} levels deep.`);
      listId = parentTask.list;
      depth = (parentTask.depth ?? 0) + 1;
    }
    if (!listId) listId = (await getDefaultList())._id;
    const task = await TodoTask.create({
      list: listId,
      parent: parent || null,
      depth,
      number: await nextNumber(),
      title,
      important: !!important,
      myDayDate: typeof myDayDate === "string" && DATE_RE.test(myDayDate) ? myDayDate : null,
      dueDate: dateOrNull(dueDate),
      doDate: dateOrNull(doDate),
      description: typeof description === "string" ? description : "",
      order: await TodoTask.countDocuments({ list: listId, parent: parent || null }),
    });
    await task.populate("list", LIST_FIELDS);
    return res.status(201).json({ success: true, data: present(task) });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * PATCH /api/todo/tasks/:id
 * `completed` ticks it off (status -> completed) or back (-> the status it
 * had before). Completing with `completeSubtasks: true` also completes
 * every open subtask under it.
 */
router.patch("/tasks/:id", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    const b = req.body;

    for (const field of ["title", "description", "important", "myDayDate", "note", "showInCalendar", "order"]) {
      if (b[field] !== undefined) task[field] = b[field];
    }
    if (b.dueDate !== undefined) task.dueDate = typeof b.dueDate === "string" && DATE_RE.test(b.dueDate) ? b.dueDate : null;
    if (b.doDate !== undefined) task.doDate = typeof b.doDate === "string" && DATE_RE.test(b.doDate) ? b.doDate : null;
    if (b.priority !== undefined) {
      if (!TASK_PRIORITIES.includes(b.priority)) throw new Error("Unknown priority");
      task.priority = b.priority;
    }
    if (b.tags !== undefined) task.tags = cleanStrings(b.tags);
    if (b.parties !== undefined) task.parties = cleanStrings(b.parties);
    if (b.manualProgress !== undefined) task.manualProgress = Math.max(0, Math.min(100, Number(b.manualProgress) || 0));

    if (b.status !== undefined) {
      if (!TASK_STATUSES.includes(b.status)) throw new Error("Unknown status");
      if (b.status === "completed") setCompleted(task, true);
      else {
        setCompleted(task, false);
        task.status = b.status;
      }
    }
    if (b.completed !== undefined) setCompleted(task, !!b.completed);

    await task.save();
    if (task.completed && b.completeSubtasks) {
      for (const sub of await descendantsOf([task._id])) {
        if (!sub.completed) {
          setCompleted(sub, true);
          await sub.save();
        }
      }
    }
    await task.populate("list", LIST_FIELDS);
    return res.json({ success: true, data: present(task, await descendantsOf([task._id])) });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * POST /api/todo/tasks/:id/move  { parent, after }
 * Moves a subtask (with everything under it) to sit under `parent` — the
 * top-level task or another subtask in the same tree — right after its
 * sibling `after`, or first when `after` is null. Used by drag-and-drop.
 */
router.post("/tasks/:id/move", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    const newParent = await TodoTask.findById(req.body.parent);
    if (!newParent) throw new Error("Parent task not found");

    const subtree = await descendantsOf([task._id]);
    if (String(newParent._id) === String(task._id) || subtree.some((d) => String(d._id) === String(newParent._id))) {
      throw new Error("A task can't be moved inside itself.");
    }
    if (String(newParent.list) !== String(task.list)) throw new Error("Subtasks can only move within their own task.");

    const newDepth = (newParent.depth ?? 0) + 1;
    const height = Math.max(0, ...subtree.map((d) => (d.depth ?? 0) - (task.depth ?? 0)));
    if (newDepth + height > MAX_TASK_DEPTH) throw new Error(`Subtasks can only go ${MAX_TASK_DEPTH} levels deep.`);

    const delta = newDepth - (task.depth ?? 0);
    task.parent = newParent._id;
    task.depth = newDepth;
    await task.save();
    if (delta !== 0) {
      for (const d of subtree) {
        d.depth = (d.depth ?? 0) + delta;
        await d.save();
      }
    }

    // Renumber the new siblings with the moved task in its place.
    const siblings = await TodoTask.find({ parent: newParent._id, _id: { $ne: task._id } }).sort({ order: 1, createdAt: 1 });
    const afterIndex = req.body.after ? siblings.findIndex((s) => String(s._id) === String(req.body.after)) : -1;
    siblings.splice(afterIndex + 1, 0, task);
    await TodoTask.bulkWrite(
      siblings.map((s, order) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { order } } } })),
    );
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

// Deleting a task deletes its subtasks too.
router.delete("/tasks/:id", async (req, res) => {
  try {
    const task = await TodoTask.findByIdAndDelete(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    const subs = await descendantsOf([task._id]);
    await TodoTask.deleteMany({ _id: { $in: subs.map((s) => s._id) } });
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
