import mongoose from "mongoose";
import { sharedCatalog } from "../services/catalog.js";

const tagSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true },
);

tagSchema.index({ owner: 1, normalizedName: 1 }, { unique: true });

// (Shared, or someone's own — see services/catalog.js.)
tagSchema.plugin(sharedCatalog);

const Tag = mongoose.model("Tag", tagSchema);
export default Tag;
