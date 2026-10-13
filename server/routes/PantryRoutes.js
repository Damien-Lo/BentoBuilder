import express from "express";
import Ingredient from "../models/Ingredient.js";
import PantryItem from "../models/PantryItem.js";
import MealPlanEntry from "../models/MealPlanEntry.js";
import StorageLocation from "../models/StorageLocation.js";
import { moveKind, placeKind, suggestShelfDays } from "../services/shelfLife.js";

const router = express.Router();

const INGREDIENT_POPULATE = {
  path: "ingredient",
  // genericParent is populated so the client can resolve its unitConversions
  // (density-style conversions fall back from a specific ingredient to its
  // generic before the app-wide list) without a separate lookup.
  populate: [{ path: "category" }, { path: "brand" }, { path: "genericParent" }],
};

/**
 * GET /api/pantry
 * Return all pantry records and their ingredient details.
 */
router.get("/", async (req, res) => {
  try {
    const pantryItems = await PantryItem.find({
        isFinished: false,
        })
        .populate(INGREDIENT_POPULATE)
        .populate("storageLocation")
        .populate("store")
        .sort({
            expiryDate: 1,
            createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: pantryItems.length,
      data: pantryItems,
    });
  } catch (error) {
    console.error("Get pantry error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pantry items",
    });
  }
});

/**
 * GET /api/pantry/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const pantryItem = await PantryItem.findById(req.params.id)
      .populate(INGREDIENT_POPULATE)
      .populate("storageLocation")
      .populate("store");

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid pantry item ID",
    });
  }
});

/**
 * GET /api/pantry/:id/deductions
 * Every confirmed meal-plan entry that drew stock from this pantry item,
 * most recent first — powers the pantry item's expanded "deduction
 * history" view. Pass ?days=N to widen/narrow the window (default 30);
 * only look-back is supported, there's no upper bound on how far back N
 * can reach.
 */
router.get("/:id/deductions", async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const entries = await MealPlanEntry.find({
      "stockDeductions.pantryItem": req.params.id,
      date: { $gte: cutoffDate },
      isArchived: false,
    })
      .sort({ date: -1, createdAt: -1 })
      .populate({ path: "meal", select: "name" })
      .populate({ path: "recipe", select: "name" })
      .populate({ path: "ingredient", select: "name" });

    // Each entry's stockDeductions can (in principle) draw from several
    // different pantry items in one go - only the one matching this
    // pantry item is relevant here, everything else on the entry is noise.
    const deductions = entries.map((entry) => {
      const match = entry.stockDeductions.find(
        (deduction) => String(deduction.pantryItem) === req.params.id,
      );

      return {
        _id: entry._id,
        date: entry.date,
        slot: entry.slot,
        amount: match ? match.amount : 0,
        source: entry.meal?.name ?? entry.recipe?.name ?? entry.ingredient?.name ?? "Unknown",
      };
    });

    return res.status(200).json({
      success: true,
      count: deductions.length,
      data: deductions,
    });
  } catch (error) {
    console.error("Get pantry item deductions error:", error);

    return res.status(400).json({
      success: false,
      message: "Invalid pantry item ID",
    });
  }
});

/**
 * POST /api/pantry
 * Add an existing ingredient to the pantry.
 */
