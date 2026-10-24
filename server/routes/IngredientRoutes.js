import express from "express";
import { ratingPromptHandler } from "../services/ratingPrompt.js";
import { copyForMe, editAsMine, factsChanged } from "../services/catalog.js";
import FoodSettings from "../models/FoodSettings.js";
import Ingredient from "../models/Ingredient.js";
import Recipe from "../models/Recipe.js";
import { getAvailableStock } from "../services/ingredientAvailability.js";
import { parseNutritionLabel } from "../services/nutritionLabelParsing.js";
import { wouldCreateCycle } from "../services/productionCycle.js";
import { aiAllowance } from "../services/aiAllowance.js";
import { ingredientList, searchFoods } from "../services/foodLibrary.js";
import { currentScope } from "../services/ownership.js";

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves which generic ingredient a new specific/branded ingredient
 * belongs to.
 *
 * - If `genericParent` is given, it must reference an existing generic.
 * - Else if `genericName` is given, find an existing generic with that name
 *   in the same category, or auto-create one if none exists yet — seeded
 *   with this specific ingredient's own portion/nutrition as a starting
 *   point, since there's nothing else to draw defaults from.
 * - Else (neither given), the ingredient is standalone — no generic parent.
 */
async function resolveGenericParent({
  genericParent,
  genericName,
  category,
  defaultPortionAmount,
  defaultPortionUnit,
  nutrition,
}) {
  if (genericParent) {
    const parent = await Ingredient.findById(genericParent);
    if (!parent || !parent.isGeneric) {
      throw new Error("genericParent must reference an existing generic ingredient");
    }
    return parent._id;
  }

  const trimmedName = genericName?.trim();
  if (!trimmedName) return null;

  const existing = await Ingredient.findOne({
    isGeneric: true,
    category,
    isArchived: false,
    name: new RegExp(`^${escapeRegex(trimmedName)}$`, "i"),
  });
  if (existing) return existing._id;

  const created = await Ingredient.create({
    name: trimmedName,
    category,
    isGeneric: true,
    defaultPortionAmount,
    defaultPortionUnit,
    nutrition,
  });
  return created._id;
}

/**
 * GET /api/ingredients
 * Return all non-archived ingredients one can see — one's own and the shared
 * catalog's — but of the food library only the foods one has saved or
 * something of one's uses (the rest are searched: GET /library). Pass
 * ?archived=true to list only archived ones instead (the Archive view's
 * recovery list). Each comes with `saved`: in one's own list (one's own
 * always are, and for the admin the shared catalog, theirs).
 */
router.get("/", async (req, res) => {
  try {
    const data = await ingredientList({ archived: req.query.archived === "true" });
    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Get ingredients error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve ingredients",
    });
  }
});

/**
 * GET /api/ingredients/library?q=rib eye
 * Searches everything one can add: the food library, the rest of the shared
 * catalog and one's own — by name and aliases, each word matching the start
 * of a word ("gre oni" finds green onion). Best first: names starting with
 * what was typed (as a whole word first), then plain foods before branded
 * ones, then shorter names.
 * Each comes with `saved`: whether it's in one's own list (one's own always
 * are).
 */
router.get("/library", async (req, res) => {
  try {
    const data = await searchFoods(req.query.q, { limit: Math.min(Number(req.query.limit) || 40, 100) });
    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error("Search ingredients error:", error);
    return res.status(500).json({ success: false, message: "Failed to search ingredients" });
  }
});

// In one's own list: one's own always, a shared one once saved (and for the
// admin, the shared catalog — theirs — apart from the food library).
async function isSaved(ingredient) {
  if (ingredient.owner != null) return true;
  if (currentScope()?.legacy && ingredient.source !== "usda") return true;
  return !!(await FoodSettings.exists({ kind: "ingredient", item: ingredient._id, saved: true }));
}

/**
 * GET /api/ingredients/barcode/:code
 * The ingredient with this barcode (as a 12-digit UPC or the same with a
 * leading 0) — one's own first, else the shared catalog's — saved or not
 * (with `saved`), or 404. A scan asks here: the
 * list (GET /) doesn't hold every shared product.
 */
