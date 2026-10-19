import mongoose from "mongoose";
import { sharedCatalog } from "../services/catalog.js";

const storeSchema = new mongoose.Schema(
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

storeSchema.pre("validate", function () {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }
});

// (A name once per person, and once in the shared catalog.)
storeSchema.index({ owner: 1, normalizedName: 1 }, { unique: true });
// (Shared, or someone's own — see services/catalog.js.)
storeSchema.plugin(sharedCatalog);

const Store =
  mongoose.models.Store ||
  mongoose.model("Store", storeSchema);

export default Store;
