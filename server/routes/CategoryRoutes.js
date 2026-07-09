import express from "express";
import IngredientCategory from "../models/IngredientCategory.js";

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

export default router;