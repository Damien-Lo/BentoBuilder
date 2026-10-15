import express from "express";
import MealPlanEntry from "../models/MealPlanEntry.js";
import MenuItem from "../models/MenuItem.js";
import Recipe from "../models/Recipe.js";

const router = express.Router();

const populate = (query) =>
  query
    .populate({ path: "recipe", populate: [{ path: "recipeCategory" }] })
    .populate({
      path: "meal",
      populate: [
        { path: "courses.recipe", select: "name mealCategory nutrition servings" },
        { path: "courses.ingredient", select: "name nutrition defaultPortionAmount defaultPortionUnit unitConversions" },
      ],
    });

// How many servings of each item have been put on days, this batch.
async function placedServings(items) {
  const placed = new Map();
  for (const item of items) {
    const [row] = await MealPlanEntry.aggregate([
      { $match: { menuItem: item._id, isArchived: { $ne: true }, createdAt: { $gte: item.since ?? new Date(0) } } },
      { $group: { _id: null, servings: { $sum: { $ifNull: ["$recipeServings", 1] } } } },
    ]);
    placed.set(String(item._id), row?.servings ?? 0);
  }
  return placed;
}

const withPlaced = async (items) => {
  const placed = await placedServings(items);
  return items.map((i) => ({ ...i.toObject(), placed: placed.get(String(i._id)) ?? 0 }));
};

/**
 * GET /api/menu — every item, on the menu first, with how many of its
 * servings have been put on days (`placed`).
 */
router.get("/", async (req, res) => {
  try {
    const items = await populate(MenuItem.find({ isArchived: false }).sort({ state: 1, createdAt: -1 }));
    return res.json({ success: true, data: await withPlaced(items) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/menu  { recipe | meal, state? } — puts it on the menu. Something
 * already there (on the menu or someday) is brought back rather than added
 * twice.
 */
router.post("/", async (req, res) => {
  try {
    const { recipe, meal } = req.body;
    if (!recipe && !meal) return res.status(400).json({ success: false, message: "A recipe or a meal is needed" });
    const state = req.body.state === "someday" ? "someday" : "menu";
    let item = await MenuItem.findOne({ isArchived: false, ...(recipe ? { recipe } : { meal }) });
    if (item) {
      // (Back from someday: a fresh batch.)
      if (item.state !== "menu" && state === "menu") item.since = new Date();
      item.state = state;
    } else {
      const servings = recipe ? ((await Recipe.findById(recipe).select("servings").lean())?.servings ?? 1) : 1;
      item = new MenuItem({ recipe: recipe ?? null, meal: meal ?? null, servings, state });
    }
    await item.save();
    const [shaped] = await withPlaced([await populate(MenuItem.findById(item._id))]);
    return res.status(201).json({ success: true, data: shaped });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/menu/:id  { state?, servings? }
 */
router.patch("/:id", async (req, res) => {
  try {
    const changes = {};
    if (["menu", "someday"].includes(req.body.state)) changes.state = req.body.state;
    if (Number(req.body.servings) > 0) changes.servings = Number(req.body.servings);
    const item = await populate(MenuItem.findByIdAndUpdate(req.params.id, changes, { new: true, runValidators: true }));
    if (!item) return res.status(404).json({ success: false, message: "Not on the menu" });
    const [shaped] = await withPlaced([item]);
    return res.json({ success: true, data: shaped });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/menu/:id — off the menu altogether.
 */
router.delete("/:id", async (req, res) => {
  try {
    await MenuItem.updateOne({ _id: req.params.id }, { isArchived: true });
    return res.json({ success: true, message: "Taken off the menu" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;

// After a plan entry is placed from the menu: once all of the item's
// servings are on days, it goes back to "someday" for next time.
export async function settleMenuItem(menuItemId) {
  const item = await MenuItem.findById(menuItemId);
  if (!item || item.state !== "menu") return;
  const placed = (await placedServings([item])).get(String(item._id)) ?? 0;
  if (placed >= (item.servings || 1) - 1e-9) {
    item.state = "someday";
    await item.save();
  }
}
