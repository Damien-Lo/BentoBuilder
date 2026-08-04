import express from "express";
import Tag from "../models/Tag.js";
import Ingredient from "../models/Ingredient.js";
import Recipe from "../models/Recipe.js";
import Meal from "../models/Meal.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const tags = await Tag.find().sort({ name: 1 });
    return res.status(200).json({ success: true, data: tags });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load tags" });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Tag name is required" });
    }

    const normalizedName = name.toLowerCase();

    const existing = await Tag.findOne({ normalizedName });
    if (existing) {
      return res.status(200).json({ success: true, data: existing });
    }

    const tag = await Tag.create({ name, normalizedName });
    return res.status(201).json({ success: true, data: tag });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/tags/:id
 * Rename — fixes a typo without needing to delete-and-recreate (which would
 * orphan it everywhere it's already applied).
 */
router.patch("/:id", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Tag name is required" });
    }

    const tag = await Tag.findByIdAndUpdate(
      req.params.id,
      { name, normalizedName: name.toLowerCase() },
      { new: true, runValidators: true },
    );

    if (!tag) {
      return res.status(404).json({ success: false, message: "Tag not found" });
    }

    return res.status(200).json({ success: true, data: tag });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/tags/:id
 * tags is a many-to-many array on Ingredient/Recipe/Meal, so deleting one
 * just pulls it out of every list it's in rather than needing a fallback.
 */
router.delete("/:id", async (req, res) => {
  try {
    const tag = await Tag.findById(req.params.id);

    if (!tag) {
      return res.status(404).json({ success: false, message: "Tag not found" });
    }

    await Promise.all([
      Ingredient.updateMany({ tags: tag._id }, { $pull: { tags: tag._id } }),
      Recipe.updateMany({ tags: tag._id }, { $pull: { tags: tag._id } }),
      Meal.updateMany({ tags: tag._id }, { $pull: { tags: tag._id } }),
    ]);
    await Tag.findByIdAndDelete(req.params.id);

    return res.status(200).json({ success: true, message: "Tag deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid tag ID" });
  }
});

export default router;
