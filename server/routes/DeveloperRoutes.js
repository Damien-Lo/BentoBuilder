import express from "express";
import Ingredient from "../models/Ingredient.js";

const router = express.Router();

/**
 * GET /api/developer/ingredient-issues
 *
 * Read-only data-quality report for the app's "Developer" section — every
 * active ingredient with something fixable but not broken: a specific/
 * branded ingredient with no barcode, or a genericParent reference that no
 * longer resolves to an existing generic (e.g. the generic it pointed at
 * was later archived or deleted — nothing currently stops that from
 * happening, see IngredientRoutes.js's DELETE route). More issue types can
 * be added here over time without touching the main ingredients route.
 */
router.get("/ingredient-issues", async (req, res) => {
  try {
    const ingredients = await Ingredient.find({ isArchived: false }, "name isGeneric barcode genericParent");

    const genericIds = new Set(
      ingredients.filter(i => i.isGeneric).map(i => String(i._id)),
    );

    const results = [];
    for (const i of ingredients) {
      const issues = [];
      if (!i.isGeneric && !i.barcode) issues.push("no-barcode");
      if (i.genericParent && !genericIds.has(String(i.genericParent))) issues.push("dangling-generic-parent");
      if (issues.length) results.push({ id: i._id, name: i.name, isGeneric: i.isGeneric, issues });
    }

    return res.status(200).json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error("Get ingredient issues error:", error);
    return res.status(500).json({ success: false, message: "Failed to compute ingredient issues" });
  }
});

export default router;
