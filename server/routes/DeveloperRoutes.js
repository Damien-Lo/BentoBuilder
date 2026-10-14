import express from "express";
import mongoose from "mongoose";

import { canSwitchDatabase, connectDatabase, currentDatabase, DATABASES } from "../config/database.js";
import Ingredient from "../models/Ingredient.js";
import { resetTestDatabase } from "../services/testDatabase.js";

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

// --- Which data the server is on (config/database.js) ---

const databaseState = () => ({
  current: currentDatabase(),
  canSwitch: canSwitchDatabase(),
  databases: Object.entries(DATABASES).map(([id, d]) => ({ id, ...d })),
});

/**
 * GET /api/developer/database
 * The data in use — real or test — and whether it can be changed here (only
 * on a developer's machine; the deployed server is always on the real data).
 */
router.get("/database", (req, res) => res.json({ success: true, data: databaseState() }));

/**
 * POST /api/developer/database  { name: "real" | "test" }
 * Switches the whole server to the other data.
 */
router.post("/database", async (req, res) => {
  try {
    if (!canSwitchDatabase()) return res.status(403).json({ success: false, message: "This server only has the real data." });
    if (!DATABASES[req.body.name]) return res.status(400).json({ success: false, message: "Unknown database" });
    await connectDatabase(req.body.name);
    console.log(`Switched to ${mongoose.connection.name} (${DATABASES[currentDatabase()].label.toLowerCase()})`);
    return res.json({ success: true, data: databaseState() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/developer/database/reset-test
 * Rebuilds the test data from the real: recipes, ingredients and the like
 * copied afresh, everything else emptied. The real data is only read.
 */
router.post("/database/reset-test", async (req, res) => {
  try {
    if (!canSwitchDatabase()) return res.status(403).json({ success: false, message: "This server only has the real data." });
    const result = await resetTestDatabase();
    // (Its indexes went with its collections.)
    if (currentDatabase() === "test") await connectDatabase("test");
    return res.json({ success: true, data: { ...databaseState(), copied: result.copied } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
