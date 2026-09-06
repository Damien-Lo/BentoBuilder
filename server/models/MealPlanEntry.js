import mongoose from "mongoose";

const stockDeductionSchema = new mongoose.Schema(
  {
    pantryItem: { type: mongoose.Schema.Types.ObjectId, ref: "PantryItem", required: true },
    amount: { type: Number, min: 0, required: true },
  },
  { _id: false },
);

const restaurantDishSelectionSchema = new mongoose.Schema(
  {
    dish: { type: mongoose.Schema.Types.ObjectId, required: true },
    // How many of this dish were had on this specific visit - lets "I got 2
    // tacos this time" scale just this one entry's nutrition without
    // touching the shared dish's base definition (still "1 taco") in the
    // RestaurantMeal catalog. Defaults to 1, the common case.
    quantity: { type: Number, min: 0.01, default: 1 },
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

    // A restaurant/eating-out visit — no ingredients, no pantry deduction.
    restaurantMeal:     { type: mongoose.Schema.Types.ObjectId, ref: "RestaurantMeal" },
    // Which dish(es) from that restaurant's dish list were actually eaten,
    // and how many of each — a restaurant can have several independent
    // dishes (e.g. two separate orders logged under the same visit), and
    // without this, nutrition calculations would sum every dish on the
    // restaurant's menu instead of just what this entry represents. `dish`
    // references a RestaurantMeal.dishes subdocument (not its own
    // collection, so no `ref`/populate here — the client already has the
    // full dish list from populating restaurantMeal and just filters it by
    // these ids).
    restaurantDishSelections: { type: [restaurantDishSelectionSchema], default: [] },

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
  const count = [this.meal, this.recipe, this.ingredient, this.restaurantMeal].filter(Boolean).length;
  if (count !== 1) {
    throw new Error("Exactly one of meal, recipe, ingredient, or restaurantMeal is required");
  }
});

mealPlanEntrySchema.index({ date: 1 });

const MealPlanEntry = mongoose.model("MealPlanEntry", mealPlanEntrySchema);
export default MealPlanEntry;
