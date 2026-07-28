import express from "express";
import StorageLocation from "../models/StorageLocation.js";
import PantryItem from "../models/PantryItem.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const locations = await StorageLocation.find({
      isArchived: false,
    }).sort({ name: 1 });

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load storage locations",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = req.body.name?.trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Storage location name is required",
      });
    }

    const normalizedName = name.toLowerCase();

    const existing = await StorageLocation.findOne({
      normalizedName,
      isArchived: false,
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        data: existing,
      });
    }

    const location = await StorageLocation.create({
      name,
      normalizedName,
      isDefault: false,
    });

    return res.status(201).json({
      success: true,
      data: location,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/storage-locations/:id
 * Default locations (the ones that existed before user-created ones) can't
 * be deleted. Any pantry items still stored here are moved to "Other"
 * (auto-created if it's somehow missing) rather than left dangling.
 */
router.delete("/:id", async (req, res) => {
  try {
    const location = await StorageLocation.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Storage location not found",
      });
    }

    if (location.isDefault) {
      return res.status(400).json({
        success: false,
        message: "Default storage locations can't be deleted",
      });
    }

    let fallback = await StorageLocation.findOne({ normalizedName: "other" });
    if (!fallback) {
      fallback = await StorageLocation.create({
        name: "Other",
        normalizedName: "other",
        isDefault: true,
      });
    }

    if (String(fallback._id) !== String(location._id)) {
      await PantryItem.updateMany(
        { storageLocation: location._id },
        { storageLocation: fallback._id },
      );
    }

    await StorageLocation.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Storage location deleted",
      data: { reassignedTo: fallback },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid storage location ID",
    });
  }
});

export default router;