import mongoose from "mongoose";
import { sharedCatalog } from "../services/catalog.js";

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
  },
  {
    timestamps: true,
  }
);

ingredientCategorySchema.index({ owner: 1, normalizedName: 1 }, { unique: true });

// (Shared, or someone's own — see services/catalog.js.)
ingredientCategorySchema.plugin(sharedCatalog);

const IngredientCategory = mongoose.model(
  "IngredientCategory",
  ingredientCategorySchema
);

export default IngredientCategory;