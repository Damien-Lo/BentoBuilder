import express from "express";
import MealPlanEntry from "../models/MealPlanEntry.js";
import PantryItem from "../models/PantryItem.js";
import { removeMealPlanEntryContributions } from "../services/groceryContributions.js";

const router = express.Router();

function round(n) {
  return Math.round(n * 1000) / 1000;
}

// Adds back every {pantryItem, amount} this entry's confirm deducted,
// un-finishing anything that reads > 0 again. Skips silently if a
// referenced pantry item was deleted since — it can't be restored, and
// that's an accepted edge case (manual pantry deletion isn't ledger-aware).
async function reverseStockDeductions(entry) {
  for (const { pantryItem: pantryItemId, amount } of entry.stockDeductions ?? []) {
    const pantryItem = await PantryItem.findById(pantryItemId);
    if (!pantryItem) continue;

    pantryItem.quantityAvailable = round(pantryItem.quantityAvailable + amount);
    if (pantryItem.isFinished && pantryItem.quantityAvailable > 0) {
      pantryItem.isFinished = false;
      pantryItem.finishedAt = null;
      pantryItem.finishedByEntry = null;
    }
    await pantryItem.save();
  }
  entry.stockDeductions = [];
}

function populateEntry(query) {
  return query
    .populate({
      path: "meal",
      populate: [
        { path: "tags" },
        { path: "courses.recipe", select: "name mealCategory nutrition servings" },
      ],
    })
    .populate("recipe")
    .populate({
      path: "ingredient",
      populate: [{ path: "category" }, { path: "brand" }],
    })
    .populate({
      path: "restaurantMeal",
      populate: [{ path: "tags" }],
    })
    // So a confirmed entry's nutrition can be computed from exactly what
    // was really deducted (see mobile's computeDayNutrition) instead of
    // always falling back to the recipe's cached snapshot.
    .populate({
      path: "stockDeductions.pantryItem",
      populate: { path: "ingredient" },
    })
    .populate("manualPieceEntries.ingredient");
}

/**
 * GET /api/meal-plan?date=YYYY-MM-DD
 */
router.get("/", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: "date query param is required" });
    }
    const entries = await populateEntry(
      MealPlanEntry.find({ date, isArchived: false }).sort({ createdAt: 1 }),
    );
    return res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    console.error("Get meal plan error:", error);
    return res.status(500).json({ success: false, message: "Failed to load meal plan" });
  }
});

/**
 * GET /api/meal-plan/by-restaurant/:restaurantMealId
 * Every non-archived visit to this restaurant, most recent first — powers
 * the restaurant detail page's "Past visits" section. Registered before
 * "/:id"-style routes for the same reason as "/last-used" below, even
 * though this file has no generic "/:id" route today.
 */
router.get("/by-restaurant/:restaurantMealId", async (req, res) => {
  try {
    const entries = await populateEntry(
      MealPlanEntry.find({
        restaurantMeal: req.params.restaurantMealId,
        isArchived: false,
      }).sort({ date: -1, createdAt: -1 }),
    );
    return res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    console.error("Get meal plan by restaurant error:", error);
    return res.status(500).json({ success: false, message: "Failed to load restaurant visit history" });
  }
});

/**
 * GET /api/meal-plan/last-entries?before=YYYY-MM-DD
 * For each of the four slots (breakfast/lunch/dinner/snack), the single
 * most recent non-archived entry strictly before the given date — powers
 * the planner's "swipe to add yesterday's breakfast again" quick-add on an
 * empty slot. null for a slot with no prior entry at all.
 */
router.get("/last-entries", async (req, res) => {
  try {
    const { before } = req.query;
    if (!before) {
      return res.status(400).json({ success: false, message: "before query param is required" });
    }

    const slots = ["breakfast", "lunch", "dinner", "snack"];
    const results = await Promise.all(
      slots.map((slot) =>
        populateEntry(
          MealPlanEntry.findOne({ slot, date: { $lt: before }, isArchived: false })
            .sort({ date: -1, createdAt: -1 }),
        ),
      ),
    );

    const data = Object.fromEntries(slots.map((slot, i) => [slot, results[i] ?? null]));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get last meal plan entries error:", error);
    return res.status(500).json({ success: false, message: "Failed to load last entries" });
  }
});

