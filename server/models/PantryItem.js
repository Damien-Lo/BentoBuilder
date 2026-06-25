import mongoose from "mongoose";

const pantryItemSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: [true, "Ingredient reference is required"],
    },

    storageLocation: {
      type: String,
      enum: [
        "pantry",
        "refrigerator",
        "freezer",
        "counter",
        "spice-rack",
        "other",
      ],
      default: "pantry",
    },

    quantityAvailable: {
      type: Number,
      required: [true, "Quantity available is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },

    quantityUnit: {
      type: String,
      required: [true, "Quantity unit is required"],
      trim: true,
      default: "serving",
    },

    purchaseDate: {
      type: Date,
      default: Date.now,
    },

    openedDate: {
      type: Date,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    minimumQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },

    purchasePrice: {
      type: Number,
      min: 0,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    isFinished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const PantryItem = mongoose.model("PantryItem", pantryItemSchema);

export default PantryItem;