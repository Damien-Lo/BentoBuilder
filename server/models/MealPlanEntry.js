import mongoose from "mongoose";

const stockDeductionSchema = new mongoose.Schema(
  {
    pantryItem: { type: mongoose.Schema.Types.ObjectId, ref: "PantryItem", required: true },
    amount: { type: Number, min: 0, required: true },
  },
  { _id: false },
);

const mealPlanEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: [true, "Date is required"] }, // "YYYY-MM-DD"
    slot: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snack"],
      required: [true, "Slot is required"],
    },
    meal:               { type: mongoose.Schema.Types.ObjectId, ref: "Meal" },

    recipe:             { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
    recipeServings:     { type: Number, min: 0, default: 1 },

    ingredient:         { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient" },
    ingredientQuantity: { type: Number, min: 0 },
    ingredientUnit:     { type: String, trim: true, default: "" },

    // "planned" = tentative, not yet eaten; "confirmed" = logged as actually eaten
    status: {
      type: String,
      enum: ["planned", "confirmed"],
      default: "planned",
    },

    // Exactly what was deducted from the pantry when this entry was
    // confirmed — populated by POST /:id/confirm, replayed in reverse by
    // POST /:id/unconfirm (or on delete of a confirmed entry) so undoing a
    // confirm restores the same pantry items by the same amounts rather
    // than guessing.
    stockDeductions: [stockDeductionSchema],

    notes:      { type: String, trim: true, default: "" },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

mealPlanEntrySchema.pre("validate", function () {
  const count = [this.meal, this.recipe, this.ingredient].filter(Boolean).length;
  if (count !== 1) {
    throw new Error("Exactly one of meal, recipe, or ingredient is required");
  }
});

mealPlanEntrySchema.index({ date: 1 });

const MealPlanEntry = mongoose.model("MealPlanEntry", mealPlanEntrySchema);
export default MealPlanEntry;
