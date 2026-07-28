import express from "express";
import Ingredient from "../models/Ingredient.js";
import { getAvailableStock } from "../services/ingredientAvailability.js";

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves which generic ingredient a new specific/branded ingredient
 * belongs to.
 *
 * - If `genericParent` is given, it must reference an existing generic.
 * - Else if `genericName` is given, find an existing generic with that name
 *   in the same category, or auto-create one if none exists yet — seeded
 *   with this specific ingredient's own portion/nutrition as a starting
 *   point, since there's nothing else to draw defaults from.
 * - Else (neither given), the ingredient is standalone — no generic parent.
 */
async function resolveGenericParent({
  genericParent,
  genericName,
  category,
  defaultPortionAmount,
  defaultPortionUnit,
  nutrition,
  nutritionBasis,
}) {
  if (genericParent) {
    const parent = await Ingredient.findById(genericParent);
    if (!parent || !parent.isGeneric) {
      throw new Error("genericParent must reference an existing generic ingredient");
    }
    return parent._id;
  }

  const trimmedName = genericName?.trim();
  if (!trimmedName) return null;

  const existing = await Ingredient.findOne({
    isGeneric: true,
    category,
    isArchived: false,
    name: new RegExp(`^${escapeRegex(trimmedName)}$`, "i"),
  });
  if (existing) return existing._id;

  const created = await Ingredient.create({
    name: trimmedName,
    category,
    isGeneric: true,
    defaultPortionAmount,
    defaultPortionUnit,
    nutrition,
    nutritionBasis,
  });
  return created._id;
}

/**
 * GET /api/ingredients
 * Return all non-archived ingredients.
 */
router.get("/", async (req, res) => {
  try {
    const ingredients = await Ingredient.find({
      isArchived: false,
    })
      .populate("category")
      .populate("brand")
      .populate("genericParent").populate("defaultStorageLocation")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: ingredients.length,
      data: ingredients,
    });
  } catch (error) {
    console.error("Get ingredients error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve ingredients",
    });
  }
});

/**
 * GET /api/ingredients/:id
 * Return one ingredient.
 */
router.get("/:id", async (req, res) => {
  try {
    const ingredient = await Ingredient.findById(req.params.id)
      .populate("category")
      .populate("brand")
      .populate("genericParent").populate("defaultStorageLocation");

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid ingredient ID",
    });
  }
});

/**
 * GET /api/ingredients/:id/availability
 * Pantry stock for this ingredient. For a generic ingredient, aggregates
 * stock across itself and every branded/specific variant beneath it.
 */
router.get("/:id/availability", async (req, res) => {
  try {
    const stock = await getAvailableStock(req.params.id);

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: stock,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid ingredient ID",
    });
  }
});

/**
 * POST /api/ingredients
 * Create an ingredient definition.
 */
router.post("/", async (req, res) => {
  try {
    const { genericName, ...body } = req.body;

    const ingredientData = {
      ...body,
      barcode:
        typeof body.barcode === "string" && body.barcode.trim()
          ? body.barcode.trim()
          : undefined,
    };

    if (!ingredientData.isGeneric) {
      ingredientData.genericParent = await resolveGenericParent({
        genericParent: ingredientData.genericParent,
        genericName,
        category: ingredientData.category,
        defaultPortionAmount: ingredientData.defaultPortionAmount,
        defaultPortionUnit: ingredientData.defaultPortionUnit,
        nutrition: ingredientData.nutrition,
        nutritionBasis: ingredientData.nutritionBasis,
      });
    }

    const ingredient = await Ingredient.create(ingredientData);
    // Document#populate() (unlike a Query's) resolves to a Promise per call,
    // so it can't be chained without awaiting each one — pass all paths in
    // a single call instead.
    await ingredient.populate(["category", "brand", "genericParent", "defaultStorageLocation"]);

    return res.status(201).json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    console.error("Create ingredient error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An ingredient with this barcode already exists",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PATCH /api/ingredients/:id
 * Update part of an ingredient.
 */
router.patch("/:id", async (req, res) => {
  try {
    const ingredient = await Ingredient.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("category")
      .populate("brand")
      .populate("genericParent").populate("defaultStorageLocation");

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ingredients/:id
 * Pass ?permanent=true to hard-delete. Default: soft archive.
 */
router.delete("/:id", async (req, res) => {
  try {
    let ingredient;

    if (req.query.permanent === "true") {
      ingredient = await Ingredient.findByIdAndDelete(req.params.id);
    } else {
      ingredient = await Ingredient.findByIdAndUpdate(
        req.params.id,
        { isArchived: true },
        { new: true },
      );
    }

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: req.query.permanent === "true" ? "Ingredient deleted" : "Ingredient archived",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid ingredient ID",
    });
  }
});

export default router;