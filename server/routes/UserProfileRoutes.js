import express from "express";
import UserProfile from "../models/UserProfile.js";
import { fillGoalStart, goalChange } from "../services/weightGoal.js";

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
    const filled = await fillGoalStart(profile);
    if (filled) profile = await UserProfile.findOneAndUpdate({}, filled, { returnDocument: "after" });
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ success: false, message: "Failed to load profile" });
  }
});

/**
 * PUT /api/profile
 * Upserts the single profile document. Where the goal weight started is
 * the server's to keep (services/weightGoal.js): a goal weight sent sets it,
 * and what's sent for it is ignored.
 */
router.put("/", async (req, res) => {
  try {
    // Strip MongoDB internals so they can never be overwritten
    const { _id, __v, createdAt, updatedAt, startingWeight, startingWeightDate, goalDirection, pastGoals, ...fields } = req.body;
    const goal = "goalWeight" in fields ? await goalChange(await UserProfile.findOne().lean(), fields.goalWeight ?? null) : null;
    delete fields.goalWeight;
    const profile = await UserProfile.findOneAndUpdate(
      {},
      { $set: { ...fields, ...goal?.$set }, ...(goal?.$push ? { $push: goal.$push } : {}) },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
