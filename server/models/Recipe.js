import mongoose from "mongoose";

const nutritionSchema = new mongoose.Schema(
  {
    calories: { type: Number, min: 0, default: null },
    protein: { type: Number, min: 0, default: null },
    carbs: { type: Number, min: 0, default: null },
    fats: { type: Number, min: 0, default: null },
    fiber: { type: Number, min: 0, default: null },
    sodium: { type: Number, min: 0, default: null },
  },
  { _id: false },
);

const ingredientEntrySchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: true,
    },
    quantity: { type: Number, min: 0, default: 1 },
    unit: { type: String, trim: true, default: "" },

    // How much of this line's nutrition actually ends up in the dish —
    // 1 (default) counts it in full, 0 omits it entirely, and a fraction
    // like 0.1 covers cases where most of the ingredient is rinsed off or
    // discarded (e.g. baking soda used to soften kelp noodles) rather than
    // eaten. Multiplies straight into calcNutrition's per-line contribution.
    nutritionFactor: { type: Number, min: 0, max: 1, default: 1 },
  },
  { _id: false },
);

// One manual (or, eventually, meal-plan-prompted) rating of a recipe.
// Kept as raw individual entries rather than a rolling average so nothing
// is ever thrown away — "last 50" is a display-time window over this array,
// not a storage cap.
const scoreEntrySchema = new mongoose.Schema(
  {
    value: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    ratedAt: {
      type: Date,
      default: Date.now,
    },
    // Set once the meal planner can prompt "rate what you just cooked" —
    // always null for a manually-added score.
    mealPlanEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MealPlanEntry",
      default: null,
    },
  },
  { timestamps: true },
);

const recipeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Recipe name is required"],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    recipeCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecipeCategory",
      default: null,
    },

    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],

    // Optional — a recipe that only exists to produce an ingredient (e.g. a
    // meal-prep batch) isn't a meal itself and doesn't need one of these.
    mealCategory: {
      type: [{ type: String, enum: ["breakfast", "lunch", "dinner", "snack"] }],
      default: [],
    },

    servings: {
      type: Number,
      min: 1,
      default: 1,
    },

    prepTimeMinutes: {
      type: Number,
      min: 0,
      default: null,
    },

    cookTimeMinutes: {
      type: Number,
      min: 0,
      default: null,
    },

    defaultPortionUnit: {
      type: String,
      trim: true,
      default: "serving",
    },

    nutrition: {
      type: nutritionSchema,
      default: () => ({}),
    },

    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    // Manual curation flag — "want to try" (false, the default for a newly
    // saved recipe) vs "confirmed" (true, a recipe the user has decided is
    // a keeper). Distinct from MealPlanEntry.status ("planned"/"confirmed"),
    // which tracks whether a specific calendar slot has been eaten yet —
    // this tracks the recipe itself, independent of any one meal plan.
    isConfirmed: {
      type: Boolean,
      default: false,
    },

    scores: {
      type: [scoreEntrySchema],
      default: [],
    },

    ingredientList: [ingredientEntrySchema],

    instructions: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
  },
);

const Recipe = mongoose.model("Recipe", recipeSchema);

export default Recipe;
