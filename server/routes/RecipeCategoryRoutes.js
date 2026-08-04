import express from "express";
import RecipeCategory from "../models/RecipeCategory.js";
import Recipe from "../models/Recipe.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const categories = await RecipeCategory.find({ isArchived: false }).sort({
      name: 1,
    });

    return res.json({ success: true, data: categories });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load recipe categories",
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

    const existing = await RecipeCategory.findOne({
      normalizedName,
      isArchived: false,
    });

    if (existing) {
      return res.status(200).json({ success: true, data: existing });
    }

    const category = await RecipeCategory.create({
      name,
      normalizedName,
      isDefault: false,
    });

    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/recipe-categories/:id
 * Rename — fixes a typo without needing to delete-and-recreate.
 */
router.patch("/:id", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const category = await RecipeCategory.findByIdAndUpdate(
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
 * DELETE /api/recipe-categories/:id
 * Default categories can't be deleted. recipeCategory is optional on
 * Recipe, so referencing recipes just lose the category rather than
 * needing a fallback.
 */
router.delete("/:id", async (req, res) => {
  try {
    const category = await RecipeCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    if (category.isDefault) {
      return res.status(400).json({ success: false, message: "Default categories can't be deleted" });
    }

    await Recipe.updateMany({ recipeCategory: category._id }, { recipeCategory: null });
    await RecipeCategory.findByIdAndDelete(req.params.id);

    return res.status(200).json({ success: true, message: "Category deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid category ID" });
  }
});

export default router;
