import express from "express";
import Store from "../models/Store.js";
import PantryItem from "../models/PantryItem.js";

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

/**
 * PATCH /api/stores/:id
 * Rename — fixes a typo without needing to delete-and-recreate.
 */
router.patch("/:id", async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ success: false, message: "Store name is required." });
    }

    const store = await Store.findByIdAndUpdate(
      req.params.id,
      { name, normalizedName: name.toLowerCase() },
      { new: true, runValidators: true },
    );

    if (!store) {
      return res.status(404).json({ success: false, message: "Store not found." });
    }

    return res.status(200).json({ success: true, data: store });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/stores/:id
 * store is optional on PantryItem, so referencing entries just lose the
 * store rather than needing a fallback.
 */
router.delete("/:id", async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);

    if (!store) {
      return res.status(404).json({ success: false, message: "Store not found." });
    }

    await PantryItem.updateMany({ store: store._id }, { store: null });
    await Store.findByIdAndDelete(req.params.id);

    return res.status(200).json({ success: true, message: "Store deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid store ID" });
  }
});

export default router;
