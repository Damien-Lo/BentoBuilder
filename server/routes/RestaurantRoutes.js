import express from "express";
import mongoose from "mongoose";

import Chain from "../models/Chain.js";
import ChangeRequest from "../models/ChangeRequest.js";
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

// Restaurants — public, built up by everyone (see models/Restaurant.js), and
// reviewed: what a member adds — a restaurant, a dish — waits for a reviewer
// before anyone else sees it (they can use and log it meanwhile, and fix it
// themselves), and a change to what's already there — an edit, taking a dish
// off the menu — is a suggestion (ChangeRequest) until a reviewer approves
// it. A reviewer (the admin, or a member given `reviewer`) adds and changes
// directly. Every change made is kept in the item's history. What's one's
// own — favourites, notes, ratings, what one paid — is in FoodSettings (kind
// "restaurant" / "dish") and comes back as `mine`.

const router = express.Router();

const me = () => currentScope()?.owner ?? null;
const isAdmin = () => !!currentScope()?.legacy;
const canReview = (req) => isAdmin() || req.user?.reviewer === true;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normal = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const id = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);
const same = (a, b) => a != null && b != null && String(a) === String(b);
const live = { isArchived: false, mergedInto: null };
// What one may see: what's approved (and what's from before reviews), and
// what one added oneself that's waiting or was turned down.
const visible = () => ({ $or: [{ status: { $exists: false } }, { status: "approved" }, { status: { $in: ["pending", "rejected"] }, addedBy: me() }] });
// One's own addition still waiting: theirs to fix directly.
const ownPending = (record) => record.status === "pending" && same(record.addedBy, me());

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
const chainNamed = (name) =>
  Chain.findOneAndUpdate({ normalizedName: normal(name) }, { $setOnInsert: { name: name.trim(), normalizedName: normal(name), addedBy: me() } }, { upsert: true, new: true });

// The fields a change may touch, and an update as { field: value } — a
// restaurant's location from {lat,lng}, its chain from a name.
const RESTAURANT_FIELDS = ["name", "cuisine", "address", "location", "googlePlaceId", "website", "phone", "chain"];
const DISH_FIELDS = ["name", "section", "nutrition", "source", "fromLibrary"];
async function restaurantUpdate(body) {
  const update = {};
  for (const field of RESTAURANT_FIELDS) if (field in body && field !== "location" && field !== "chain") update[field] = typeof body[field] === "string" ? body[field].trim() : body[field];
  if ("location" in body) update.location = point(body.location) ?? null;
  if ("chainName" in body) update.chain = String(body.chainName ?? "").trim() ? (await chainNamed(String(body.chainName)))._id : null;
  return update;
}
const dishUpdate = (body) => Object.fromEntries(DISH_FIELDS.filter((f) => f in body).map((f) => [f, typeof body[f] === "string" ? body[f].trim() : body[f]]));

// The fields an update would really change on a record: { field: [before, after] }.
function differences(record, update) {
  const changes = {};
  for (const [field, after] of Object.entries(update)) {
    const before = record[field]?.toObject?.() ?? record[field] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after ?? null)) changes[field] = [before, after ?? null];
  }
  return changes;
}
// Makes the change, kept in its history (as `by`'s; `note` says why, or who approved it).
function apply(record, changes, by, note = "") {
  for (const [field, [, after]] of Object.entries(changes)) record[field] = after;
  if (Object.keys(changes).length) record.history.push({ at: new Date(), by, changes, note: String(note).slice(0, 200) });
}

// One's own settings for these restaurants or dishes, by id.
async function mineFor(kind, ids) {
  const settings = ids.length ? await FoodSettings.find({ kind, item: { $in: ids } }).lean() : [];
  return new Map(settings.map((s) => [String(s.item), { saved: !!s.saved, notes: s.notes ?? "", price: s.price ?? null, scores: s.scores ?? [] }]));
}
const setMine = (kind, item, changes) => FoodSettings.updateOne({ kind, item }, { $set: changes }, { upsert: true, runValidators: true });

