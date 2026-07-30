import express from "express";
import Store from "../models/Store.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const stores = await Store.find()
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: stores,
    });
  } catch (error) {
    console.error("Failed to load stores:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load stores.",
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
        message: "Store name is required.",
      });
    }

    const normalizedName = name.toLowerCase();

    let store = await Store.findOne({
      normalizedName,
    });

    if (!store) {
      store = await Store.create({
        name,
        normalizedName,
      });
    }

    return res.status(201).json({
      success: true,
      data: store,
    });
  } catch (error) {
    console.error("Failed to create store:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create store.",
    });
  }
});

export default router;
