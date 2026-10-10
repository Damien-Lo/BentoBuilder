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

const LIST_TYPES = ["tasks", "checklist", "project"];
const PROJECT_STATUSES = ["planning", "active", "on_hold", "done"];

// The project fields present in a request body, checked.
function projectFields(body) {
  const out = {};
  const dateOrNull = (value) => (typeof value === "string" && DATE_RE.test(value) ? value : null);
  if (body.description !== undefined) out.description = String(body.description ?? "");
  if (body.startDate !== undefined) out.startDate = dateOrNull(body.startDate);
  if (body.targetDate !== undefined) out.targetDate = dateOrNull(body.targetDate);
  if (body.projectStatus !== undefined) {
    if (!PROJECT_STATUSES.includes(body.projectStatus)) throw new Error("Unknown project status");
    out.projectStatus = body.projectStatus;
  }
  return out;
}

router.post("/lists", async (req, res) => {
  try {
    const { name, color, group, type, shopping } = req.body;
    const count = await TodoList.countDocuments();
    const list = await TodoList.create({
      name,
      color,
      group: group || null,
      order: count,
      type: LIST_TYPES.includes(type) ? type : "tasks",
      shopping: type === "checklist" && !!shopping,
      ...(type === "project" ? projectFields(req.body) : {}),
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
      if (list.isDefault && type !== "tasks") throw new Error("The Tasks list can't be a checklist or a project.");
      list.type = LIST_TYPES.includes(type) ? type : "tasks";
      if (list.type !== "checklist") list.shopping = false;
    }
    // A project's own goal, dates and status.
    Object.assign(list, projectFields(req.body));
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

// --- A project's phases ---

router.post("/lists/:id/phases", async (req, res) => {
  try {
    const list = await TodoList.findById(req.params.id);
    if (!list) return sendError(res, new Error("List not found"), 404);
    list.phases.push({ name: req.body.name, order: list.phases.length });
    await list.save();
    return res.status(201).json({ success: true, data: list });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch("/lists/:id/phases/:phaseId", async (req, res) => {
  try {
    const list = await TodoList.findById(req.params.id);
    const phase = list?.phases.id(req.params.phaseId);
    if (!phase) return sendError(res, new Error("Phase not found"), 404);
    if (req.body.name !== undefined) phase.name = req.body.name;
    await list.save();
    return res.json({ success: true, data: list });
  } catch (error) {
    return sendError(res, error);
  }
});

// Deleting a phase keeps its tasks — they just aren't in a phase any more.
router.delete("/lists/:id/phases/:phaseId", async (req, res) => {
  try {
    const list = await TodoList.findById(req.params.id);
    if (!list?.phases.id(req.params.phaseId)) return sendError(res, new Error("Phase not found"), 404);
    list.phases.pull(req.params.phaseId);
    list.phases.forEach((phase, index) => {
      phase.order = index;
    });
    await list.save();
    await TodoTask.updateMany({ list: list._id, phase: req.params.phaseId }, { $set: { phase: null } });
    return res.json({ success: true, data: list });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * PATCH /api/todo/lists/:id/plan
 * Body: { phases: [phaseId, …], tasks: [{ phase: phaseId | null, ids: [taskId, …] }] }
 * The project's plan as it now stands after something was moved: the
 * phases in order, and each phase's top-level tasks in order (`phase: null`
 * = the tasks in no phase). Either part may be left out.
 */
router.patch("/lists/:id/plan", async (req, res) => {
  try {
    const list = await TodoList.findById(req.params.id);
    if (!list) return sendError(res, new Error("List not found"), 404);
    if (Array.isArray(req.body.phases)) {
      const order = req.body.phases.map(String);
      list.phases.forEach((phase) => {
        const index = order.indexOf(String(phase._id));
        phase.order = index < 0 ? order.length : index;
      });
      list.phases.sort((a, b) => a.order - b.order);
      await list.save();
    }
    if (Array.isArray(req.body.tasks)) {
      const valid = new Set(list.phases.map((phase) => String(phase._id)));
      const writes = [];
      for (const group of req.body.tasks) {
        const phase = group.phase && valid.has(String(group.phase)) ? group.phase : null;
        (group.ids ?? []).forEach((id, order) => {
          writes.push({ updateOne: { filter: { _id: id, list: list._id, parent: null }, update: { $set: { phase, order } } } });
        });
      }
      if (writes.length) await TodoTask.bulkWrite(writes);
    }
    // Number the tasks straight through — the phases in order, each one's
    // tasks in order — so the project reads in plan order as a plain list
    // too (which is how the phone shows it).
    const phaseIndex = new Map(list.phases.map((phase, index) => [String(phase._id), index]));
    const tasks = await TodoTask.find({ list: list._id, parent: null }).select("phase order").lean();
    const place = (task) => phaseIndex.get(String(task.phase)) ?? -1;
    tasks.sort((a, b) => place(a) - place(b) || a.order - b.order);
    const renumber = tasks
      .map((task, order) => ({ task, order }))
      .filter(({ task, order }) => task.order !== order)
      .map(({ task, order }) => ({ updateOne: { filter: { _id: task._id }, update: { $set: { order } } } }));
    if (renumber.length) await TodoTask.bulkWrite(renumber);
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
  // Deleted tasks keep their numbers, so one that's restored never clashes.
  const last = await TodoTask.findOne({ number: { $ne: null } })
    .setOptions({ withDeleted: true })
    .sort({ number: -1 })
    .select("number");
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

// Each task with the top-level task it belongs to (walking up `parent`).
async function withRoots(tasks) {
  const byId = new Map(tasks.map((t) => [String(t._id), t]));
  let missing = tasks.map((t) => t.parent).filter((p) => p && !byId.has(String(p)));
  for (let i = 0; i < MAX_TASK_DEPTH && missing.length; i++) {
    const parents = await TodoTask.find({ _id: { $in: missing } }).lean();
    for (const p of parents) byId.set(String(p._id), p);
    missing = parents.map((p) => p.parent).filter((p) => p && !byId.has(String(p)));
  }
  return tasks.map((task) => {
    let root = task;
    while (root.parent && byId.get(String(root.parent))) root = byId.get(String(root.parent));
    return { task, root };
  });
}

// What the calendar needs to draw a task.
function calendarItem(task, root) {
  return {
    _id: task._id,
    title: task.title,
    dueDate: task.dueDate,
    depth: task.depth ?? 0,
    completed: !!task.completed,
    status: task.status,
    priority: task.priority,
    number: task.number,
    root: { _id: root._id, title: root.title, number: root.number },
  };
}

/**
 * GET /api/todo/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * What the calendar's Tasks calendar shows in the range:
 *   deadlines — tasks/subtasks switched on for the calendar, on their due date;
 *   blocks    — every work block scheduled for a task.
 */
router.get("/calendar", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from ?? "") || !DATE_RE.test(to ?? "")) throw new Error("from and to must be YYYY-MM-DD dates");
    const [due, scheduled] = await Promise.all([
      TodoTask.find({ showInCalendar: true, dueDate: { $gte: from, $lte: to } }).sort({ dueDate: 1, depth: 1 }).lean(),
      TodoTask.find({ workBlocks: { $elemMatch: { date: { $gte: from, $lte: to } } } }).lean(),
    ]);
    const rooted = await withRoots([...due, ...scheduled]);
    const rootOf = new Map(rooted.map(({ task, root }) => [String(task._id), root]));
    return res.json({
      success: true,
      data: {
        deadlines: due.map((t) => calendarItem(t, rootOf.get(String(t._id)))),
        blocks: scheduled.flatMap((t) =>
          t.workBlocks
            .filter((b) => b.date >= from && b.date <= to)
            .map((b) => ({
              ...calendarItem(t, rootOf.get(String(t._id))),
              blockId: b._id,
              date: b.date,
              startMinutes: b.startMinutes,
              endMinutes: b.endMinutes,
            })),
        ),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * GET /api/todo/unscheduled?today=YYYY-MM-DD
 * Open tasks and subtasks (tasks lists only) with no work block today or
 * later — what the calendar's scheduling strip offers. Soonest due first.
 */
router.get("/unscheduled", async (req, res) => {
  try {
    const today = todayFrom(req);
    const tasks = await TodoTask.find({
      completed: false,
      list: { $in: await taskListIds() },
      workBlocks: { $not: { $elemMatch: { date: { $gte: today } } } },
    })
      .limit(200)
      .lean();
    const rooted = await withRoots(tasks);
    const items = rooted.map(({ task, root }) => calendarItem(task, root));
    items.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.number ?? 0) - (b.number ?? 0));
    return res.json({ success: true, data: items });
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
    const { list, parent, title, important, myDayDate, dueDate, doDate, description, phase, startDate, milestone } = req.body;
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
      // A project's top-level tasks only.
      phase: !parent && phase ? phase : null,
      startDate: dateOrNull(startDate),
      milestone: !!milestone,
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
    if (b.startDate !== undefined) task.startDate = typeof b.startDate === "string" && DATE_RE.test(b.startDate) ? b.startDate : null;
    if (b.milestone !== undefined) task.milestone = !!b.milestone;
    if (b.phase !== undefined) task.phase = b.phase || null;
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

// The do date follows the schedule: the next block from today, else the
// most recent one.
function syncDoDate(task, today) {
  const dates = task.workBlocks.map((b) => b.date).sort();
  if (dates.length === 0) return;
  task.doDate = dates.find((d) => d >= today) ?? dates[dates.length - 1];
}

/**
 * POST /api/todo/tasks/:id/blocks  { date, startMinutes, endMinutes, today? }
 * Schedules time to work on a task: adds a work block. This is the one
 * "schedule task X from A to B" action every client uses.
 */
router.post("/tasks/:id/blocks", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    const { date } = req.body;
    const startMinutes = Number(req.body.startMinutes);
    const endMinutes = Number(req.body.endMinutes);
    if (!DATE_RE.test(date ?? "")) throw new Error("date must be YYYY-MM-DD");
    if (!(startMinutes >= 0 && endMinutes <= 1440 && endMinutes > startMinutes)) {
      throw new Error("The block needs a start and a later end, within one day.");
    }
    task.workBlocks.push({ date, startMinutes, endMinutes });
    syncDoDate(task, todayFrom(req));
    await task.save();
    return res.status(201).json({ success: true, data: task.workBlocks });
  } catch (error) {
    return sendError(res, error);
  }
});

// Moves one booking: PATCH { date?, startMinutes?, endMinutes?, today? }.
router.patch("/tasks/:id/blocks/:blockId", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    const block = task.workBlocks.id(req.params.blockId);
    if (!block) return sendError(res, new Error("That time is no longer booked"), 404);
    const date = req.body.date ?? block.date;
    const startMinutes = Number(req.body.startMinutes ?? block.startMinutes);
    const endMinutes = Number(req.body.endMinutes ?? block.endMinutes);
    if (!DATE_RE.test(date)) throw new Error("date must be YYYY-MM-DD");
    if (!(startMinutes >= 0 && endMinutes <= 1440 && endMinutes > startMinutes)) {
      throw new Error("The block needs a start and a later end, within one day.");
    }
    Object.assign(block, { date, startMinutes, endMinutes });
    syncDoDate(task, todayFrom(req));
    await task.save();
    return res.json({ success: true, data: task.workBlocks });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/tasks/:id/blocks/:blockId", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    task.workBlocks.pull(req.params.blockId);
    if (task.workBlocks.length === 0) task.doDate = null;
    else syncDoDate(task, todayFrom(req));
    await task.save();
    return res.json({ success: true, data: task.workBlocks });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * POST /api/todo/tasks/:id/to-project  { group? }
 * A task that has outgrown being a task becomes a project: a project list
 * named after it (its description and due date carried over), with its
 * subtasks as the project's tasks, each a level higher than before. `group`
 * puts the project in a group; left out, it stays in its old list's group.
 */
router.post("/tasks/:id/to-project", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    if (task.parent) throw new Error("Only a top-level task can become a project.");
    const source = await TodoList.findById(task.list);
    if (source?.type === "checklist") throw new Error("A checklist item can't become a project.");

    const project = await TodoList.create({
      name: task.title,
      color: source?.color ?? "blue",
      type: "project",
      group: req.body.group !== undefined ? req.body.group || null : source?.group ?? null,
      order: await TodoList.countDocuments(),
      description: [task.description, task.note].filter(Boolean).join("\n\n"),
      startDate: task.startDate ?? null,
      targetDate: task.dueDate ?? null,
      projectStatus: { completed: "done", in_progress: "active", on_hold: "on_hold" }[task.status] ?? "planning",
    });

    // Everything under it moves into the project, a level up — including
    // anything of its in "Recently deleted", so a restore still lands right.
    let level = [task._id];
    for (let depth = 0; depth < MAX_TASK_DEPTH && level.length; depth++) {
      const children = await TodoTask.find({ parent: { $in: level } }).setOptions({ withDeleted: true }).select("_id");
      const ids = children.map((c) => c._id);
      await TodoTask.updateMany(
        { _id: { $in: ids } },
        { $set: { list: project._id, depth, ...(depth === 0 ? { parent: null } : {}) } },
      );
      level = ids;
    }
    await TodoTask.deleteOne({ _id: task._id });
    return res.status(201).json({ success: true, data: project });
  } catch (error) {
    return sendError(res, error);
  }
});

// Deleted tasks wait this long in "Recently deleted" before they're gone.
const DELETED_KEEP_DAYS = 30;

async function purgeOldDeleted() {
  const cutoff = new Date(Date.now() - DELETED_KEEP_DAYS * 86_400_000);
  await TodoTask.deleteMany({ deletedAt: { $ne: null, $lt: cutoff } });
}

/**
 * GET /api/todo/deleted
 * What's in "Recently deleted": each task that was deleted (not the
 * subtasks that went with it — those are counted), newest first.
 */
router.get("/deleted", async (req, res) => {
  try {
    await purgeOldDeleted();
    const all = await TodoTask.find({ deletedAt: { $ne: null } })
      .setOptions({ withDeleted: true })
      .populate("list", LIST_FIELDS)
      .sort({ deletedAt: -1 })
      .lean();
    const titles = new Map(all.map((t) => [String(t._id), t.title]));
    const roots = all.filter((t) => String(t.deletedRoot ?? t._id) === String(t._id));
    const parents = await TodoTask.find({ _id: { $in: roots.map((r) => r.parent).filter(Boolean) } })
      .setOptions({ withDeleted: true })
      .select("title")
      .lean();
    for (const p of parents) titles.set(String(p._id), p.title);
    const data = roots.map((root) => ({
      _id: root._id,
      title: root.title,
      number: root.number,
      depth: root.depth,
      list: root.list,
      parentTitle: root.parent ? titles.get(String(root.parent)) ?? null : null,
      completed: root.completed,
      deletedAt: root.deletedAt,
      subtaskCount: all.filter((t) => String(t.deletedRoot) === String(root._id)).length - 1,
      daysLeft: Math.max(0, DELETED_KEEP_DAYS - Math.floor((Date.now() - new Date(root.deletedAt).getTime()) / 86_400_000)),
    }));
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
});

// Puts a deleted task (and the subtasks deleted with it) back.
router.post("/tasks/:id/restore", async (req, res) => {
  try {
    const task = await TodoTask.findOne({ _id: req.params.id, deletedAt: { $ne: null } }).setOptions({ withDeleted: true });
    if (!task) return sendError(res, new Error("That task is no longer in Recently deleted"), 404);
    if (task.parent) {
      const parent = await TodoTask.findById(task.parent)
        .setOptions({ withDeleted: true })
        .select("title deletedAt deletedRoot")
        .populate({ path: "deletedRoot", select: "title", options: { withDeleted: true } });
      if (!parent) throw new Error("The task this belonged to is gone for good, so it can't be put back.");
      if (parent.deletedAt) {
        throw new Error(`Restore "${parent.deletedRoot?.title ?? parent.title}" first — this was inside it.`);
      }
    }
    await TodoTask.updateMany(
      { deletedRoot: task._id, deletedAt: { $ne: null } },
      { $set: { deletedAt: null, deletedRoot: null } },
    );
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

// Removes a deleted task for good, before its 30 days are up.
router.delete("/deleted/:id", async (req, res) => {
  try {
    await TodoTask.deleteMany({ deletedRoot: req.params.id, deletedAt: { $ne: null } });
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/deleted", async (req, res) => {
  try {
    await TodoTask.deleteMany({ deletedAt: { $ne: null } });
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

// Deleting a task moves it, and its subtasks, to "Recently deleted" for
// 30 days. Nothing is removed here.
router.delete("/tasks/:id", async (req, res) => {
  try {
    const task = await TodoTask.findById(req.params.id);
    if (!task) return sendError(res, new Error("Task not found"), 404);
    const subs = await descendantsOf([task._id]);
    await TodoTask.updateMany(
      { _id: { $in: [task._id, ...subs.map((s) => s._id)] } },
      { $set: { deletedAt: new Date(), deletedRoot: task._id } },
    );
    void purgeOldDeleted().catch(() => {});
    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
