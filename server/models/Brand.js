import mongoose from "mongoose";
import { sharedCatalog } from "../services/catalog.js";

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

brandSchema.pre("validate", function () {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }
});

// (A name once per person, and once in the shared catalog.)
brandSchema.index({ owner: 1, normalizedName: 1 }, { unique: true });
// (Shared, or someone's own — see services/catalog.js.)
brandSchema.plugin(sharedCatalog);

const Brand =
  mongoose.models.Brand ||
  mongoose.model("Brand", brandSchema);

export default Brand;