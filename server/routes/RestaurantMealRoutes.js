import express from "express";
import RestaurantMeal from "../models/RestaurantMeal.js";
import { estimateMealPhoto } from "../services/mealPhotoEstimation.js";

const router = express.Router();

/**
 * GET /api/restaurant-meals
 * Pass ?archived=true to list only archived ones (the Archive view).
 */
router.get("/", async (req, res) => {
  try {
    const restaurantMeals = await RestaurantMeal.find({ isArchived: req.query.archived === "true" })
      .populate("tags")
      .sort({ restaurantName: 1 });

    return res.status(200).json({
      success: true,
      count: restaurantMeals.length,
      data: restaurantMeals,
    });
  } catch (error) {
    console.error("Get restaurant meals error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve restaurant meals",
    });
  }
});

/**
 * GET /api/restaurant-meals/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const restaurantMeal = await RestaurantMeal.findById(req.params.id).populate("tags");

    if (!restaurantMeal) {
      return res.status(404).json({
        success: false,
        message: "Restaurant meal not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: restaurantMeal,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid restaurant meal ID",
    });
  }
});

/**
 * POST /api/restaurant-meals
 */
router.post("/", async (req, res) => {
  try {
    const restaurantMeal = await RestaurantMeal.create(req.body);
    await restaurantMeal.populate("tags");

    return res.status(201).json({
      success: true,
      data: restaurantMeal,
    });
  } catch (error) {
    console.error("Create restaurant meal error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/restaurant-meals/estimate-photo
 * Preview only — does not write to the database. Body: { imageBase64,
 * mediaType, restaurantName? }. Returns estimated dishes (name, estimated
 * nutrition, confidence, a caveat note) for the caller to drop into the
 * existing dish-row editing UI as a starting point, same as any manually
 * typed dish.
 */
router.post("/estimate-photo", async (req, res) => {
  try {
    const { imageBase64, mediaType, restaurantName } = req.body;

    if (typeof imageBase64 !== "string" || !imageBase64) {
      return res.status(400).json({ success: false, message: "imageBase64 is required." });
    }
    if (typeof mediaType !== "string" || !mediaType) {
      return res.status(400).json({ success: false, message: "mediaType is required." });
    }

    const data = await estimateMealPhoto({
      imageBase64,
      mediaType,
      restaurantName: typeof restaurantName === "string" ? restaurantName : null,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Failed to estimate meal photo:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to estimate meal photo.",
    });
  }
});

/**
 * PATCH /api/restaurant-meals/:id
 */
router.patch("/:id", async (req, res) => {
  try {
    const restaurantMeal = await RestaurantMeal.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("tags");

    if (!restaurantMeal) {
      return res.status(404).json({
        success: false,
        message: "Restaurant meal not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: restaurantMeal,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/restaurant-meals/:id
 * Pass ?permanent=true to hard-delete. Default: soft archive.
 */
router.delete("/:id", async (req, res) => {
  try {
    const restaurantMeal =
      req.query.permanent === "true"
        ? await RestaurantMeal.findByIdAndDelete(req.params.id)
        : await RestaurantMeal.findByIdAndUpdate(
            req.params.id,
            { isArchived: true },
            { new: true },
          );

    if (!restaurantMeal) {
      return res.status(404).json({
        success: false,
        message: "Restaurant meal not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: req.query.permanent === "true" ? "Restaurant meal deleted" : "Restaurant meal archived",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid restaurant meal ID",
    });
  }
});

/**
 * POST /api/restaurant-meals/:id/dishes/:dishId/scores
 * Add a manual (or, eventually, meal-plan-linked) rating for one dish.
 * Returns just that dish's updated scores array.
 */
router.post("/:id/dishes/:dishId/scores", async (req, res) => {
  try {
    const parsedValue = Number(req.body.value);
    if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 10) {
      return res.status(400).json({
        success: false,
        message: "Score must be a number between 1 and 10",
      });
    }

    const restaurantMeal = await RestaurantMeal.findOneAndUpdate(
      { _id: req.params.id, "dishes._id": req.params.dishId },
      {
        $push: {
          "dishes.$.scores": {
            value: parsedValue,
            ratedAt: req.body.ratedAt || undefined,
            mealPlanEntry: req.body.mealPlanEntry || null,
          },
        },
      },
      { new: true, runValidators: true },
    );

    if (!restaurantMeal) {
      return res.status(404).json({
        success: false,
        message: "Restaurant meal or dish not found",
      });
    }

    const dish = restaurantMeal.dishes.id(req.params.dishId);

    return res.status(201).json({
      success: true,
      data: dish.scores,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/restaurant-meals/:id/dishes/:dishId/scores/:scoreId
 */
router.delete("/:id/dishes/:dishId/scores/:scoreId", async (req, res) => {
  try {
    const restaurantMeal = await RestaurantMeal.findOneAndUpdate(
      { _id: req.params.id, "dishes._id": req.params.dishId },
      { $pull: { "dishes.$.scores": { _id: req.params.scoreId } } },
      { new: true },
    );

    if (!restaurantMeal) {
      return res.status(404).json({
        success: false,
        message: "Restaurant meal or dish not found",
      });
    }

    const dish = restaurantMeal.dishes.id(req.params.dishId);

    return res.status(200).json({
      success: true,
      data: dish ? dish.scores : [],
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid IDs",
    });
  }
});

export default router;
