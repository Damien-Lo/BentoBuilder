import mongoose from "mongoose";

// A user-made to-do list (or the built-in default "Tasks" list). The smart
// lists — My Day, Important, Planned, All — aren't stored: they're views
// over TodoTask computed in TodoRoutes.js.
const todoListSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "List name is required"], trim: true },
    // Theme colour key (see the mobile side's TODO_LIST_COLORS) — tints the
    // list's title, icon, checkboxes and "Add a Task" bar.
    color: { type: String, trim: true, default: "blue" },
    // "tasks": full tasks (status, due dates, subtasks, calendar).
    // "checklist": plain tickable lines — a note in list form; kept out of
    // the smart lists, the dashboard and the calendar.
    // "project": a tasks list planned as a whole — it has a goal, dates and
    // a status of its own, and its tasks are grouped into ordered phases.
    // Its tasks are ordinary tasks, so they show in My Day, the smart
    // lists and the calendar like any other.
    type: { type: String, enum: ["tasks", "checklist", "project"], default: "tasks" },
    // A checklist that's a shopping list — shown on the Shopping tab
    // instead of the Checklists tab.
    shopping: { type: Boolean, default: false },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "TodoGroup", default: null },
    order: { type: Number, default: 0 },
    // The built-in "Tasks" list: where tasks added from a smart list land.
    // Exactly one exists (created on first use); it can't be deleted or
    // put in a group.
    isDefault: { type: Boolean, default: false },

    // --- Projects only ---
    description: { type: String, trim: true, default: "" },
    // "YYYY-MM-DD", like the rest of the app's dates.
    startDate: { type: String, default: null },
    targetDate: { type: String, default: null },
    projectStatus: { type: String, enum: ["planning", "active", "on_hold", "done"], default: "planning" },
    // Named, ordered sections its tasks are grouped into (a task points at
    // one through TodoTask.phase; none = not in a phase yet).
    phases: {
      type: [{ name: { type: String, required: true, trim: true }, order: { type: Number, default: 0 } }],
      default: [],
    },
  },
  { timestamps: true },
);

const TodoList = mongoose.model("TodoList", todoListSchema);
export default TodoList;