// Restaurants as listed: their chain's name, how many dishes one sees, one's own settings.
async function listed(restaurants) {
  const ids = restaurants.map((r) => r._id);
  const chains = [...new Set(restaurants.map((r) => r.chain).filter(Boolean).map(String))];
  const shown = { ...live, ...visible() };
  const [counts, chainCounts, chainNames, mine] = await Promise.all([
    RestaurantDish.aggregate([{ $match: { restaurant: { $in: ids }, ...shown } }, { $group: { _id: "$restaurant", n: { $sum: 1 } } }]),
    RestaurantDish.aggregate([{ $match: { chain: { $in: chains.map(id) }, ...shown } }, { $group: { _id: "$chain", n: { $sum: 1 } } }]),
    Chain.find({ _id: { $in: chains } }, "name").lean(),
    mineFor("restaurant", ids),
  ]);
  const count = new Map([...counts, ...chainCounts].map((c) => [String(c._id), c.n]));
  const chainName = new Map(chainNames.map((c) => [String(c._id), c.name]));
  return restaurants.map((r) => ({
    ...r,
    history: undefined,
    status: r.status ?? "approved",
    chainName: r.chain ? chainName.get(String(r.chain)) ?? null : null,
    dishCount: (count.get(String(r._id)) ?? 0) + (r.chain ? count.get(String(r.chain)) ?? 0 : 0),
    mine: mine.get(String(r._id)) ?? { saved: false, notes: "" },
  }));
}

