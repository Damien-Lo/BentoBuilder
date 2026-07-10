import express from "express";
import MealPlanEntry from "../models/MealPlanEntry.js";

const router = express.Router();

function populateEntry(query) {
  return query.populate({
    path: "meal",
    populate: [
      { path: "tags" },
      { path: "courses.recipe", select: "name mealCategory nutrition servings" },
    ],
  });
}

/**
 * GET /api/meal-plan?date=YYYY-MM-DD
 */
router.get("/", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: "date query param is required" });
    }
    const entries = await populateEntry(
      MealPlanEntry.find({ date, isArchived: false }).sort({ createdAt: 1 }),
    );
    return res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    console.error("Get meal plan error:", error);
    return res.status(500).json({ success: false, message: "Failed to load meal plan" });
  }
});

/**
 * POST /api/meal-plan
 */
router.post("/", async (req, res) => {
  try {
    const entry = await MealPlanEntry.create(req.body);
    const populated = await populateEntry(MealPlanEntry.findById(entry._id));
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("Create meal plan entry error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/meal-plan/:id — soft delete
 */
router.delete("/:id", async (req, res) => {
  try {
    const entry = await MealPlanEntry.findByIdAndUpdate(
      req.params.id,
      { isArchived: true },
      { new: true },
    );
    if (!entry) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }
    return res.status(200).json({ success: true, message: "Entry removed" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid entry ID" });
  }
});

export default router;
