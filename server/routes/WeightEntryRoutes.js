import express from "express";
import WeightEntry from "../models/WeightEntry.js";

const router = express.Router();

/**
 * GET /api/weight-entries
 * All entries, most recent date first.
 */
router.get("/", async (req, res) => {
  try {
    const entries = await WeightEntry.find().sort({ date: -1 });
    return res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    console.error("Get weight entries error:", error);
    return res.status(500).json({ success: false, message: "Failed to load weight entries" });
  }
});

/**
 * POST /api/weight-entries
 * Body: { weight, date }
 * Upserts by date — logging again on a date that already has an entry
 * updates it instead of creating a duplicate.
 */
router.post("/", async (req, res) => {
  try {
    const { weight, date } = req.body;
    if (weight == null || !date) {
      return res.status(400).json({ success: false, message: "weight and date are required" });
    }

    const entry = await WeightEntry.findOneAndUpdate(
      { date },
      { $set: { weight } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return res.status(200).json({ success: true, data: entry });
  } catch (error) {
    console.error("Create weight entry error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/weight-entries/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const entry = await WeightEntry.findByIdAndDelete(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: "Weight entry not found" });
    }
    return res.status(200).json({ success: true, message: "Weight entry deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid weight entry ID" });
  }
});

export default router;
