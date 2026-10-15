import mongoose from "mongoose";

// The menu: recipes (or saved meals) you'd like to have, not yet on a day.
// One that's "on the menu" is wanted soon — its servings not yet put on a
// day are shopped for on the next trip, like a planned meal's (see mobile's
// usePlanNeeds); "someday" keeps it for later, shopped for by nothing. An
// item is one batch — the recipe's own servings — and goes back to
// "someday" by itself once they've all been put on days (a plan entry
// placed from it carries its id: MealPlanEntry.menuItem).
const menuItemSchema = new mongoose.Schema(
  {
    recipe: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", default: null },
    meal: { type: mongoose.Schema.Types.ObjectId, ref: "Meal", default: null },
    servings: { type: Number, min: 0, default: 1 },
    state: { type: String, enum: ["menu", "someday"], default: "menu" },
    // When this batch began: only what's been put on days since counts
    // towards it (it starts again when it comes back from "someday").
    since: { type: Date, default: Date.now },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("MenuItem", menuItemSchema);
