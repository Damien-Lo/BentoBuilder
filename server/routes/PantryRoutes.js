import express from "express";
import Ingredient from "../models/Ingredient.js";
import PantryItem from "../models/PantryItem.js";
import MealPlanEntry from "../models/MealPlanEntry.js";

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
router.patch("/:id", async (req, res) => {
  try {
    const pantryItem = await PantryItem.findByIdAndUpdate(
      req.params.id,
      req.body,
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