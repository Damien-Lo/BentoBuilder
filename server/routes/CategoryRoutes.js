import express from "express";
import IngredientCategory from "../models/IngredientCategory.js";
import Ingredient from "../models/Ingredient.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const categories = await IngredientCategory.find({
      isArchived: false,
    }).sort({ name: 1 });

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load categories",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = req.body.name?.trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const normalizedName = name.toLowerCase();

    const existing = await IngredientCategory.findOne({
      normalizedName,
      isArchived: false,
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        data: existing,
      });
    }

    const category = await IngredientCategory.create({
      name,
      normalizedName,
      isDefault: false,
    });

    return res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PATCH /api/categories/:id
 * Rename — fixes a typo without needing to delete-and-recreate (which would
 * orphan every ingredient already pointing at it).
 */
router.patch("/:id", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const category = await IngredientCategory.findByIdAndUpdate(
      req.params.id,
      { name, normalizedName: name.toLowerCase() },
      { new: true, runValidators: true },
    );

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/categories/:id
 * Default categories can't be deleted. Ingredients still pointing here move
 * to "Uncategorized" (auto-created if missing) rather than left dangling —
 * category is a required field on Ingredient.
 */
router.delete("/:id", async (req, res) => {
  try {
    const category = await IngredientCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    if (category.isDefault) {
      return res.status(400).json({ success: false, message: "Default categories can't be deleted" });
    }

    let fallback = await IngredientCategory.findOne({ normalizedName: "uncategorized" });
    if (!fallback) {
      fallback = await IngredientCategory.create({
        name: "Uncategorized",
        normalizedName: "uncategorized",
        isDefault: true,
      });
    }

    if (String(fallback._id) !== String(category._id)) {
      await Ingredient.updateMany(
        { category: category._id },
        { category: fallback._id },
      );
    }

    await IngredientCategory.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Category deleted",
      data: { reassignedTo: fallback },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid category ID" });
  }
});

export default router;