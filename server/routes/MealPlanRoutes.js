import express from "express";
import MealPlanEntry from "../models/MealPlanEntry.js";
import PantryItem from "../models/PantryItem.js";

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
    });
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
 * Body: { deductions: [{ pantryItem: "<id>", amount: Number }, ...] }
 *
 * The client decides WHICH pantry items to draw from (brother-grouping,
 * expiry ordering, any user-resolved ambiguous choices) and sends the flat
 * result here — this route just applies it. Never blocks on insufficient
 * stock: each deduction is clamped to whatever that pantry item actually
 * has left (defends against stale client state too), and a pantry item
 * that's missing entirely is skipped rather than failing the whole confirm.
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

    entry.stockDeductions = ledger;
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

    return res.status(200).json({ success: true, message: "Entry removed" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid entry ID" });
  }
});

export default router;
