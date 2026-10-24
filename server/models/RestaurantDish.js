import mongoose from "mongoose";

import { createNutritionSchema } from "./nutritionSchema.js";
import { historySchema } from "./Restaurant.js";

// A dish on a restaurant's menu — or on a chain's, for all its locations
// (exactly one of `restaurant` / `chain`). Public and wiki-style, like the
// restaurant (see Restaurant.js): anyone can add one or correct it, every
// change kept in `history`.
//
// Its nutrition is for one serving as it's served. Where that came from is
// kept (`source`): a dish from the dish library (LibraryDish) at a size
// picked from its measures (`fromLibrary`, so it can be re-sized), an AI
// estimate from a photo, a label, a chain's published figures, or typed in.
// What one person thinks of it — rating, notes, what they paid — is theirs,
// in FoodSettings (kind "dish").
const restaurantDishSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", default: null },
    chain: { type: mongoose.Schema.Types.ObjectId, ref: "Chain", default: null },
    name: { type: String, required: [true, "Dish name is required"], trim: true },
    // Its place on the menu ("Mains", "Drinks") — free text.
    section: { type: String, trim: true, default: "" },
    nutrition: { type: createNutritionSchema(), default: () => ({}) },
    source: { type: String, enum: ["library", "photo", "label", "chain", "typed"], default: "typed" },
    fromLibrary: {
      type: new mongoose.Schema(
        {
          dish: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryDish", required: true },
          amount: { type: Number, min: 0, required: true },
          unit: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    history: { type: [historySchema], default: [] },
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: "RestaurantDish", default: null },
    // Reviewed before anyone else sees it: one added by a member waits
    // ("pending" — seen by them, usable and loggable by them) until a reviewer
    // approves it, or rejects it (with a reason). One from before reviews, or
    // added by a reviewer, is approved.
    status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
    reviewNote: { type: String, trim: true, default: "" },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

restaurantDishSchema.pre("validate", function () {
  if (!this.restaurant === !this.chain) throw new Error("A dish belongs to one restaurant or one chain");
});
restaurantDishSchema.index({ restaurant: 1 });
restaurantDishSchema.index({ chain: 1 });

export default mongoose.model("RestaurantDish", restaurantDishSchema);
