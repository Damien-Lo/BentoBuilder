import express from "express";
import GroceryItem from "../models/GroceryItem.js";
import { upsertManualContribution, upsertMealPlanEntryContribution } from "../services/groceryContributions.js";

const router = express.Router();

const INGREDIENT_POPULATE = {
  path: "ingredient",
  select: "name isGeneric defaultPortionUnit",
};

/**
 * GET /api/grocery-list
 * All grocery items, oldest first (insertion order).
 */
router.get("/", async (req, res) => {
  try {
    const items = await GroceryItem.find()
      .populate(INGREDIENT_POPULATE)
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error("Get grocery list error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve grocery list",
    });
  }
});

/**
 * POST /api/grocery-list
 * Add an item — either linked to a catalog ingredient (generic or
 * specific/branded) or a one-off free-text item. When linked and an
 * existing toBuy item for that ingredient is already on the list, this
 * merges into it (accumulating the manual contribution) rather than
 * creating a duplicate row — the response may therefore be an existing,
 * updated item rather than a freshly-created one.
 */
router.post("/", async (req, res) => {
  try {
    const name = req.body.name?.trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Item name is required",
      });
    }

    const item = await upsertManualContribution({
      ingredient: req.body.ingredient || null,
      name,
      amount:
        req.body.quantity === "" || req.body.quantity == null
          ? null
          : Number(req.body.quantity),
      unit: req.body.unit?.trim() ?? "",
    });

    await item.populate(INGREDIENT_POPULATE);

    return res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Create grocery item error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/grocery-list/contributions/meal-plan-entry
 * Idempotent per (ingredient, mealPlanEntry) — finds or creates the toBuy
 * item for `ingredient`, then upserts this entry's contribution amount.
 * Re-calling for the same entry updates its contribution in place instead
 * of duplicating (e.g. re-checking a shortfall closer to shopping day).
 * Body: { mealPlanEntry, ingredient, name, amount, unit }
 */
router.post("/contributions/meal-plan-entry", async (req, res) => {
  try {
    const { mealPlanEntry, ingredient, name, amount, unit } = req.body;

    if (!mealPlanEntry || !ingredient || !name) {
      return res.status(400).json({
        success: false,
        message: "mealPlanEntry, ingredient, and name are required",
      });
    }

    const item = await upsertMealPlanEntryContribution({
      ingredient,
      mealPlanEntry,
      name,
      amount: Number(amount),
      unit: unit ?? "",
    });

    await item.populate(INGREDIENT_POPULATE);

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Add meal-plan contribution error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/grocery-list/completed
 * Bulk-remove every completed item. Registered before "/:id" so "completed"
 * isn't swallowed as an id.
 */
router.delete("/completed", async (req, res) => {
  try {
    await GroceryItem.deleteMany({ status: "completed" });

    return res.status(200).json({
      success: true,
      message: "Completed items removed",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to clear completed items",
    });
  }
});

/**
 * PATCH /api/grocery-list/:id
 * Change status (toBuy/pendingLog/completed), edit name/quantity/unit, or
 * (re)link an ingredient.
 */
router.patch("/:id", async (req, res) => {
  try {
    const item = await GroceryItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate(INGREDIENT_POPULATE);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Grocery item not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/grocery-list/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const item = await GroceryItem.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Grocery item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Grocery item deleted",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid grocery item ID",
    });
  }
});

export default router;
