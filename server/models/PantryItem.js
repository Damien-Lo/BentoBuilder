import mongoose from "mongoose";

const pantryItemSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ingredient",
      required: [true, "Ingredient reference is required"],
    },

    storageLocation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StorageLocation",
        required: true,
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
      validate: {
        // Skips the check entirely when either date is missing — plenty of
        // items are logged without an expiry at all.
        validator: function (value) {
          if (!value || !this.purchaseDate) return true;
          return value >= this.purchaseDate;
        },
        message: "Expiry date can't be before the purchase date",
      },
    },

    purchasePrice: {
      type: Number,
      min: 0,
      default: null,
    },

    // Which store this batch was bought at — the source of truth for
    // per-ingredient store/price history (see Store model). Optional since
    // plenty of entries are logged without bothering to record it.
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
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

    // When isFinished was set by an automatic meal-plan-confirm deduction —
    // null when finished some other way (or not finished). Kept (not
    // hard-deleted) so the entry's history is available for undo and for
    // future price/usage-pattern analysis.
    finishedAt: {
      type: Date,
      default: null,
    },

    finishedByEntry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MealPlanEntry",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const PantryItem = mongoose.model("PantryItem", pantryItemSchema);

export default PantryItem;