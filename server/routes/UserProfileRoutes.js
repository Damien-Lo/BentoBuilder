import express from "express";
import UserProfile from "../models/UserProfile.js";

const router = express.Router();

/**
 * GET /api/profile
 * Returns the single profile document, creating a default one if none exists.
 */
router.get("/", async (req, res) => {
  try {
    let profile = await UserProfile.findOne();
    if (!profile) {
      profile = await UserProfile.create({});
    }
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ success: false, message: "Failed to load profile" });
  }
});

/**
 * PUT /api/profile
 * Upserts the single profile document.
 */
router.put("/", async (req, res) => {
  try {
    // Strip MongoDB internals so they can never be overwritten
    const { _id, __v, createdAt, updatedAt, ...fields } = req.body;
    const profile = await UserProfile.findOneAndUpdate(
      {},
      { $set: fields },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
