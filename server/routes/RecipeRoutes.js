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

// Calculate per-serving nutrition from a populated recipe document.
// Returns null if no ingredient has nutrition data.
function calcNutrition(recipe) {
  const servings = Math.max(1, recipe.servings || 1);
  let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0, sodium = 0;
  let hasData = false;

  for (const entry of recipe.ingredientList) {
    const ing = entry.ingredient;
    if (!ing || typeof ing !== "object" || !ing.nutrition) continue;
    const multiplier = entry.quantity / (ing.defaultPortionAmount || 1);
    calories += (ing.nutrition.calories || 0) * multiplier;
    protein  += (ing.nutrition.protein  || 0) * multiplier;
    carbs    += (ing.nutrition.carbs    || 0) * multiplier;
    fats     += (ing.nutrition.fats     || 0) * multiplier;
    fiber    += (ing.nutrition.fiber    || 0) * multiplier;
    sodium   += (ing.nutrition.sodium   || 0) * multiplier;
    hasData = true;
  }

  if (!hasData) return null;
  const r = (n) => Math.round(n / servings * 10) / 10;
  return { calories: r(calories), protein: r(protein), carbs: r(carbs), fats: r(fats), fiber: r(fiber), sodium: r(sodium) };
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

    const nutrition = calcNutrition(recipe);
    if (nutrition) {
      recipe.nutrition = nutrition;
      await recipe.save();
    }

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

    const nutrition = calcNutrition(recipe);
    if (nutrition) {
      recipe.nutrition = nutrition;
      await recipe.save();
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
