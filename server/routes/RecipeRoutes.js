import express from "express";
import Recipe from "../models/Recipe.js";
import Ingredient from "../models/Ingredient.js";
import UserProfile from "../models/UserProfile.js";
import { convertUnits, getIngredientConversions } from "../services/unitConversion.js";
import { wouldCreateCycle } from "../services/productionCycle.js";

const router = express.Router();

/**
 * GET /api/recipes
 * Return all non-archived recipes (ingredientList not populated on list).
 * Pass ?archived=true to list only archived ones instead (the Archive
 * view's recovery list).
 */
router.get("/", async (req, res) => {
  try {
    const recipes = await Recipe.find({ isArchived: req.query.archived === "true" })
      .populate("recipeCategory")
      .populate("tags")
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
      .populate("tags")
      .populate({
        path: "ingredientList.ingredient",
        populate: [{ path: "category" }, { path: "brand" }, { path: "genericParent" }],
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

/**
 * POST /api/recipes/:id/scores
 * Add a manual (or, eventually, meal-plan-linked) rating. Returns just the
 * updated scores array — the recipe's populated fields (category,
 * ingredients) are untouched, so the client merges this in rather than
 * replacing the whole recipe with an unpopulated one.
 */
router.post("/:id/scores", async (req, res) => {
  try {
    const parsedValue = Number(req.body.value);
    if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 10) {
      return res.status(400).json({
        success: false,
        message: "Score must be a number between 1 and 10",
      });
    }

    const recipe = await Recipe.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          scores: {
            value: parsedValue,
            ratedAt: req.body.ratedAt || undefined,
            mealPlanEntry: req.body.mealPlanEntry || null,
          },
        },
      },
      { new: true, runValidators: true },
    );

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found",
      });
    }

    return res.status(201).json({
      success: true,
      data: recipe.scores,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/recipes/:id/scores/:scoreId
 * Remove a single rating (e.g. to undo a mistaken entry).
 */
router.delete("/:id/scores/:scoreId", async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndUpdate(
      req.params.id,
      { $pull: { scores: { _id: req.params.scoreId } } },
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
      data: recipe.scores,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid recipe or score ID",
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

// Calculate per-serving nutrition from a populated recipe document. A
// recipe line's unit doesn't have to match the ingredient's own unit (e.g.
// "2 cups" soy sauce where the ingredient's serving is defined in mL) — it's
// converted before applying the per-serving nutrition multiplier.
// Returns null if no ingredient has nutrition data.
async function calcNutrition(recipe) {
  const profile = await UserProfile.findOne().select("unitConversions").lean();
  const globalConversions = profile?.unitConversions ?? [];

  const servings = Math.max(1, recipe.servings || 1);
  let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0, sodium = 0;
  let hasData = false;

  for (const entry of recipe.ingredientList) {
    const ing = entry.ingredient;
    if (!ing || typeof ing !== "object" || !ing.nutrition) continue;

    const quantityInNativeUnit = convertUnits(
      entry.quantity,
      entry.unit,
      ing.defaultPortionUnit,
      getIngredientConversions(ing, globalConversions),
    );
    if (quantityInNativeUnit == null) continue;

    const multiplier = quantityInNativeUnit / (ing.defaultPortionAmount || 1);
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

// A produced ingredient's nutrition is a derived value, not something
// manually edited once linked — keep it permanently in sync with whatever
// this recipe's own (already-automatic) nutrition computes to, every time
// the recipe is saved.
async function syncProducedIngredientNutrition(recipe, nutrition) {
  if (!nutrition) return;

  const producedIngredient = await Ingredient.findOne({ productionRecipe: recipe._id });
  if (!producedIngredient) return;

  producedIngredient.nutrition = nutrition;
  await producedIngredient.save();
}

/**
 * POST /api/recipes
 */
router.post("/", async (req, res) => {
  try {
    const recipe = await Recipe.create(normalizeMealCategory(req.body));

    await recipe.populate("recipeCategory");
    await recipe.populate("tags");
    await recipe.populate({
      path: "ingredientList.ingredient",
      populate: [{ path: "category" }, { path: "brand" }, { path: "genericParent" }],
    });

    const nutrition = await calcNutrition(recipe);
    if (nutrition) {
      recipe.nutrition = nutrition;
      await recipe.save();
    }
    await syncProducedIngredientNutrition(recipe, nutrition);

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
    // A recipe's own ingredientList changing can introduce a production
    // cycle even without touching any ingredient's productionRecipe field
    // directly (e.g. editing this recipe to use an ingredient that, through
    // its own chain, already requires whatever this recipe itself
    // produces) — so this needs the same check IngredientRoutes.js runs
    // when linking, just from the other direction.
    if (req.body.ingredientList) {
      const producedIngredient = await Ingredient.findOne({ productionRecipe: req.params.id }).select("_id");
      if (
        producedIngredient &&
        (await wouldCreateCycle(producedIngredient._id, req.body.ingredientList))
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This ingredient list would create a production cycle — one of these ingredients (directly or through its own recipe) already requires the ingredient this recipe produces.",
        });
      }
    }

    const recipe = await Recipe.findByIdAndUpdate(req.params.id, normalizeMealCategory(req.body), {
      new: true,
      runValidators: true,
    })
      .populate("recipeCategory")
      .populate("tags")
      .populate({
        path: "ingredientList.ingredient",
        populate: [{ path: "category" }, { path: "brand" }, { path: "genericParent" }],
      });

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found",
      });
    }

    const nutrition = await calcNutrition(recipe);
    if (nutrition) {
      recipe.nutrition = nutrition;
      await recipe.save();
    }
    await syncProducedIngredientNutrition(recipe, nutrition);

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
 * Pass ?permanent=true to hard-delete. Default: soft archive.
 */
router.delete("/:id", async (req, res) => {
  try {
    const recipe =
      req.query.permanent === "true"
        ? await Recipe.findByIdAndDelete(req.params.id)
        : await Recipe.findByIdAndUpdate(
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
      message: req.query.permanent === "true" ? "Recipe deleted" : "Recipe archived",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid recipe ID",
    });
  }
});

export default router;
