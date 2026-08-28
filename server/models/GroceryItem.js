import mongoose from "mongoose";

// One demand source contributing to this item's quantity — either a specific
// meal-plan entry's shortfall, or the user's own manual add. `amount` is
// this source's own contribution, in the item's `unit`; the item's top-level
// `quantity` is server-maintained as the sum of all contributions here, so
// multiple meals needing the same ingredient merge into one line instead of
// duplicating, and removing a source (a deleted meal-plan entry, or the user
// deleting their manual add) cleanly decrements rather than requiring the
// whole item to be recreated.
const requestedBySchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["mealPlanEntry", "manual"],
      required: true,
    },
    // Only set when source === "mealPlanEntry" — which planner entry this
    // contribution came from, so re-pressing "add missing" for the same
    // entry updates its contribution in place instead of duplicating, and so
    // deleting that entry can find and strip exactly this contribution.
    mealPlanEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MealPlanEntry",
      default: null,
    },
    amount: {
      type: Number,
      min: 0,
      required: true,
    },
  },
  { _id: false },
);

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

    // Set when `status` becomes "completed" via the log-to-pantry flow — the
    // pantry entry that logging this item actually created. Undoing back to
    // pendingLog deletes that pantry entry and clears this back to null.
    // Deleting the grocery item itself (swipe, or "clear completed") never
    // touches the pantry entry — only this undo path does.
    pantryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PantryItem",
      default: null,
    },

    // What's actually driving `quantity` — see requestedBySchema above.
    // Empty for legacy items created before this existed, or for one-off
    // manual adds with no linked ingredient (nothing to dedupe/merge on).
    requestedBy: {
      type: [requestedBySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

groceryItemSchema.index({ ingredient: 1, status: 1 });

const GroceryItem = mongoose.model("GroceryItem", groceryItemSchema);

export default GroceryItem;
