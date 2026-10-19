import mongoose from "mongoose";
import { sharedCatalog } from "../services/catalog.js";

const recipeCategorySchema = new mongoose.Schema(
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
  },
);

recipeCategorySchema.index({ owner: 1, normalizedName: 1 }, { unique: true });

// (Shared, or someone's own — see services/catalog.js.)
recipeCategorySchema.plugin(sharedCatalog);

const RecipeCategory = mongoose.model("RecipeCategory", recipeCategorySchema);

export default RecipeCategory;
