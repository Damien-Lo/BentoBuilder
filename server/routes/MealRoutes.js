import express from "express";
import Meal from "../models/Meal.js";

const router = express.Router();

function populateMeal(query) {
  return query
    .populate("tags")
    .populate({ path: "courses.recipe", select: "name mealCategory nutrition servings" })
    .populate({ path: "bentoLayout.sections.recipe", select: "name mealCategory nutrition servings" });
}

/**
 * GET /api/meals
 */
router.get("/", async (req, res) => {
  try {
    const meals = await populateMeal(
      Meal.find({ isArchived: false }).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      count: meals.length,
      data: meals,
    });
  } catch (error) {
    console.error("Get meals error:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve meals" });
  }
});

/**
 * GET /api/meals/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const meal = await populateMeal(Meal.findById(req.params.id));

    if (!meal) {
      return res.status(404).json({ success: false, message: "Meal not found" });
    }

    return res.status(200).json({ success: true, data: meal });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid meal ID" });
  }
});

/**
 * POST /api/meals
 */
router.post("/", async (req, res) => {
  try {
    const meal = await Meal.create(req.body);
    const populated = await populateMeal(Meal.findById(meal._id));

    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("Create meal error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/meals/:id
 */
router.patch("/:id", async (req, res) => {
  try {
    const meal = await populateMeal(
      Meal.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }),
    );

    if (!meal) {
      return res.status(404).json({ success: false, message: "Meal not found" });
    }

    return res.status(200).json({ success: true, data: meal });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/meals/:id
 * Soft archive.
 */
router.delete("/:id", async (req, res) => {
  try {
    const meal = await Meal.findByIdAndUpdate(
      req.params.id,
      { isArchived: true },
      { new: true },
    );

    if (!meal) {
      return res.status(404).json({ success: false, message: "Meal not found" });
    }

    return res.status(200).json({ success: true, message: "Meal deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Invalid meal ID" });
  }
});

export default router;
