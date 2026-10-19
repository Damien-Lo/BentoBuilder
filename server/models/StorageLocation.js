import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

const storageLocationSchema = new mongoose.Schema(
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

    icon: {
      type: String,
      default: "file-tray-stacked-outline",
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

storageLocationSchema.index({ owner: 1, normalizedName: 1 }, { unique: true });

// (Personal: each record belongs to an account — see services/ownership.js.)
storageLocationSchema.plugin(ownedByUser);

const StorageLocation = mongoose.model(
  "StorageLocation",
  storageLocationSchema
);

export default StorageLocation;