import express from "express";
import Brand from "../models/Brand.js";
import Ingredient from "../models/Ingredient.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const brands = await Brand.find()
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: brands,
    });
  } catch (error) {
    console.error("Failed to load brands:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load brands.",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const name =
      typeof req.body.name === "string"
        ? req.body.name.trim()
        : "";

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Brand name is required.",
      });
    }

    const normalizedName = name.toLowerCase();

    let brand = await Brand.findOne({
      normalizedName,
    });

    if (!brand) {
      brand = await Brand.create({
        name,
        normalizedName,
      });
    }

    return res.status(201).json({
      success: true,
      data: brand,
    });
  } catch (error) {
    console.error("Failed to create brand:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create brand.",
    });
  }
});

/**
 * PATCH /api/brands/:id
 * Rename — fixes a typo without needing to delete-and-recreate.
 */
router.patch("/:id", async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ success: false, message: "Brand name is required." });
    }

    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      { name, normalizedName: name.toLowerCase() },
      { new: true, runValidators: true },
    );

    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found." });
    }

    return res.status(200).json({ success: true, data: brand });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/brands/:id
 * brand is optional on Ingredient, so referencing ingredients just lose the
 * brand rather than needing a fallback.
 */
router.delete("/:id", async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);

    if (!brand) {
      return res.status(404).json({ success: false, message: "Brand not found." });
    }

    await Ingredient.updateMany({ brand: brand._id }, { brand: null });
    await Brand.findByIdAndDelete(req.params.id);

    return res.status(200).json({ success: true, message: "Brand deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid brand ID" });
  }
});

export default router;