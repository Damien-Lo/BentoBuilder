import mongoose from "mongoose";

const nutritionSchema = new mongoose.Schema(
  {
    calories: {
      type: Number,
      min: 0,
      default: null,
    },
    protein: {
      type: Number,
      min: 0,
      default: null,
    },
    carbs: {
      type: Number,
      min: 0,
      default: null,
    },
    fats: {
      type: Number,
      min: 0,
      default: null,
    },
    fiber: {
      type: Number,
      min: 0,
      default: null,
    },
    sodium: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const ingredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Ingredient name is required"],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "IngredientCategory",
        required: true,
    },

    brand: {
      type: String,
      trim: true,
      default: "",
    },

    barcode: {
      type: String,
      trim: true,
      default: null,
    },

    defaultPortionAmount: {
      type: Number,
      min: 0,
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
  },
  {
    timestamps: true,
  }
);

// Prevent multiple ingredient records from using the same barcode.
// Sparse means ingredients without a barcode are still allowed.
ingredientSchema.index(
  { barcode: 1 },
  {
    unique: true,
    sparse: true,
  }
);

const Ingredient = mongoose.model("Ingredient", ingredientSchema);

export default Ingredient;