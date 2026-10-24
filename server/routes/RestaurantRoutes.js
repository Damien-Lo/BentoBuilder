import express from "express";
import mongoose from "mongoose";

import Chain from "../models/Chain.js";
import FoodSettings from "../models/FoodSettings.js";
import LibraryDish from "../models/LibraryDish.js";
import MealPlanEntry from "../models/MealPlanEntry.js";
import Restaurant from "../models/Restaurant.js";
import RestaurantDish from "../models/RestaurantDish.js";
import UsualMeal from "../models/UsualMeal.js";
import { aiAllowance } from "../services/aiAllowance.js";
import { searchDishes } from "../services/dishLibrary.js";
import { estimateMealPhoto } from "../services/mealPhotoEstimation.js";
import { currentScope } from "../services/ownership.js";

// Restaurants — public, built up by everyone (see models/Restaurant.js):
// anyone signed in can add a restaurant or a dish, or correct one, and each
// change is kept in its history; archiving and merging are the admin's.
// What's one's own — favourites, notes, ratings, what one paid — is in
// FoodSettings (kind "restaurant" / "dish") and comes back as `mine`.

const router = express.Router();

const me = () => currentScope()?.owner ?? null;
const isAdmin = () => !!currentScope()?.legacy;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normal = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const id = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);
const live = { isArchived: false, mergedInto: null };

// Metres between two [lng, lat] points.
function distance(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const [dLat, dLng] = [rad(b[1] - a[1]), rad(b[0] - a[0])];
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
// { lat, lng } from a request → GeoJSON, or undefined.
function point(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { type: "Point", coordinates: [lng, lat] };
}

// The fields a wiki edit may change, and the change as history: { field: [before, after] }.
const RESTAURANT_FIELDS = ["name", "cuisine", "address", "location", "googlePlaceId", "website", "phone", "chain"];
const DISH_FIELDS = ["name", "section", "nutrition", "source", "fromLibrary"];
function edit(record, update, fields) {
  const changes = {};
  for (const field of fields) {
    if (!(field in update)) continue;
    const before = record[field] ?? null;
    const after = update[field] ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes[field] = [before, after];
    record[field] = after;
  }
  if (Object.keys(changes).length) record.history.push({ at: new Date(), by: me(), changes, note: String(update.note ?? "").slice(0, 200) });
  return Object.keys(changes);
}

// One's own settings for these restaurants or dishes, by id.
async function mineFor(kind, ids) {
  const settings = ids.length ? await FoodSettings.find({ kind, item: { $in: ids } }).lean() : [];
  return new Map(settings.map((s) => [String(s.item), { saved: !!s.saved, notes: s.notes ?? "", price: s.price ?? null, scores: s.scores ?? [] }]));
}
const setMine = (kind, item, changes) => FoodSettings.updateOne({ kind, item }, { $set: changes }, { upsert: true, runValidators: true });

// Restaurants as listed: their chain's name, how many dishes, one's own settings.
async function listed(restaurants) {
  const ids = restaurants.map((r) => r._id);
  const chains = [...new Set(restaurants.map((r) => r.chain).filter(Boolean).map(String))];
  const [counts, chainCounts, chainNames, mine] = await Promise.all([
    RestaurantDish.aggregate([{ $match: { restaurant: { $in: ids }, ...live } }, { $group: { _id: "$restaurant", n: { $sum: 1 } } }]),
    RestaurantDish.aggregate([{ $match: { chain: { $in: chains.map(id) }, ...live } }, { $group: { _id: "$chain", n: { $sum: 1 } } }]),
    Chain.find({ _id: { $in: chains } }, "name").lean(),
    mineFor("restaurant", ids),
  ]);
  const count = new Map([...counts, ...chainCounts].map((c) => [String(c._id), c.n]));
  const chainName = new Map(chainNames.map((c) => [String(c._id), c.name]));
  return restaurants.map((r) => ({
    ...r,
    history: undefined,
    chainName: r.chain ? chainName.get(String(r.chain)) ?? null : null,
    dishCount: (count.get(String(r._id)) ?? 0) + (r.chain ? count.get(String(r.chain)) ?? 0 : 0),
    mine: mine.get(String(r._id)) ?? { saved: false, notes: "" },
  }));
}

/**
 * GET /api/restaurants?mine=true — one's own: saved, or any one's logged.
 * GET /api/restaurants?q=pho&near=-84.38,33.75 — every public restaurant
 * by name (or its chain's), nearest first when `near` (lng,lat) is given.
 */
router.get("/", async (req, res) => {
  try {
    if (req.query.mine === "true") {
      const [saved, logged] = await Promise.all([
        FoodSettings.distinct("item", { kind: "restaurant", saved: true }),
        MealPlanEntry.distinct("restaurant", { restaurant: { $ne: null } }),
      ]);
      const unsaved = new Set((await FoodSettings.distinct("item", { kind: "restaurant", saved: false })).map(String));
      const ids = [...new Set([...saved.map(String), ...logged.map(String).filter((r) => !unsaved.has(r))])];
      const restaurants = await Restaurant.find({ _id: { $in: ids }, ...live }).sort({ name: 1 }).lean();
      return res.json({ success: true, data: await listed(restaurants) });
    }
    const q = normal(req.query.q);
    const near = String(req.query.near ?? "").split(",").map(Number);
    const here = near.length === 2 && near.every(Number.isFinite) ? near : null;
    const filter = { ...live };
    if (q) {
      const start = new RegExp(`(^|[^a-z0-9])${escapeRegex(q)}`, "i");
      const chains = await Chain.find({ name: start, isArchived: false }, "_id").lean();
      filter.$or = [{ name: start }, { chain: { $in: chains.map((c) => c._id) } }];
    }
    let restaurants = await Restaurant.find(filter).limit(here ? 500 : 60).lean();
    if (here) {
      restaurants = restaurants
        .map((r) => ({ ...r, distance: r.location?.coordinates ? Math.round(distance(here, r.location.coordinates)) : null }))
        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name))
        .slice(0, 60);
    } else restaurants.sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ success: true, data: await listed(restaurants) });
  } catch (error) {
    console.error("List restaurants error:", error);
    return fail(res, 500, "Failed to list restaurants");
  }
});

