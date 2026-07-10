import mongoose from "mongoose";

const mealPlanEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: [true, "Date is required"] }, // "YYYY-MM-DD"
    slot: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snack"],
      required: [true, "Slot is required"],
    },
    meal:       { type: mongoose.Schema.Types.ObjectId, ref: "Meal", required: [true, "Meal is required"] },
    notes:      { type: String, trim: true, default: "" },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

mealPlanEntrySchema.index({ date: 1 });

const MealPlanEntry = mongoose.model("MealPlanEntry", mealPlanEntrySchema);
export default MealPlanEntry;
