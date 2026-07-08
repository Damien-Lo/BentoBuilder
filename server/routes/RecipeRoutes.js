import express from "express";
import Recipe from "../models/Recipe.js";

const router = express.Router();

/**
 * GET /api/recipes
 * Return all non-archived recipes (ingredientList not populated on list).
 */
router.get("/", async (req, res) => {
  try {
    const recipes = await Recipe.find({ isArchived: false })
      .populate("recipeCategory")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: recipes.length,
      data: recipes,
    });
  } catch (error) {
    console.error("Get recipes error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve recipes",
    });
  }
});

/**
 * GET /api/recipes/:id
 * Full detail with ingredient list populated.
 */
router.get("/:id", async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id)
      .populate("recipeCategory")
      .populate({
        path: "ingredientList.ingredient",
        populate: { path: "category" },
      });

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: recipe,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid recipe ID",
    });
  }
});

function normalizeMealCategory(body) {
  if (body.mealCategory !== undefined) {
    body.mealCategory = Array.isArray(body.mealCategory)
      ? body.mealCategory
      : [body.mealCategory];
  }
  return body;
}

/**
 * POST /api/recipes
 */
router.post("/", async (req, res) => {
  try {
    const recipe = await Recipe.create(normalizeMealCategory(req.body));

    await recipe.populate("recipeCategory");
    await recipe.populate({
      path: "ingredientList.ingredient",
      populate: { path: "category" },
    });

    return res.status(201).json({
      success: true,
      data: recipe,
    });
  } catch (error) {
    console.error("Create recipe error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PATCH /api/recipes/:id
 */
router.patch("/:id", async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndUpdate(req.params.id, normalizeMealCategory(req.body), {
      new: true,
      runValidators: true,
    })
      .populate("recipeCategory")
      .populate({
        path: "ingredientList.ingredient",
        populate: { path: "category" },
      });

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: recipe,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/recipes/:id
 * Soft archive.
 */
router.delete("/:id", async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndUpdate(
      req.params.id,
      { isArchived: true },
      { new: true },
    );

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Recipe deleted",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid recipe ID",
    });
  }
});

export default router;