/**
 * GET /api/restaurants/library?q=pad thai — the dish library (USDA's
 * restaurant-style dishes), to fill in a dish; GET /library/:id — one.
 */
router.get("/library", async (req, res) => {
  try {
    return res.json({ success: true, data: await searchDishes(req.query.q, { limit: Math.min(Number(req.query.limit) || 30, 60) }) });
  } catch (error) {
    return fail(res, 500, "Failed to search dishes");
  }
});
router.get("/library/:id", async (req, res) => {
  const dish = id(req.params.id) && (await LibraryDish.findById(req.params.id).lean());
  return dish ? res.json({ success: true, data: dish }) : fail(res, 404, "Dish not found");
});

/**
 * POST /api/restaurants/estimate-photo — an AI estimate of the dishes in a
 * photo (writes nothing): { imageBase64, mediaType, restaurantName?, singleDish? }.
 */
router.post("/estimate-photo", aiAllowance, async (req, res) => {
  try {
    const { imageBase64, mediaType, restaurantName, singleDish } = req.body;
    if (typeof imageBase64 !== "string" || !imageBase64) return fail(res, 400, "imageBase64 is required.");
    if (typeof mediaType !== "string" || !mediaType) return fail(res, 400, "mediaType is required.");
    const data = await estimateMealPhoto({ imageBase64, mediaType, restaurantName: typeof restaurantName === "string" ? restaurantName : null, singleDish: singleDish === true });
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Failed to estimate meal photo:", error);
    return fail(res, 500, error.message || "Failed to estimate meal photo.");
  }
});

// --- Dishes (by their own id) ----------------------------------------------

/**
 * PATCH /api/restaurants/dishes/:dishId — a correction (wiki): name,
 * section, nutrition, source, fromLibrary.
 */