// A suggested change, waiting (answered 202 with { pending: true, request }).
async function suggest(res, { kind, item, restaurant, action, changes, note }) {
  const request = await ChangeRequest.create({
    kind,
    item: item._id,
    restaurant,
    action,
    changes: Object.fromEntries(Object.entries(changes).map(([f, [, after]]) => [f, after])),
    before: Object.fromEntries(Object.entries(changes).map(([f, [before]]) => [f, before])),
    note: String(note ?? "").slice(0, 200),
    by: me(),
  });
  return res.status(202).json({ success: true, pending: true, message: "Suggested — a reviewer will look at it.", data: request });
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
      const restaurants = await Restaurant.find({ _id: { $in: ids }, ...live, ...visible() }).sort({ name: 1 }).lean();
      return res.json({ success: true, data: await listed(restaurants) });
    }
    const q = normal(req.query.q);
    const near = String(req.query.near ?? "").split(",").map(Number);
    const here = near.length === 2 && near.every(Number.isFinite) ? near : null;
    const filter = { ...live, $and: [visible()] };
    if (q) {
      const start = new RegExp(`(^|[^a-z0-9])${escapeRegex(q)}`, "i");
      const chains = await Chain.find({ name: start, isArchived: false }, "_id").lean();
      filter.$and.push({ $or: [{ name: start }, { chain: { $in: chains.map((c) => c._id) } }] });
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

// --- Review (reviewers only) ---------------------------------------------------

/**
 * GET /api/restaurants/review — what's waiting: new restaurants (with the
 * dishes added with them), new dishes on restaurants already there, and
 * suggested changes (with the item as it is now), oldest first.
 */
router.get("/review", async (req, res) => {
  try {
    if (!canReview(req)) return fail(res, 403, "Only reviewers can see what's waiting.");
    const [restaurants, dishes, requests] = await Promise.all([
      Restaurant.find({ status: "pending", ...live }).populate("addedBy", "name").populate("chain", "name").sort({ createdAt: 1 }).lean(),
      RestaurantDish.find({ status: "pending", ...live }, "-history").populate("addedBy", "name").sort({ createdAt: 1 }).lean(),
      ChangeRequest.find({ status: "pending" }).populate("by", "name").sort({ createdAt: 1 }).lean(),
    ]);
    // The restaurant each dish and suggestion is about, by name.
    const chainOf = new Map((await Restaurant.find({ chain: { $in: dishes.map((d) => d.chain).filter(Boolean) } }, "name chain").lean()).map((r) => [String(r.chain), r]));
    const placeIds = [...dishes.map((d) => d.restaurant), ...requests.map((r) => r.restaurant)].filter(Boolean);
    const places = new Map((await Restaurant.find({ _id: { $in: placeIds } }, "name status").lean()).map((r) => [String(r._id), r]));
    const items = new Map([
      ...(await Restaurant.find({ _id: { $in: requests.filter((r) => r.kind === "restaurant").map((r) => r.item) } }, "-history").lean()).map((r) => [String(r._id), r]),
      ...(await RestaurantDish.find({ _id: { $in: requests.filter((r) => r.kind === "dish").map((r) => r.item) } }, "-history").lean()).map((d) => [String(d._id), d]),
    ]);
    const placeOf = (d) => places.get(String(d.restaurant)) ?? chainOf.get(String(d.chain)) ?? null;
    return res.json({
      success: true,
      data: {
        restaurants: restaurants.map((r) => ({ ...r, history: undefined, dishes: dishes.filter((d) => same(d.restaurant, r._id) || (r.chain && same(d.chain, r.chain._id))) })),
        dishes: dishes.filter((d) => !restaurants.some((r) => same(d.restaurant, r._id) || (r.chain && same(d.chain, r.chain._id)))).map((d) => ({ ...d, restaurantName: placeOf(d)?.name ?? null, restaurantId: placeOf(d)?._id ?? null })),
        requests: requests.map((r) => ({ ...r, item: items.get(String(r.item)) ?? null, restaurantName: places.get(String(r.restaurant))?.name ?? null })),
      },
    });
  } catch (error) {
    console.error("Review list error:", error);
    return fail(res, 500, "Failed to list what's waiting");
  }
});

/**
 * POST /api/restaurants/review/:kind/:id — { decision: "approve" | "reject",
 * note? } for a new restaurant ("restaurants"; its dishes added with it go
 * with it), a new dish ("dishes"), or a suggested change ("requests").
 */
router.post("/review/:kind/:id", async (req, res) => {
  try {
    if (!canReview(req)) return fail(res, 403, "Only reviewers can review.");
    const approve = req.body.decision === "approve";
    if (!approve && req.body.decision !== "reject") return fail(res, 400, "Approve or reject.");
    const note = String(req.body.note ?? "").trim().slice(0, 200);
    const status = approve ? "approved" : "rejected";
    if (req.params.kind === "restaurants" || req.params.kind === "dishes") {
      const Model = req.params.kind === "restaurants" ? Restaurant : RestaurantDish;
      const record = id(req.params.id) && (await Model.findById(req.params.id));
      if (!record || record.status !== "pending") return fail(res, 404, "Nothing waiting with that id.");
      record.status = status;
      record.reviewNote = note;
      record.history.push({ at: new Date(), by: me(), changes: { status: ["pending", status] }, note: note || (approve ? "approved" : "not approved") });
      await record.save();
      if (req.params.kind === "restaurants") {
        // (The dishes its adder put on it come with it.)
        await RestaurantDish.updateMany(
          { $or: [{ restaurant: record._id }, ...(record.chain ? [{ chain: record.chain }] : [])], status: "pending", addedBy: record.addedBy },
          { $set: { status, reviewNote: note }, $push: { history: { at: new Date(), by: me(), changes: { status: ["pending", status] }, note: approve ? "approved with the restaurant" : "not approved, with the restaurant" } } },
        );
      }
      return res.json({ success: true, data: { status } });
    }
    if (req.params.kind === "requests") {
      const request = id(req.params.id) && (await ChangeRequest.findById(req.params.id));
      if (!request || request.status !== "pending") return fail(res, 404, "Nothing waiting with that id.");
      if (approve) {
        const record = await (request.kind === "restaurant" ? Restaurant : RestaurantDish).findById(request.item);
        if (!record) return fail(res, 404, "It's no longer there.");
        if (request.action === "remove") {
          apply(record, { isArchived: [false, true] }, request.by, `taken off the menu${request.note ? `: ${request.note}` : ""} (approved)`);
        } else {
          apply(record, differences(record, request.changes), request.by, `${request.note || "suggested"} (approved)`);
        }
        await record.save();
      }
      request.status = status;
      request.reviewedBy = me();
      request.reviewedAt = new Date();
      request.reviewNote = note;
      await request.save();
      return res.json({ success: true, data: { status } });
    }
    return fail(res, 404, "Review restaurants, dishes or requests.");
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// --- Dishes (by their own id) ----------------------------------------------

/**
 * PATCH /api/restaurants/dishes/:dishId — a change to a dish (name, section,
 * nutrition, source, fromLibrary): made at once by a reviewer, or by the one
 * who added it while it's still waiting; otherwise suggested (202).
 */
router.patch("/dishes/:dishId", async (req, res) => {
  try {
    const dish = id(req.params.dishId) && (await RestaurantDish.findById(req.params.dishId));
    if (!dish || dish.isArchived) return fail(res, 404, "Dish not found");
    if (typeof req.body.name === "string" && !req.body.name.trim()) return fail(res, 400, "A dish needs a name.");
    const changes = differences(dish, dishUpdate(req.body));
    if (!Object.keys(changes).length) return res.json({ success: true, data: dish });
    if (!canReview(req) && !ownPending(dish)) {
      return suggest(res, { kind: "dish", item: dish, restaurant: dish.restaurant ?? (await Restaurant.findOne({ chain: dish.chain }, "_id").lean())?._id ?? null, action: "edit", changes, note: req.body.note });
    }
    apply(dish, changes, me(), req.body.note);
    await dish.save();
    return res.json({ success: true, data: dish });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// DELETE /api/restaurants/dishes/:dishId — off the menu (kept, and meals that
// had it keep their copy): at once for a reviewer or one's own waiting dish,
// otherwise suggested (202).
router.delete("/dishes/:dishId", async (req, res) => {
  try {
    const dish = id(req.params.dishId) && (await RestaurantDish.findById(req.params.dishId));
    if (!dish || dish.isArchived) return fail(res, 404, "Dish not found");
    if (!canReview(req) && !ownPending(dish)) {
      return suggest(res, { kind: "dish", item: dish, restaurant: dish.restaurant ?? (await Restaurant.findOne({ chain: dish.chain }, "_id").lean())?._id ?? null, action: "remove", changes: {}, note: req.query.note ?? req.body?.note });
    }
    apply(dish, { isArchived: [false, true] }, me(), "taken off the menu");
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
 * its menu (its own dishes and its chain's, as one may see them), one's own
 * settings for it and each dish, one's suggestions still waiting, and its
 * last 20 changes.
 */
router.get("/:id", async (req, res) => {
  try {
    // (With who added it, and who made each change, by name — the public credit.)
    const read = (rid) => Restaurant.findOne({ _id: rid, ...visible() }).populate("chain", "name website").populate("addedBy", "name").populate("history.by", "name").lean();
    let restaurant = id(req.params.id) && (await read(req.params.id));
    for (let hops = 0; restaurant?.mergedInto && hops < 5; hops++) restaurant = await read(restaurant.mergedInto);
    if (!restaurant) return fail(res, 404, "Restaurant not found");
    const dishes = await RestaurantDish.find({ $and: [{ $or: [{ restaurant: restaurant._id }, ...(restaurant.chain ? [{ chain: restaurant.chain._id }] : [])] }, visible()], ...live }, "-history")
      .sort({ section: 1, name: 1 })
      .lean();
    const [mine, dishMine, suggestions] = await Promise.all([
      mineFor("restaurant", [restaurant._id]),
      mineFor("dish", dishes.map((d) => d._id)),
      ChangeRequest.find({ by: me(), status: "pending", item: { $in: [restaurant._id, ...dishes.map((d) => d._id)] } }).sort({ createdAt: -1 }).lean(),
    ]);
    return res.json({
      success: true,
      data: {
        ...restaurant,
        status: restaurant.status ?? "approved",
        history: (restaurant.history ?? []).slice(-20).reverse(),
        mine: mine.get(String(restaurant._id)) ?? { saved: false, notes: "" },
        dishes: dishes.map((d) => ({ ...d, status: d.status ?? "approved", mine: dishMine.get(String(d._id)) ?? { saved: false, notes: "", price: null, scores: [] } })),
        mySuggestions: suggestions,
        canReview: canReview(req),
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
 * pass ?force=true to add it anyway. Saved as one's own; waiting for review
 * unless one's a reviewer.
 */
router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    if (!name) return fail(res, 400, "A restaurant needs a name.");
    const location = point(req.body.location);
    if (req.query.force !== "true") {
      const sameName = await Restaurant.find({ name: new RegExp(`^\\s*${escapeRegex(normal(name)).replace(/ /g, "\\s+")}\\s*$`, "i"), ...live, ...visible() }).lean();
      const duplicates = sameName.filter((r) => !location || !r.location?.coordinates || distance(location.coordinates, r.location.coordinates) <= 300);
      if (duplicates.length) return res.status(409).json({ success: false, message: "This restaurant may already be in Orbit.", duplicates: await listed(duplicates) });
    }
    const chainName = String(req.body.chainName ?? "").trim();
    const chain = chainName ? await chainNamed(chainName) : null;
    const reviewer = canReview(req);
    const restaurant = await Restaurant.create({
      ...(await restaurantUpdate({ ...req.body, chainName: undefined })),
      name,
      location,
      chain: chain?._id ?? null,
      addedBy: me(),
      status: reviewer ? "approved" : "pending",
      history: [{ at: new Date(), by: me(), changes: {}, note: "added" }],
    });
    await setMine("restaurant", restaurant._id, { saved: true });
    return res.status(201).json({ success: true, pending: !reviewer, data: (await listed([restaurant.toObject()]))[0] });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

/**
 * PATCH /api/restaurants/:id — a change (name, cuisine, address, location
 * {lat,lng}, googlePlaceId, website, phone, chainName; `note` says why): made
 * at once by a reviewer, or by the one who added it while it's still
 * waiting; otherwise suggested (202 { pending, data: the suggestion }).
 */
router.patch("/:id", async (req, res) => {
  try {
    const restaurant = id(req.params.id) && (await Restaurant.findById(req.params.id));
    if (!restaurant || restaurant.isArchived) return fail(res, 404, "Restaurant not found");
    if (typeof req.body.name === "string" && !req.body.name.trim()) return fail(res, 400, "A restaurant needs a name.");
    const changes = differences(restaurant, await restaurantUpdate(req.body));
    if (!Object.keys(changes).length) return res.json({ success: true, data: (await listed([restaurant.toObject()]))[0] });
    if (!canReview(req) && !ownPending(restaurant)) return suggest(res, { kind: "restaurant", item: restaurant, restaurant: restaurant._id, action: "edit", changes, note: req.body.note });
    apply(restaurant, changes, me(), req.body.note);
    await restaurant.save();
    return res.json({ success: true, data: (await listed([restaurant.toObject()]))[0] });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

// DELETE /api/restaurants/:id — the admin archives it (?archive=true);
// anyone else takes it out of their own list.
router.delete("/:id", async (req, res) => {
  try {
    const restaurant = id(req.params.id) && (await Restaurant.findById(req.params.id));
    if (!restaurant) return fail(res, 404, "Restaurant not found");
    if (isAdmin() && req.query.archive === "true") {
      apply(restaurant, { isArchived: [false, true] }, me(), "archived");
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
 * fromLibrary? }: on its menu (its chain's, for a chain location). Usable and
 * loggable by the one who added it at once; waiting for review (unless
 * they're a reviewer) before anyone else sees it.
 */
router.post("/:id/dishes", async (req, res) => {
  try {
    const restaurant = id(req.params.id) && (await Restaurant.findOne({ _id: req.params.id, ...visible() }).lean());
    if (!restaurant || restaurant.isArchived) return fail(res, 404, "Restaurant not found");
    const name = String(req.body.name ?? "").trim();
    if (!name) return fail(res, 400, "A dish needs a name.");
    const reviewer = canReview(req);
    const dish = await RestaurantDish.create({
      ...(restaurant.chain ? { chain: restaurant.chain } : { restaurant: restaurant._id }),
      ...dishUpdate(req.body),
      name,
      source: req.body.source ?? "typed",
      addedBy: me(),
      status: reviewer ? "approved" : "pending",
      history: [{ at: new Date(), by: me(), changes: {}, note: "added" }],
    });
    return res.status(201).json({ success: true, pending: !reviewer, data: { ...dish.toObject(), history: undefined, mine: { saved: false, notes: "", price: null, scores: [] } } });
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
    apply(from, { mergedInto: [null, into._id] }, me(), `merged into ${into.name}`);
    await from.save();
    return res.json({ success: true, data: { mergedInto: into._id } });
  } catch (error) {
    return fail(res, 400, error.message);
  }
});

export default router;