// How far back "last used" looks — sorting priority only cares about
// recent activity (something planned 3 years ago shouldn't outrank
// something from last month just because it happens to have a date at
// all), and bounding the match lets it use the existing `date` index
// instead of scanning every entry ever created.
const LAST_USED_WINDOW_DAYS = 180;

function lastUsedCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - LAST_USED_WINDOW_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * GET /api/meal-plan/last-used
 * For each of the four plannable types, the most recent date (YYYY-MM-DD)
 * it was referenced by a non-archived meal-plan entry within the last
 * LAST_USED_WINDOW_DAYS days — computed fresh from MealPlanEntry every
 * call rather than cached on the referenced document, so a deleted/
 * archived entry can never leave a stale "last used" behind. Anything
 * used only outside the window simply doesn't appear in the map (callers
 * already treat "no entry" as "sort alphabetically at the end").
 * Registered before "/:id"-style routes so "last-used" isn't swallowed as
 * an id.
 */
router.get("/last-used", async (req, res) => {
  try {
    const cutoff = lastUsedCutoff();

    async function lastUsedByField(field) {
      const rows = await MealPlanEntry.aggregate([
        { $match: { date: { $gte: cutoff }, [field]: { $ne: null }, isArchived: false } },
        { $group: { _id: `$${field}`, lastUsed: { $max: "$date" } } },
      ]);
      return Object.fromEntries(rows.map(r => [String(r._id), r.lastUsed]));
    }

    const [meal, recipe, ingredient, restaurantMeal] = await Promise.all([
      lastUsedByField("meal"),
      lastUsedByField("recipe"),
      lastUsedByField("ingredient"),
      lastUsedByField("restaurantMeal"),
    ]);

    return res.status(200).json({ success: true, data: { meal, recipe, ingredient, restaurantMeal } });
  } catch (error) {
    console.error("Get last-used meal plan map error:", error);
    return res.status(500).json({ success: false, message: "Failed to compute last-used data" });
  }
});

/**
 * POST /api/meal-plan
 */
