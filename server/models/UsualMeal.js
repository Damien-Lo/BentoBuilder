import mongoose from "mongoose";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A food you usually have for a meal on certain days of the week, e.g. the
// same breakfast every weekday. The planner fills itself with planned
// (unconfirmed) entries for it a couple of weeks ahead — see
// services/usualMeals.js — so on the day it only needs confirming.
//
// Exactly one of meal / recipe / ingredient / restaurantMeal is set, with
// the same companion fields as a MealPlanEntry (which is what it's copied
// into).
const usualMealSchema = new mongoose.Schema(
  {
    slot: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"], required: true },
    // 0 = Sunday … 6 = Saturday.
    weekdays: { type: [{ type: Number, min: 0, max: 6 }], default: [] },

    meal: { type: mongoose.Schema.Types.ObjectId, ref: "Meal" },
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
    recipeServings: { type: Number, min: 0, default: 1 },
    ingredient: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient" },
    ingredientQuantity: { type: Number, min: 0 },
    ingredientUnit: { type: String, trim: true, default: "" },
    restaurantMeal: { type: mongoose.Schema.Types.ObjectId, ref: "RestaurantMeal" },
    restaurantDishSelections: {
      type: [{ _id: false, dish: mongoose.Schema.Types.ObjectId, quantity: { type: Number, default: 1 } }],
      default: [],
    },

    // First and last day it applies ("YYYY-MM-DD"); no end = until stopped.
    startDate: { type: String, required: true, match: DATE_RE },
    endDate: { type: String, match: DATE_RE, default: null },
    // Days it was removed from on their own ("just this day").
    skippedDates: [{ type: String, match: DATE_RE }],
    // Switched off: kept, but fills nothing in until switched back on.
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

usualMealSchema.pre("validate", function () {
  const count = [this.meal, this.recipe, this.ingredient, this.restaurantMeal].filter(Boolean).length;
  if (count !== 1) throw new Error("A usual needs exactly one of meal, recipe, ingredient or restaurantMeal");
  if (!this.weekdays?.length) throw new Error("Pick at least one day of the week");
});

const UsualMeal = mongoose.model("UsualMeal", usualMealSchema);
export default UsualMeal;
