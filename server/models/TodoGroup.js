import mongoose from "mongoose";

// A named folder of to-do lists on the Lists home (e.g. "Personal Admin"
// holding "Personal Tasks" and "Shopping List"). One level deep only — a
// group holds lists, never other groups.
const todoGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Group name is required"], trim: true },
    // Collapsed on the Lists home (its lists hidden under the header).
    collapsed: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const TodoGroup = mongoose.model("TodoGroup", todoGroupSchema);
export default TodoGroup;
