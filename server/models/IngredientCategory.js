import mongoose from "mongoose";

const ingredientCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    // Add userId here once authentication exists.
  },
  {
    timestamps: true,
  }
);

ingredientCategorySchema.index(
  { normalizedName: 1 },
  { unique: true }
);

const IngredientCategory = mongoose.model(
  "IngredientCategory",
  ingredientCategorySchema
);

export default IngredientCategory;