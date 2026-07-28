import mongoose from "mongoose";

const groceryItemSchema = new mongoose.Schema(
  {
    // Optional — a grocery item can be linked to a catalog ingredient
    // (generic or specific/branded) for future recipe/pantry integration,
    // or left unlinked for a one-off item (e.g. "paper towels").
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      default: null,
    },

    // Always set, even when `ingredient` is linked — a snapshot of the name
    // at add time, so the list renders without needing to populate.
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
    },

    quantity: {
      type: Number,
      min: 0,
      default: null,
    },

    unit: {
      type: String,
      trim: true,
      default: "",
    },

    // toBuy -> pendingLog happens when the shopper checks the item off.
    // pendingLog -> completed happens once it's been logged as a pantry
    // entry (storage location, expiry, etc. confirmed) — not a plain toggle.
    status: {
      type: String,
      enum: ["toBuy", "pendingLog", "completed"],
      default: "toBuy",
    },
  },
  {
    timestamps: true,
  },
);

const GroceryItem = mongoose.model("GroceryItem", groceryItemSchema);

export default GroceryItem;
