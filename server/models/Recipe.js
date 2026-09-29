import mongoose from "mongoose";
import { ratingPromptSchema } from "../services/ratingPrompt.js";
import { createNutritionSchema } from "./nutritionSchema.js";

const nutritionSchema = createNutritionSchema();

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

    // "quantity" (default) is today's behavior: `quantity`/`unit` is an
    // exact numeric target, split across pantry stock however needed to
    // hit it. "wholePiece" is for ingredients naturally sold/used as
    // discrete, irregularly-sized units (a fish fillet, a steak) — here
    // `quantity` means "how many whole pieces" and `unit` is just a
    // display label ("fillet"); pieceMinWeight/pieceMaxWeight/
    // pieceWeightUnit is the acceptable real-world weight range for one
    // piece, used by pantryDeduction.ts to pick whole matching pantry
    // items (never a partial cut off one) instead of splitting by weight.
    matchMode: { type: String, enum: ["quantity", "wholePiece"], default: "quantity" },
    pieceMinWeight: { type: Number, min: 0, default: null },
    pieceMaxWeight: { type: Number, min: 0, default: null },
    pieceWeightUnit: { type: String, trim: true, default: "g" },

    // "quantity" lines only: ask for the real amount used every time this
    // recipe is confirmed (e.g. potatoes weighed out per batch) instead of
    // silently using `quantity`. The confirm flow pre-fills the prompt with
    // `quantity` (scaled to servings, in this line's `unit`); whatever's
    // entered drives both the pantry deduction and the confirmed nutrition
    // snapshot. `quantity` itself stays the recipe's nominal amount (what
    // the stored recipe nutrition, availability checks, and grocery
    // shortfalls use).
    askAmount: { type: Boolean, default: false },
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

    // See services/ratingPrompt.js.
    ratingPrompt: { type: ratingPromptSchema, default: () => ({}) },

    // Last time the ingredient list or servings actually changed — a
    // rating older than this was for a different version of the dish, so
    // the planner asks again.
    contentChangedAt: { type: Date, default: null },

    ingredientList: [ingredientEntrySchema],

    instructions: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
  },
);

// A "wholePiece" line is meaningless without both ends of its weight range
// - "at least X" or "no more than X" alone would let deduction disagree
// with itself about what counts, so both are required together, same as
// Ingredient's own default-expiry-duration pair.
recipeSchema.pre("validate", function () {
  for (const entry of this.ingredientList) {
    if (entry.matchMode !== "wholePiece") continue;
    if (entry.pieceMinWeight == null || entry.pieceMaxWeight == null) {
      throw new Error(
        "A whole-piece ingredient line needs both a minimum and maximum piece weight",
      );
    }
    if (entry.pieceMinWeight > entry.pieceMaxWeight) {
      throw new Error(
        "A whole-piece ingredient line's minimum weight can't be greater than its maximum",
      );
    }
  }
});

const Recipe = mongoose.model("Recipe", recipeSchema);

export default Recipe;
