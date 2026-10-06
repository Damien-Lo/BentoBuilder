import mongoose from "mongoose";

export const TASK_STATUSES = ["not_started", "in_progress", "on_hold", "completed"];
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
// Subtasks nest this deep below a top-level task (depth 0). Each task only
// points at its parent, so raising this needs no data change.
export const MAX_TASK_DEPTH = 2;

// An item in a list. In a checklist it's just a title and a tick; in a
// tasks list it's a full task: status, priority, due date, tags, people,
// progress, and subtasks (other TodoTasks whose `parent` is this one).
const todoTaskSchema = new mongoose.Schema(
  {
    list: { type: mongoose.Schema.Types.ObjectId, ref: "TodoList", required: true },
    // The task this is a subtask of (null = top level), and how deep it is.
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "TodoTask", default: null },
    depth: { type: Number, min: 0, max: MAX_TASK_DEPTH, default: 0 },
    // Short reference number ("#12"), unique, assigned on creation.
    number: { type: Number, default: null },
    title: { type: String, required: [true, "Task title is required"], trim: true },
    description: { type: String, trim: true, default: "" },
    status: { type: String, enum: TASK_STATUSES, default: "not_started" },
    // What the status was before it was ticked off — unticking restores it.
    previousStatus: { type: String, enum: TASK_STATUSES, default: "not_started" },
    // Mirrors status === "completed" (kept for simple queries/indexes).
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    priority: { type: String, enum: TASK_PRIORITIES, default: "medium" },
    important: { type: Boolean, default: false },
    // "YYYY-MM-DD" of the day this was added to My Day — it's only in My Day
    // while this equals today, so My Day empties itself each morning
    // without any cleanup job.
    myDayDate: { type: String, default: null },
    // "YYYY-MM-DD" — date-only, like the rest of the app's calendar dates.
    dueDate: { type: String, default: null },
    // "YYYY-MM-DD" — the day you plan to work on it (the due date is when
    // it has to be finished).
    doDate: { type: String, default: null },
    tags: { type: [String], default: [] },
    // "Relevant parties" — free-text names (there are no user accounts).
    parties: { type: [String], default: [] },
    note: { type: String, default: "" },
    // 0–100, set by hand; only used while the task has no subtasks (with
    // subtasks, progress is the share of them completed).
    manualProgress: { type: Number, min: 0, max: 100, default: 0 },
    // Show this task's due date in the calendar's built-in Tasks calendar.
    showInCalendar: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

todoTaskSchema.index({ list: 1, completed: 1 });
todoTaskSchema.index({ parent: 1 });

const TodoTask = mongoose.model("TodoTask", todoTaskSchema);
export default TodoTask;
