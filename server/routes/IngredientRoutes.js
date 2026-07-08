import express from "express";
import Ingredient from "../models/Ingredient.js";

const router = express.Router();

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
    const ingredient = await Ingredient.findById(req.params.id);

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
 * POST /api/ingredients
 * Create an ingredient definition.
 */
router.post("/", async (req, res) => {
  try {
    const ingredientData = {
      ...req.body,
      barcode:
        typeof req.body.barcode === "string" && req.body.barcode.trim()
          ? req.body.barcode.trim()
          : undefined,
    };

    const ingredient = await Ingredient.create(ingredientData);

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
    );

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