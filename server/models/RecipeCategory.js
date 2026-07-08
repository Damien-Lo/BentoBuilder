import mongoose from "mongoose";

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

recipeCategorySchema.index({ normalizedName: 1 }, { unique: true });

const RecipeCategory = mongoose.model("RecipeCategory", recipeCategorySchema);

export default RecipeCategory;
