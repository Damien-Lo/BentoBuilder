import express from "express";

import TodoGroup from "../models/TodoGroup.js";
import TodoList from "../models/TodoList.js";
import TodoTask from "../models/TodoTask.js";

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
    case "planned": return { dueDate: { $ne: null } };
    default: return {};
  }
}

// --- Date math for repeating tasks (date-only "YYYY-MM-DD", in UTC so no
// timezone can shift a day) ---
function toDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toStr(date) {
  return date.toISOString().slice(0, 10);
}
function addMonthsClamped(date, months) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}
export function nextDueDate(fromStr, repeat) {
  const date = toDate(fromStr);
  const n = repeat.interval || 1;
  switch (repeat.frequency) {
    case "daily":
      date.setUTCDate(date.getUTCDate() + n);
      return toStr(date);
    case "weekdays":
      do date.setUTCDate(date.getUTCDate() + 1);
      while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
      return toStr(date);
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7 * n);
      return toStr(date);
    case "monthly":
      return toStr(addMonthsClamped(date, n));
    case "yearly":
      return toStr(addMonthsClamped(date, 12 * n));
    default:
      return fromStr;
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
    const [groups, lists, openTasks] = await Promise.all([
      TodoGroup.find({}).sort({ order: 1, createdAt: 1 }),
      TodoList.find({}).sort({ order: 1, createdAt: 1 }),
      TodoTask.find({ completed: false }).select("list important myDayDate dueDate").lean(),
    ]);

    const openByList = new Map();
    for (const t of openTasks) openByList.set(String(t.list), (openByList.get(String(t.list)) ?? 0) + 1);

    return res.json({
      success: true,
      data: {
        groups,
        lists: lists.map((l) => ({ ...l.toObject(), openCount: openByList.get(String(l._id)) ?? 0 })),
        smartCounts: {
          myday: openTasks.filter((t) => t.myDayDate === today).length,
          important: openTasks.filter((t) => t.important).length,
          planned: openTasks.filter((t) => t.dueDate).length,
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
    const { name, color, group } = req.body;
    const count = await TodoList.countDocuments();
    const list = await TodoList.create({ name, color, group: group || null, order: count });
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
    const { name, color, group } = req.body;
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

/**
 * GET /api/todo/tasks?list=<id>  or  ?smart=myday|important|planned|all&today=
 * Open and completed tasks together (the client splits them), oldest
 * first, each with its list's name/colour for the smart views.
 */
router.get("/tasks", async (req, res) => {
  try {
    let filter;
    if (req.query.list) {
      filter = { list: req.query.list };
    } else if (SMART_LISTS.includes(req.query.smart)) {
      filter = smartFilter(req.query.smart, todayFrom(req));
    } else {
      throw new Error("Pass ?list=<id> or ?smart=myday|important|planned|all");
    }
    const tasks = await TodoTask.find(filter).populate("list", "name color isDefault").sort({ createdAt: 1 });
    return res.json({ success: true, data: tasks });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get("/tasks/:id", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id).populate("list", "name color isDefault");
    if (!task) return sendError(res, new Error("Task not found"), 404);
    return res.json({ success: true, data: task });
  } catch (error) {
    return sendError(res, error);
  }
});

// A task added from a smart list (no `list`) goes to the default Tasks list.
router.post("/tasks", async (req, res) => {
  try {
    const { list, title, important, myDayDate, dueDate } = req.body;
    const listId = list || (await getDefaultList())._id;
    const task = await TodoTask.create({
      list: listId,
      title,
      important: !!important,
      myDayDate: typeof myDayDate === "string" && DATE_RE.test(myDayDate) ? myDayDate : null,
      dueDate: typeof dueDate === "string" && DATE_RE.test(dueDate) ? dueDate : null,
    });
    await task.populate("list", "name color isDefault");
    return res.status(201).json({ success: true, data: task });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * PATCH /api/todo/tasks/:id
 * Completing a repeating task also creates its next occurrence (same
 * title/list/steps reset/note, due date moved on by the repeat rule) —
 * returned as `next`.
 */
router.patch("/tasks/:id", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);

    const fields = ["title", "important", "myDayDate", "dueDate", "repeat", "steps", "note", "list"];
    for (const field of fields) {
      if (req.body[field] !== undefined) task[field] = req.body[field];
    }

    let next = null;
    if (req.body.completed !== undefined && !!req.body.completed !== task.completed) {
      task.completed = !!req.body.completed;
      task.completedAt = task.completed ? new Date() : null;
      if (task.completed && task.repeat) {
        next = await TodoTask.create({
          list: task.list,
          title: task.title,
          important: task.important,
          dueDate: nextDueDate(task.dueDate || todayFrom(req), task.repeat),
          repeat: task.repeat,
          steps: task.steps.map((s) => ({ title: s.title, completed: false })),
          note: task.note,
        });
        // The finished occurrence no longer repeats — the new one carries it.
        task.repeat = null;
      }
    }

    await task.save();
    await task.populate("list", "name color isDefault");
    if (next) await next.populate("list", "name color isDefault");
    return res.json({ success: true, data: task, next });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const task = await TodoTask.findByIdAndDelete(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
