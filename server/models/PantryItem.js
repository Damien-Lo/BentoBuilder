import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

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

    // Each change of state it's been through: a move from one storage
    // location to another (out of the freezer to thaw, into it to keep), or
    // being opened (then `from` and `to` are the same place). When, between
    // where, and the expiry date before and after — a change gives it a new
    // one. `kind` is what it amounted to ("thawed", "frozen", "chilled",
    // "shelf", "opened"; see services/shelfLife.js, which learns from
    // these and is written to take further kinds).
    moves: [
      {
        _id: false,
        at: { type: Date, required: true },
        // The day it was, where whoever did it is (YYYY-MM-DD), when known.
        day: { type: String, default: "" },
        from: { type: mongoose.Schema.Types.ObjectId, ref: "StorageLocation" },
        to: { type: mongoose.Schema.Types.ObjectId, ref: "StorageLocation" },
        kind: { type: String, default: "" },
        expiryBefore: { type: Date, default: null },
        expiryAfter: { type: Date, default: null },
      },
    ],

    // For something made from a particular piece (a vacuum-sealed bag from
    // one steak): the piece it was made from, and this entry's own
    // nutrition — per the ingredient's portion, like the ingredient's own —
    // so it counts at that steak's size, not the recipe's assumed one. Null
    // for everything else, which counts as its ingredient says.
    madeFrom: [
      {
        _id: false,
        ingredient: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient" },
        amount: { type: Number },
        unit: { type: String, trim: true, default: "" },
      },
    ],
    nutrition: { type: mongoose.Schema.Types.Mixed, default: null },

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

// (Personal: each record belongs to an account — see services/ownership.js.)
pantryItemSchema.plugin(ownedByUser);

const PantryItem = mongoose.model("PantryItem", pantryItemSchema);

export default PantryItem;