router.get("/barcode/:code", async (req, res) => {
  try {
    const code = String(req.params.code ?? "").trim();
    // (The same product as a 12-digit UPC or a 13-digit EAN with a leading 0.)
    const forms = [code, /^\d{12}$/.test(code) ? `0${code}` : null, /^0\d{12}$/.test(code) ? code.slice(1) : null].filter(Boolean);
    const found = await Ingredient.find({ barcode: { $in: forms }, isArchived: false })
      .populate("category")
      .populate("brand")
      .populate("genericParent").populate("defaultStorageLocation")
      .populate("productionRecipe")
      .populate("tags");
    const ingredient = found.find((i) => i.owner != null) ?? found[0];
    if (!code || !ingredient) return res.status(404).json({ success: false, message: "No ingredient has that barcode" });
    return res.status(200).json({ success: true, data: { ...ingredient.toJSON(), saved: await isSaved(ingredient) } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/ingredients/:id
 * Return one ingredient.
 */
router.get("/:id", async (req, res) => {
  try {
    const ingredient = await Ingredient.findById(req.params.id)
      .populate("category")
      .populate("brand")
      .populate("genericParent").populate("defaultStorageLocation")
      .populate("productionRecipe")
      .populate("tags");

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: { ...ingredient.toJSON(), saved: await isSaved(ingredient) },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid ingredient ID",
    });
  }
});

/**
 * GET /api/ingredients/:id/availability
 * Pantry stock for this ingredient. For a generic ingredient, aggregates
 * stock across itself and every branded/specific variant beneath it.
 */
router.get("/:id/availability", async (req, res) => {
  try {
    const stock = await getAvailableStock(req.params.id);

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: stock,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid ingredient ID",
    });
  }
});

/**
 * POST /api/ingredients/parse-label
 * Preview only — does not write to the database. Body: { imageBase64,
 * mediaType }. Transcribes a photographed Nutrition Facts / Supplement
 * Facts label into per-serving nutrition plus the printed serving, for the
 * add/edit ingredient form to fill in.
 */
router.post("/parse-label", aiAllowance, async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body;

    if (typeof imageBase64 !== "string" || !imageBase64) {
      return res.status(400).json({ success: false, message: "imageBase64 is required." });
    }
    if (typeof mediaType !== "string" || !mediaType) {
      return res.status(400).json({ success: false, message: "mediaType is required." });
    }

    const data = await parseNutritionLabel({ imageBase64, mediaType });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Failed to parse nutrition label:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to read the nutrition label.",
    });
  }
});

/**
 * POST /api/ingredients
 * Create an ingredient definition.
 */
