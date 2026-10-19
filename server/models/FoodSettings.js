import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";
import { ratingPromptSchema } from "../services/ratingPrompt.js";

// One person's own side of a shared ingredient or recipe: how they rated
// it, their notes, when it counts as low in their kitchen, how they thaw it,
// where they keep it, whether a recipe is one of their keepers.
//
// Shared catalog items keep these fields on themselves for the admin (it's
// their catalog, and it was all theirs before accounts); for everyone else
// they're kept here and shown in their place — see services/catalog.js,
// which lists the fields (PERSONAL_FIELDS). An item a person made themselves
// keeps them on the item, since no one else sees it.

// Mirrors Ingredient.js's and Recipe.js's scoreEntrySchema exactly.
const scoreEntrySchema = new mongoose.Schema(
  {
    value: { type: Number, min: 1, max: 10, required: true },
    ratedAt: { type: Date, default: Date.now },
    mealPlanEntry: { type: mongoose.Schema.Types.ObjectId, ref: "MealPlanEntry", default: null },
  },
  { timestamps: true },
);

const foodSettingsSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["ingredient", "recipe"], required: true },
    item: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Both
    notes: { type: String, trim: true, default: "" },
    scores: { type: [scoreEntrySchema], default: [] },
    ratingPrompt: { type: ratingPromptSchema, default: () => ({}) },

    // Ingredients (see Ingredient.js for what each means)
    lowStockThreshold: { type: Number, min: 0, default: null },
    isAlwaysAvailable: { type: Boolean, default: false },
    cooksFromFrozen: { type: Boolean, default: null },
    thawLeads: { type: [Number], default: [] },
    defaultStorageLocation: { type: mongoose.Schema.Types.ObjectId, ref: "StorageLocation", default: null },
    defaultExpiryDurationAmount: { type: Number, min: 0, default: null },
    defaultExpiryDurationUnit: { type: String, enum: ["day", "week", "month", "year", null], default: null },

    // Recipes
    isConfirmed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

foodSettingsSchema.plugin(ownedByUser);
foodSettingsSchema.index({ owner: 1, kind: 1, item: 1 }, { unique: true });

export default mongoose.model("FoodSettings", foodSettingsSchema);
