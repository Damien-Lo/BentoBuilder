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
  },
  { _id: false },
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

    mealCategory: {
      type: [{ type: String, enum: ["breakfast", "lunch", "dinner", "snack"] }],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one meal category is required",
      },
      required: true,
    },

    servings: {
      type: Number,
      min: 1,
      default: 1,
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

    nutritionBasis: {
      type: String,
      enum: ["per-serving", "per-100g"],
      default: "per-serving",
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

    ingredientList: [ingredientEntrySchema],

    instructions: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
  },
);

const Recipe = mongoose.model("Recipe", recipeSchema);

export default Recipe;