router.post("/", async (req, res) => {
  try {
    const { genericName, ...body } = req.body;

    const ingredientData = {
      ...body,
      barcode:
        typeof body.barcode === "string" && body.barcode.trim()
          ? body.barcode.trim()
          : undefined,
    };

    if (!ingredientData.isGeneric) {
      ingredientData.genericParent = await resolveGenericParent({
        genericParent: ingredientData.genericParent,
        genericName,
        category: ingredientData.category,
        defaultPortionAmount: ingredientData.defaultPortionAmount,
        defaultPortionUnit: ingredientData.defaultPortionUnit,
        nutrition: ingredientData.nutrition,
      });
    }

    const ingredient = await Ingredient.create(ingredientData);
    // Document#populate() (unlike a Query's) resolves to a Promise per call,
    // so it can't be chained without awaiting each one — pass all paths in
    // a single call instead.
    await ingredient.populate([
      "category",
      "brand",
      "genericParent",
      "defaultStorageLocation",
      "productionRecipe",
      "tags",
    ]);

    return res.status(201).json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    console.error("Create ingredient error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An ingredient with this barcode already exists",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * PATCH /api/ingredients/:id
 * Update part of an ingredient.
 */
router.patch("/:id", async (req, res) => {
  try {
    if (req.body.productionRecipe) {
      const producingRecipe = await Recipe.findById(req.body.productionRecipe).select(
        "ingredientList.ingredient nutrition",
      );

      if (!producingRecipe) {
        return res.status(400).json({
          success: false,
          message: "productionRecipe must reference an existing recipe",
        });
      }

      if (await wouldCreateCycle(req.params.id, producingRecipe.ingredientList)) {
        return res.status(400).json({
          success: false,
          message:
            "This recipe (directly or through one of its own produced ingredients) already requires this ingredient, so it can't also be the recipe that produces it.",
        });
      }

      // "1 serving cooked" == "defaultPortionAmount defaultPortionUnit
      // produced" is the whole basis for the nutrition copy below and for
      // how much gets deposited/substituted elsewhere — it's user-chosen
      // yield data now (e.g. "1 serving = 250 mL"), not something to
      // force, but it has to actually be present and valid to mean anything.
      const yieldAmount = Number(req.body.defaultPortionAmount);
      const yieldUnit = typeof req.body.defaultPortionUnit === "string" ? req.body.defaultPortionUnit.trim() : "";
      if (!Number.isFinite(yieldAmount) || yieldAmount <= 0 || !yieldUnit) {
        return res.status(400).json({
          success: false,
          message: "Enter how much one serving of the recipe makes (a positive amount and a unit).",
        });
      }
      req.body.defaultPortionAmount = yieldAmount;
      req.body.defaultPortionUnit = yieldUnit;

      // Nutrition normally stays in sync via RecipeRoutes.js whenever the
      // recipe itself is saved — but linking happens *after* the recipe is
      // first created, so without this the very first link would leave
      // nutrition empty until the recipe is edited again.
      req.body.nutrition = producingRecipe.nutrition;
    }

    // A library food (anyone's), or a shared one for someone other than the
    // admin, isn't one's own to change: changing what it is (not one's own
    // settings for it) saves one's own copy in its place — see
    // services/catalog.js editAsMine. Answered with the copy and `copiedFrom`.
    const current = await Ingredient.findById(req.params.id).lean();
    // (The page clears a generic's stray barcode on every save: not an edit.)
    const { barcode: _strayBarcode, ...changesToGeneric } = req.body;
    const edit = current?.isGeneric ? changesToGeneric : req.body;
    if (current && current.owner == null && (current.source === "usda" || !currentScope()?.legacy) && factsChanged(edit, current, "ingredient").length) {
      const copy = await editAsMine(current._id, req.body);
      const shown = await Ingredient.findById(copy._id)
        .populate("category")
        .populate("brand")
        .populate("genericParent").populate("defaultStorageLocation")
        .populate("productionRecipe")
        .populate("tags");
      return res.status(201).json({ success: true, data: { ...shown.toJSON(), saved: true }, copiedFrom: current._id });
    }

    const ingredient = await Ingredient.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("category")
      .populate("brand")
      .populate("genericParent").populate("defaultStorageLocation")
      .populate("productionRecipe")
      .populate("tags");

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: ingredient,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ingredients/:id
 * Pass ?permanent=true to hard-delete. Default: soft archive.
 */
router.delete("/:id", async (req, res) => {
  try {
    let ingredient;

    // A food library food (anyone's), or a shared one for someone other than
    // the admin: it isn't theirs to delete — it leaves their ingredients
    // (unsaved), and stays in the library to find again.
    const found = await Ingredient.findById(req.params.id);
    if (found && found.owner == null && (found.source === "usda" || !currentScope()?.legacy)) {
      await FoodSettings.updateOne({ kind: "ingredient", item: found._id }, { $set: { saved: false } }, { upsert: true, runValidators: true });
      return res.status(200).json({ success: true, message: "Removed from your ingredients", removed: true });
    }

    if (req.query.permanent === "true") {
      ingredient = await Ingredient.findByIdAndDelete(req.params.id);
    } else {
      ingredient = await Ingredient.findByIdAndUpdate(
        req.params.id,
        { isArchived: true },
        { new: true },
      );
    }

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: req.query.permanent === "true" ? "Ingredient deleted" : "Ingredient archived",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.name === "CastError" ? "Invalid ingredient ID" : error.message,
    });
  }
});

/**
 * POST /api/ingredients/:id/scores
 * Add a manual (or meal-plan-linked) rating — mirrors POST
 * /api/recipes/:id/scores exactly. Returns just the updated scores array,
 * same reasoning as the recipe route (the client merges this in rather
 * than replacing the whole ingredient with an unpopulated one).
 */
/**
 * POST /api/ingredients/:id/rating-prompt  { action: "skip" | "disable" | "enable" }
 * Records a skipped auto rating prompt, or turns the prompt off/on.
 */
router.post("/:id/rating-prompt", ratingPromptHandler(Ingredient, "Ingredient"));

router.post("/:id/scores", async (req, res) => {
  try {
    const parsedValue = Number(req.body.value);
    if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 10) {
      return res.status(400).json({
        success: false,
        message: "Score must be a number between 1 and 10",
      });
    }

    const ingredient = await Ingredient.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          scores: {
            value: parsedValue,
            ratedAt: req.body.ratedAt || undefined,
            mealPlanEntry: req.body.mealPlanEntry || null,
          },
        },
        // A real rating ends any run of skipped prompts.
        $set: { "ratingPrompt.skipCount": 0 },
      },
      { new: true, runValidators: true },
    );

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(201).json({
      success: true,
      data: ingredient.scores,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/ingredients/:id/scores/:scoreId
 * Remove a single rating (e.g. to undo a mistaken entry).
 */
router.delete("/:id/scores/:scoreId", async (req, res) => {
  try {
    const ingredient = await Ingredient.findByIdAndUpdate(
      req.params.id,
      { $pull: { scores: { _id: req.params.scoreId } } },
      { new: true },
    );

    if (!ingredient) {
      return res.status(404).json({
        success: false,
        message: "Ingredient not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: ingredient.scores,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid ingredient or score ID",
    });
  }
});

/**
 * POST /api/ingredients/:id/copy
 * One's own copy of a ingredient, to change as one likes (a shared ingredient can
 * only be changed by the admin — see services/catalog.js).
 */
router.post("/:id/copy", async (req, res) => {
  try {
    const copy = await copyForMe(Ingredient, req.params.id);
    if (!copy) return res.status(404).json({ success: false, message: "Ingredient not found" });
    return res.status(201).json({ success: true, data: copy });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/ingredients/:id/save, DELETE /api/ingredients/:id/save
 * A shared ingredient (from the food library or the catalog) into, or out
 * of, one's own list. One's own ingredients are always in it.
 */
async function setSaved(req, res, saved) {
  try {
    const ingredient = await Ingredient.findById(req.params.id);
    if (!ingredient) return res.status(404).json({ success: false, message: "Ingredient not found" });
    if (ingredient.owner == null) {
      await FoodSettings.updateOne({ kind: "ingredient", item: ingredient._id }, { $set: { saved } }, { upsert: true, runValidators: true });
    }
    return res.status(200).json({ success: true, data: { ...ingredient.toObject(), saved: ingredient.owner != null || saved } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}
router.post("/:id/save", (req, res) => setSaved(req, res, true));
router.delete("/:id/save", (req, res) => setSaved(req, res, false));

export default router;