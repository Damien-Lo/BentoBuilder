import mongoose from "mongoose";

// A change someone suggested to a public restaurant or dish (see
// routes/RestaurantRoutes.js) — an edit (the fields as they'd be) or taking a
// dish off the menu — waiting for a reviewer. Approved, it's made (and kept in
// the item's history, as the suggester's, with who approved it); rejected,
// nothing changes, with the reviewer's reason.
const changeRequestSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["restaurant", "dish"], required: true },
    item: { type: mongoose.Schema.Types.ObjectId, required: true },
    // The restaurant it's about (a dish's, or the restaurant itself) — for showing.
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", default: null },
    action: { type: String, enum: ["edit", "remove"], required: true },
    // { field: value as it'd be } and { field: value as it was }.
    changes: { type: mongoose.Schema.Types.Mixed, default: {} },
    before: { type: mongoose.Schema.Types.Mixed, default: {} },
    note: { type: String, trim: true, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

changeRequestSchema.index({ status: 1, createdAt: 1 });
changeRequestSchema.index({ item: 1, status: 1 });

export default mongoose.model("ChangeRequest", changeRequestSchema);
