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

// Mirrors Recipe.js's scoreEntrySchema exactly — kept as raw individual
// entries rather than a rolling average so nothing is ever thrown away.
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
    mealPlanEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MealPlanEntry",
      default: null,
    },
  },
  { timestamps: true },
);

const dishSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Dish name is required"], trim: true },
    notes: { type: String, trim: true, default: "" },
    // What this dish cost, if known — optional, purely for price tracking
    // (mirrors PantryItem.purchasePrice's role for pantry entries).
    price: { type: Number, min: 0, default: null },
    // Manual estimate — restaurant nutrition is rarely known precisely, so
    // every field is optional and a missing value is skipped (not treated
    // as 0) when a meal-plan day's nutrition totals are summed.
    nutrition: {
      type: nutritionSchema,
      default: () => ({}),
    },
    scores: {
      type: [scoreEntrySchema],
      default: [],
    },
  },
  { _id: true },
);

const restaurantMealSchema = new mongoose.Schema(
  {
    restaurantName: {
      type: String,
      required: [true, "Restaurant name is required"],
      trim: true,
    },
    dishes: {
      type: [dishSchema],
      default: [],
    },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const RestaurantMeal = mongoose.model("RestaurantMeal", restaurantMealSchema);

export default RestaurantMeal;
