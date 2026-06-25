import mongoose from "mongoose";

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

    // Add userId here once authentication exists.
  },
  {
    timestamps: true,
  }
);

storageLocationSchema.index(
  { normalizedName: 1 },
  { unique: true }
);

const StorageLocation = mongoose.model(
  "StorageLocation",
  storageLocationSchema
);

export default StorageLocation;