router.patch("/dishes/:dishId", async (req, res) => {
  try {
    const dish = id(req.params.dishId) && (await RestaurantDish.findById(req.params.dishId));
    if (!dish || dish.isArchived) return fail(res, 404, "Dish not found");
    if (typeof req.body.name === "string" && !req.body.name.trim()) return fail(res, 400, "A dish needs a name.");
    edit(dish, req.body, DISH_FIELDS);
    await dish.save();
    return res.json({ success: true, data: dish });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// DELETE /api/restaurants/dishes/:dishId — off the menu (wiki; kept, and meals
// that had it keep their copy).
router.delete("/dishes/:dishId", async (req, res) => {
  try {
    const dish = id(req.params.dishId) && (await RestaurantDish.findById(req.params.dishId));
    if (!dish) return fail(res, 404, "Dish not found");
    dish.isArchived = true;
    dish.history.push({ at: new Date(), by: me(), changes: { isArchived: [false, true] }, note: "taken off the menu" });
    await dish.save();
    return res.json({ success: true });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// PUT /api/restaurants/dishes/:dishId/mine — { saved?, notes?, price? }.
router.put("/dishes/:dishId/mine", async (req, res) => {
  try {
    const dish = id(req.params.dishId) && (await RestaurantDish.exists({ _id: req.params.dishId }));
    if (!dish) return fail(res, 404, "Dish not found");
    const changes = {};
    if ("saved" in req.body) changes.saved = !!req.body.saved;
    if ("notes" in req.body) changes.notes = String(req.body.notes ?? "").trim();
    if ("price" in req.body) changes.price = req.body.price == null || req.body.price === "" ? null : Number(req.body.price);
    await setMine("dish", dish._id, changes);
    return res.json({ success: true, data: (await mineFor("dish", [dish._id])).get(String(dish._id)) });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// POST /api/restaurants/dishes/:dishId/scores — one's rating { value 1–10,
// ratedAt?, mealPlanEntry? }; DELETE …/scores/:scoreId takes one back.
router.post("/dishes/:dishId/scores", async (req, res) => {
  try {
    const value = Number(req.body.value);
    if (!Number.isFinite(value) || value < 1 || value > 10) return fail(res, 400, "A rating is from 1 to 10.");
    const dish = id(req.params.dishId) && (await RestaurantDish.exists({ _id: req.params.dishId }));
    if (!dish) return fail(res, 404, "Dish not found");
    const score = { _id: new mongoose.Types.ObjectId(), value, ratedAt: req.body.ratedAt ? new Date(req.body.ratedAt) : new Date(), mealPlanEntry: id(req.body.mealPlanEntry) };
    await FoodSettings.updateOne({ kind: "dish", item: dish._id }, { $push: { scores: score } }, { upsert: true, runValidators: true });
    return res.status(201).json({ success: true, data: (await mineFor("dish", [dish._id])).get(String(dish._id)).scores });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});
router.delete("/dishes/:dishId/scores/:scoreId", async (req, res) => {
  try {
    const dish = id(req.params.dishId);
    await FoodSettings.updateOne({ kind: "dish", item: dish }, { $pull: { scores: { _id: id(req.params.scoreId) } } });
    return res.json({ success: true, data: (await mineFor("dish", [dish])).get(String(dish))?.scores ?? [] });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// --- A restaurant -----------------------------------------------------------

/**
 * GET /api/restaurants/:id — the restaurant (or the one it was merged into),
 * its menu (its own dishes and its chain's), one's own settings for it and
 * each dish, and its last 20 changes.
 */
router.get("/:id", async (req, res) => {
  try {
    let restaurant = id(req.params.id) && (await Restaurant.findById(req.params.id).populate("chain", "name website").populate("history.by", "name").lean());
    for (let hops = 0; restaurant?.mergedInto && hops < 5; hops++) {
      restaurant = await Restaurant.findById(restaurant.mergedInto).populate("chain", "name website").populate("history.by", "name").lean();
    }
    if (!restaurant) return fail(res, 404, "Restaurant not found");
    const dishes = await RestaurantDish.find({ $or: [{ restaurant: restaurant._id }, ...(restaurant.chain ? [{ chain: restaurant.chain._id }] : [])], ...live }, "-history")
      .sort({ section: 1, name: 1 })
      .lean();
    const [mine, dishMine] = await Promise.all([mineFor("restaurant", [restaurant._id]), mineFor("dish", dishes.map((d) => d._id))]);
    return res.json({
      success: true,
      data: {
        ...restaurant,
        history: (restaurant.history ?? []).slice(-20).reverse(),
        mine: mine.get(String(restaurant._id)) ?? { saved: false, notes: "" },
        dishes: dishes.map((d) => ({ ...d, mine: dishMine.get(String(d._id)) ?? { saved: false, notes: "", price: null, scores: [] } })),
      },
    });
  } catch (error) {
    console.error("Get restaurant error:", error);
    return fail(res, 400, "Invalid restaurant ID");
  }
});

/**
 * POST /api/restaurants — { name, cuisine?, address?, location?: {lat,lng},
 * googlePlaceId?, website?, phone?, chainName? }. The same name within 300 m
 * (or where either has no location) answers 409 with the ones it may be —
 * pass ?force=true to add it anyway. Saved as one's own.
 */
router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    if (!name) return fail(res, 400, "A restaurant needs a name.");
    const location = point(req.body.location);
    if (req.query.force !== "true") {
      const same = await Restaurant.find({ name: new RegExp(`^\\s*${escapeRegex(normal(name)).replace(/ /g, "\\s+")}\\s*$`, "i"), ...live }).lean();
      const duplicates = same.filter((r) => !location || !r.location?.coordinates || distance(location.coordinates, r.location.coordinates) <= 300);
      if (duplicates.length) return res.status(409).json({ success: false, message: "This restaurant may already be in Orbit.", duplicates: await listed(duplicates) });
    }
    let chain = null;
    const chainName = String(req.body.chainName ?? "").trim();
    if (chainName) {
      chain = await Chain.findOneAndUpdate({ normalizedName: normal(chainName) }, { $setOnInsert: { name: chainName, normalizedName: normal(chainName), addedBy: me() } }, { upsert: true, new: true });
    }
    const restaurant = await Restaurant.create({
      name,
      cuisine: String(req.body.cuisine ?? "").trim(),
      address: String(req.body.address ?? "").trim(),
      location,
      googlePlaceId: req.body.googlePlaceId || null,
      website: String(req.body.website ?? "").trim(),
      phone: String(req.body.phone ?? "").trim(),
      chain: chain?._id ?? null,
      addedBy: me(),
      history: [{ at: new Date(), by: me(), changes: {}, note: "added" }],
    });
    await setMine("restaurant", restaurant._id, { saved: true });
    return res.status(201).json({ success: true, data: (await listed([restaurant.toObject()]))[0] });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * PATCH /api/restaurants/:id — a correction (wiki): name, cuisine, address,
 * location {lat,lng}, googlePlaceId, website, phone, chainName.
 */
router.patch("/:id", async (req, res) => {
  try {
    const restaurant = id(req.params.id) && (await Restaurant.findById(req.params.id));
    if (!restaurant || restaurant.isArchived) return fail(res, 404, "Restaurant not found");
    const update = { ...req.body };
    if (typeof update.name === "string" && !update.name.trim()) return fail(res, 400, "A restaurant needs a name.");
    if ("location" in update) update.location = point(update.location) ?? null;
    if ("chainName" in update) {
      const chainName = String(update.chainName ?? "").trim();
      update.chain = chainName
        ? (await Chain.findOneAndUpdate({ normalizedName: normal(chainName) }, { $setOnInsert: { name: chainName, normalizedName: normal(chainName), addedBy: me() } }, { upsert: true, new: true }))._id
        : null;
    }
    edit(restaurant, update, RESTAURANT_FIELDS);
    await restaurant.save();
    return res.json({ success: true, data: (await listed([restaurant.toObject()]))[0] });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// DELETE /api/restaurants/:id — the admin archives it; anyone else takes it
// out of their own list.
router.delete("/:id", async (req, res) => {
  try {
    const restaurant = id(req.params.id) && (await Restaurant.findById(req.params.id));
    if (!restaurant) return fail(res, 404, "Restaurant not found");
    if (isAdmin() && req.query.archive === "true") {
      restaurant.isArchived = true;
      restaurant.history.push({ at: new Date(), by: me(), changes: { isArchived: [false, true] }, note: "archived" });
      await restaurant.save();
      return res.json({ success: true, message: "Restaurant archived" });
    }
    await setMine("restaurant", restaurant._id, { saved: false });
    return res.json({ success: true, message: "Removed from your restaurants" });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// PUT /api/restaurants/:id/mine — { saved?, notes? }.
router.put("/:id/mine", async (req, res) => {
  try {
    const restaurant = id(req.params.id) && (await Restaurant.exists({ _id: req.params.id }));
    if (!restaurant) return fail(res, 404, "Restaurant not found");
    const changes = {};
    if ("saved" in req.body) changes.saved = !!req.body.saved;
    if ("notes" in req.body) changes.notes = String(req.body.notes ?? "").trim();
    await setMine("restaurant", restaurant._id, changes);
    return res.json({ success: true, data: (await mineFor("restaurant", [restaurant._id])).get(String(restaurant._id)) });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * POST /api/restaurants/:id/dishes — { name, section?, nutrition, source,
 * fromLibrary? }: on its menu (its chain's, for a chain location).
 */
router.post("/:id/dishes", async (req, res) => {
  try {
    const restaurant = id(req.params.id) && (await Restaurant.findById(req.params.id).lean());
    if (!restaurant || restaurant.isArchived) return fail(res, 404, "Restaurant not found");
    const name = String(req.body.name ?? "").trim();
    if (!name) return fail(res, 400, "A dish needs a name.");
    const dish = await RestaurantDish.create({
      ...(restaurant.chain ? { chain: restaurant.chain } : { restaurant: restaurant._id }),
      name,
      section: String(req.body.section ?? "").trim(),
      nutrition: req.body.nutrition ?? {},
      source: req.body.source ?? "typed",
      fromLibrary: req.body.fromLibrary ?? null,
      addedBy: me(),
      history: [{ at: new Date(), by: me(), changes: {}, note: "added" }],
    });
    return res.status(201).json({ success: true, data: { ...dish.toObject(), history: undefined, mine: { saved: false, notes: "", price: null, scores: [] } } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * POST /api/restaurants/:id/merge-into/:otherId — the admin's: the same place
 * added twice. Its dishes, the meals and usual meals that had it, and
 * everyone's own settings for it move to the other; it's left pointing there.
 */
router.post("/:id/merge-into/:otherId", async (req, res) => {
  try {
    if (!isAdmin()) return fail(res, 403, "Only the admin can merge restaurants.");
    const [from, into] = await Promise.all([Restaurant.findById(req.params.id), Restaurant.findById(req.params.otherId)]);
    if (!from || !into || String(from._id) === String(into._id)) return fail(res, 400, "Pick two different restaurants.");
    const every = { anyOwner: true };
    await RestaurantDish.updateMany({ restaurant: from._id }, { $set: into.chain ? { restaurant: null, chain: into.chain } : { restaurant: into._id } });
    await MealPlanEntry.updateMany({ restaurant: from._id }, { $set: { restaurant: into._id } }).setOptions(every);
    await UsualMeal.updateMany({ restaurant: from._id }, { $set: { restaurant: into._id } }).setOptions(every);
    const settings = await FoodSettings.find({ kind: "restaurant", item: from._id }).setOptions(every).lean();
    for (const s of settings) {
      await FoodSettings.updateOne({ owner: s.owner, kind: "restaurant", item: into._id }, { $setOnInsert: { owner: s.owner, saved: s.saved, notes: s.notes } }, { upsert: true }).setOptions(every);
    }
    from.mergedInto = into._id;
    from.history.push({ at: new Date(), by: me(), changes: { mergedInto: [null, String(into._id)] }, note: `merged into ${into.name}` });
    await from.save();
    return res.json({ success: true, data: { mergedInto: into._id } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

export default router;
