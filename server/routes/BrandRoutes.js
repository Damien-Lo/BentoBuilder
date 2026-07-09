import express from "express";
import Brand from "../models/Brand.js";

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

export default router;