router.post("/", async (req, res) => {
  try {
    const ingredient = await Ingredient.findOne({
      _id: req.body.ingredient,
      isArchived: false,
    }).select("isGeneric");

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Referenced ingredient does not exist",
      });
    }

    // Generic ingredients (e.g. "Soy Sauce") can hold pantry stock directly
    // (e.g. buying garlic with no brand in mind) in addition to aggregating
    // whatever's stocked under their specific/branded variants.
    const pantryItem = await PantryItem.create(req.body);

    await pantryItem.populate(INGREDIENT_POPULATE);

    return res.status(201).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    console.error("Create pantry item error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});


/**
 * PATCH /api/pantry/:id
 */
/**
 * GET /api/pantry/:id/move-suggestion?to=<storageLocationId>&today=YYYY-MM-DD
 * GET /api/pantry/:id/move-suggestion?kind=opened&today=YYYY-MM-DD
 * The expiry date to offer when this entry changes state — moved to
 * another location, or opened: from what the ingredient has been given on
 * that kind of change before, or a default. (Opening never makes it last
 * longer than the date it already has.)
 */
router.get("/:id/move-suggestion", async (req, res) => {
  try {
    const item = await PantryItem.findById(req.params.id).populate("storageLocation");
    if (!item) return res.status(404).json({ success: false, message: "Pantry item not found" });
    const opened = req.query.kind === "opened";
    const to = opened ? null : await StorageLocation.findById(req.query.to);
    if (!opened && !to) return res.status(404).json({ success: false, message: "Location not found" });
    const kind = opened ? "opened" : moveKind(item.storageLocation?.name, to.name);
    const { days, learned } = await suggestShelfDays(item.ingredient, kind, placeKind(item.storageLocation?.name));
    const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today ?? "") ? new Date(`${req.query.today}T12:00:00Z`) : new Date();
    const until = new Date(today);
    until.setUTCDate(until.getUTCDate() + days);
    let expiryDate = until.toISOString().slice(0, 10);
    let shown = days;
    const current = item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null;
    if (opened && current && current >= today.toISOString().slice(0, 10) && current < expiryDate) {
      expiryDate = current;
      shown = Math.round((new Date(`${current}T12:00:00Z`) - today) / 86_400_000);
    }
    return res.json({ success: true, data: { kind, days: shown, learned, expiryDate } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/pantry/:id/take-out  { storageLocation, expiryDate, amount?, unit? }
 * Moves an entry to another location with a new expiry date — all of it,
 * or, when `amount` (in the entry's own unit) is less than what's there,
 * just that much: the rest stays where it was and what's taken becomes an
 * entry of its own. What a thaw task does: 280 g out of an 840 g bag.
 */
router.post("/:id/take-out", async (req, res) => {
  try {
    const item = await PantryItem.findById(req.params.id).populate("storageLocation");
    const to = await StorageLocation.findById(req.body.storageLocation);
    if (!item || !to) return res.status(404).json({ success: false, message: "Pantry item or location not found" });
    const amount = Number(req.body.amount);
    const part = Number.isFinite(amount) && amount > 0 && req.body.unit === item.quantityUnit && amount < item.quantityAvailable - 1e-6;
    const change = { at: new Date(), from: item.storageLocation?._id, to: to._id, kind: moveKind(item.storageLocation?.name, to.name), expiryBefore: item.expiryDate, expiryAfter: req.body.expiryDate || null };
    let moved;
    if (part) {
      const { _id, createdAt, updatedAt, __v, ...copy } = item.toObject();
      moved = await PantryItem.create({ ...copy, storageLocation: to._id, quantityAvailable: amount, expiryDate: req.body.expiryDate || null, moves: [...(copy.moves ?? []), change] });
      item.quantityAvailable = Math.round((item.quantityAvailable - amount) * 1000) / 1000;
      await item.save();
    } else {
      item.storageLocation = to._id;
      item.expiryDate = req.body.expiryDate || null;
      item.moves.push(change);
      moved = await item.save();
    }
    await moved.populate(INGREDIENT_POPULATE);
    await moved.populate("storageLocation");
    return res.json({ success: true, data: moved });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    // A change of state — moved to another storage location, or opened —
    // is kept on the entry, with the expiry date it had and the one it's
    // given now.
    const { moves: _ignored, ...changes } = req.body;
    const update = { ...changes };
    if (changes.storageLocation || changes.openedDate) {
      const current = await PantryItem.findById(req.params.id).populate("storageLocation");
      const expiryAfter = changes.expiryDate !== undefined ? changes.expiryDate || null : current?.expiryDate;
      const kept = [];
      if (current && changes.storageLocation && String(current.storageLocation?._id) !== String(changes.storageLocation)) {
        const to = await StorageLocation.findById(changes.storageLocation);
        if (to) kept.push({ at: new Date(), from: current.storageLocation?._id, to: to._id, kind: moveKind(current.storageLocation?.name, to.name), expiryBefore: current.expiryDate, expiryAfter });
      }
      if (current && changes.openedDate && !current.openedDate) {
        const where = changes.storageLocation || current.storageLocation?._id;
        kept.push({ at: new Date(), from: where, to: where, kind: "opened", expiryBefore: current.expiryDate, expiryAfter });
      }
      if (kept.length) update.$push = { moves: { $each: kept } };
    }
    const pantryItem = await PantryItem.findByIdAndUpdate(
      req.params.id,
      update,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate(INGREDIENT_POPULATE)
      .populate("storageLocation")
      .populate("store");

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/pantry/:id/use
 * Deduct an amount when an ingredient is used in a dish or bento.
 */
router.post("/:id/use", async (req, res) => {
  try {
    const amountUsed = Number(req.body.amount);

    if (!Number.isFinite(amountUsed) || amountUsed <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be a positive number",
      });
    }

    const pantryItem = await PantryItem.findById(req.params.id);

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    if (amountUsed > pantryItem.quantityAvailable) {
      return res.status(400).json({
        success: false,
        message: "Not enough quantity is available",
      });
    }

    pantryItem.quantityAvailable -= amountUsed;

    if (pantryItem.quantityAvailable === 0) {
      pantryItem.isFinished = true;
    }

    await pantryItem.save();
    await pantryItem.populate(INGREDIENT_POPULATE);

    return res.status(200).json({
      success: true,
      data: pantryItem,
    });
  } catch (error) {
    console.error("Use pantry item error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/pantry/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const pantryItem = await PantryItem.findByIdAndDelete(req.params.id);

    if (!pantryItem) {
      return res.status(404).json({
        success: false,
        message: "Pantry item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pantry item deleted",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid pantry item ID",
    });
  }
});

export default router;