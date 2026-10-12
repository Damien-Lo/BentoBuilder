import mongoose from "mongoose";

// What was done with a meal suggestion: taken, turned over for another,
// or waved away. Kept with what was offered and how it scored, because
// this is the one thing the plan itself can't tell us — what you were
// shown and didn't want — and what the suggestions will one day learn
// their weights from.
const suggestionEventSchema = new mongoose.Schema(
  {
    // The slot it was offered for.
    date: { type: String, required: true },
    slot: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"], required: true },
    // "replaced": it was showing, and something else was planned in that
    // slot by hand instead — `chosen` names what.
    // "side-…": one side was swapped, dropped or added beside the main
    // (`sideFrom` → `sideTo`), the rest of the plate left as offered —
    // what goes with what, said directly.
    action: { type: String, enum: ["accepted", "another", "dismissed", "replaced", "side-swapped", "side-removed", "side-added"], required: true },
    sideFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", default: null },
    sideTo: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", default: null },
    chosen: { type: String, default: "" },
    // Whether the suggestion was actually on screen. False for one worked
    // out in the background while a meal was logged elsewhere (the phone
    // planner): "what would have been offered", not something turned down.
    shown: { type: Boolean, default: true },
    // How what was chosen scored at the time, by the same factors as the
    // suggestion: the pair says which of the two was wanted, and why.
    chosenCalories: { type: Number, default: null },
    chosenScore: { type: Number, default: null },
    chosenFactors: { type: mongoose.Schema.Types.Mixed, default: null },
    // What was showing: a recipe or a saved meal, and any sides with it.
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", default: null },
    meal: { type: mongoose.Schema.Types.ObjectId, ref: "Meal", default: null },
    sides: [{ type: mongoose.Schema.Types.ObjectId, ref: "Recipe" }],
    name: { type: String, default: "" },
    calories: { type: Number, default: null },
    // Where it stood among that slot's offers (0 = the first shown).
    rank: { type: Number, default: 0 },
    score: { type: Number, default: null },
    // Each factor's 0–1 score at the time (fit, variety, protein, …).
    factors: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

suggestionEventSchema.index({ date: 1, slot: 1 });

export default mongoose.model("SuggestionEvent", suggestionEventSchema);
