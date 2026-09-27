import mongoose from "mongoose";

const stepSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
  },
  { _id: true },
);

// "Repeat" — when a repeating task with a due date is completed, the next
// occurrence is created automatically (see TodoRoutes.js).
const repeatSchema = new mongoose.Schema(
  {
    frequency: { type: String, enum: ["daily", "weekdays", "weekly", "monthly", "yearly"], required: true },
    interval: { type: Number, min: 1, default: 1 },
  },
  { _id: false },
);

const todoTaskSchema = new mongoose.Schema(
  {
    list: { type: mongoose.Schema.Types.ObjectId, ref: "TodoList", required: true },
    title: { type: String, required: [true, "Task title is required"], trim: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    important: { type: Boolean, default: false },
    // "YYYY-MM-DD" of the day this was added to My Day — it's only in My Day
    // while this equals today, so My Day empties itself each morning
    // without any cleanup job.
    myDayDate: { type: String, default: null },
    // "YYYY-MM-DD" — date-only, like the rest of the app's calendar dates.
    dueDate: { type: String, default: null },
    repeat: { type: repeatSchema, default: null },
    steps: { type: [stepSchema], default: [] },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

todoTaskSchema.index({ list: 1, completed: 1 });

const TodoTask = mongoose.model("TodoTask", todoTaskSchema);
export default TodoTask;
