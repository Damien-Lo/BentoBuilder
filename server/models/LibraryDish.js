import mongoose from "mongoose";

import { createNutritionSchema } from "./nutritionSchema.js";

// The dish library: USDA's survey foods (FNDDS 2021–2023, public domain —
// see data/usda-dishes/README.md), the restaurant-style ones, renamed for
// Orbit, each with its nutrition per 100 g, USDA's measures as units, and a
// typical restaurant serving. Generic ("pad thai with chicken"), not any
// restaurant's: adding a dish to a restaurant, picking one fills in its
// nutrition at a size from its units. Loaded by services/dishLibrary.js.
const libraryDishSchema = new mongoose.Schema(
  {
    fdcId: { type: Number, required: true },
    alsoFdcIds: { type: [Number], default: undefined },
    sourceName: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    aliases: { type: [String], default: [] },
    units: { type: [{ unit: String, grams: Number, _id: false }], default: [] },
    serving: {
      type: new mongoose.Schema({ amount: Number, unit: String, grams: Number }, { _id: false }),
      required: true,
    },
    per100g: { type: createNutritionSchema(), default: () => ({}) },
  },
  { timestamps: true },
);

libraryDishSchema.index({ fdcId: 1 }, { unique: true });
libraryDishSchema.index({ name: 1 });

export default mongoose.model("LibraryDish", libraryDishSchema);