router.post("/", async (req, res) => {
  try {
    const entry = await MealPlanEntry.create(req.body);
    const populated = await populateEntry(MealPlanEntry.findById(entry._id));
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("Create meal plan entry error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/meal-plan/:id
 */
router.patch("/:id", async (req, res) => {
  try {
    const { _id, __v, createdAt, updatedAt, ...fields } = req.body;
    const entry = await MealPlanEntry.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true, runValidators: true },
    );
    if (!entry) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }
    const populated = await populateEntry(MealPlanEntry.findById(entry._id));
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    console.error("Update meal plan entry error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/meal-plan/:id/confirm
 * Body: {
 *   deductions: [{ pantryItem: "<id>", amount: Number }, ...],
 *   manualPieceEntries: [{ ingredient: "<id>", weight: Number, weightUnit: String }, ...],
 *   confirmedNutrition: { calories, protein, carbs, fats, fiber, sodium },
 * }
 *
 * The client decides WHICH pantry items to draw from (brother-grouping,
 * expiry ordering, any user-resolved ambiguous choices) and sends the flat
 * result here — this route just applies it. Never blocks on insufficient
 * stock: each deduction is clamped to whatever that pantry item actually
 * has left (defends against stale client state too), and a pantry item
 * that's missing entirely is skipped rather than failing the whole confirm.
 *
 * manualPieceEntries covers a wholePiece ingredient the user says they used
 * but never logged into pantry — no pantry item exists for these, so
 * they're stored as-is with no stock mutation at all, purely so the
 * confirmed entry's nutrition can still reflect the real weight typed in.
 *
 * confirmedNutrition is the real, final total the client already computed
 * from all of the above plus the recipe's own catalog (which this route
 * doesn't have loaded) — stored as-is, same trust model as the deductions
 * themselves, so every reader can show it without re-deriving it.
 */
router.post("/:id/confirm", async (req, res) => {
  try {
    const entry = await MealPlanEntry.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }

    const requested = Array.isArray(req.body.deductions) ? req.body.deductions : [];
    const ledger = [];

    for (const { pantryItem: pantryItemId, amount } of requested) {
      const requestedAmount = Number(amount);
      if (!pantryItemId || !Number.isFinite(requestedAmount) || requestedAmount <= 0) continue;

      const pantryItem = await PantryItem.findById(pantryItemId);
      if (!pantryItem) continue;

      const actualAmount = round(Math.min(requestedAmount, pantryItem.quantityAvailable));
      if (actualAmount <= 0) continue;

      pantryItem.quantityAvailable = round(pantryItem.quantityAvailable - actualAmount);
      if (pantryItem.quantityAvailable <= 0) {
        pantryItem.quantityAvailable = 0;
        pantryItem.isFinished = true;
        pantryItem.finishedAt = new Date();
        pantryItem.finishedByEntry = entry._id;
      }
      await pantryItem.save();

      ledger.push({ pantryItem: pantryItem._id, amount: actualAmount });
    }

    const requestedManual = Array.isArray(req.body.manualPieceEntries) ? req.body.manualPieceEntries : [];
    const manualLedger = requestedManual
      .map(({ ingredient, weight, weightUnit }) => ({ ingredient, weight: Number(weight), weightUnit }))
      .filter(({ ingredient, weight, weightUnit }) => ingredient && Number.isFinite(weight) && weight > 0 && weightUnit);

    const nutrition = req.body.confirmedNutrition;
    const confirmedNutrition = nutrition && ["calories", "protein", "carbs", "fats", "fiber", "sodium"]
      .every((key) => Number.isFinite(Number(nutrition[key])))
      ? {
          calories: Number(nutrition.calories),
          protein: Number(nutrition.protein),
          carbs: Number(nutrition.carbs),
          fats: Number(nutrition.fats),
          fiber: Number(nutrition.fiber),
          sodium: Number(nutrition.sodium),
        }
      : null;

    entry.stockDeductions = ledger;
    entry.manualPieceEntries = manualLedger;
    entry.confirmedNutrition = confirmedNutrition;
    entry.status = "confirmed";
    await entry.save();

    const populated = await populateEntry(MealPlanEntry.findById(entry._id));
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    console.error("Confirm meal plan entry error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/meal-plan/:id/unconfirm
 * Reverses whatever the confirm deducted and flips status back to planned.
 */
router.post("/:id/unconfirm", async (req, res) => {
  try {
    const entry = await MealPlanEntry.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }

    await reverseStockDeductions(entry);
    entry.manualPieceEntries = [];
    entry.confirmedNutrition = null;
    entry.status = "planned";
    await entry.save();

    const populated = await populateEntry(MealPlanEntry.findById(entry._id));
    return res.status(200).json({ success: true, data: populated });
  } catch (error) {
    console.error("Unconfirm meal plan entry error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/meal-plan/:id — soft delete
 * Reverses any stock deduction first if the entry was confirmed, so
 * deleting a confirmed entry doesn't leave pantry stock permanently
 * short for a meal that's being retracted, not just unconfirmed.
 */
router.delete("/:id", async (req, res) => {
  try {
    const existing = await MealPlanEntry.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }

    if (existing.status === "confirmed") {
      await reverseStockDeductions(existing);
    }
    existing.isArchived = true;
    await existing.save();

    // Best-effort — the entry is already archived either way. Strips this
    // entry's contribution from any still-unpurchased (toBuy) grocery item;
    // anything already checked off or logged to the pantry is real shopping
    // progress and is never touched here.
    try {
      await removeMealPlanEntryContributions(existing._id);
    } catch (cleanupError) {
      console.error("Grocery contribution cleanup error:", cleanupError);
    }

    return res.status(200).json({ success: true, message: "Entry removed" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid entry ID" });
  }
});

export default router;
