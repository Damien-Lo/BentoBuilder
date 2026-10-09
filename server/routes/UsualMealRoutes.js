import express from "express";

import MealPlanEntry from "../models/MealPlanEntry.js";
import UsualMeal from "../models/UsualMeal.js";
import { addDays, removePlannedFrom, syncUsualMeals, todayFrom, usualItemFields } from "../services/usualMeals.js";

const router = express.Router();

const fail = (res, error, status = 400) =>
  res.status(status).json({ success: false, message: error?.message ?? String(error) });

const populated = (query) =>
  query
    .populate("meal", "name")
    .populate("recipe", "name")
    .populate("ingredient", "name")
    .populate("restaurantMeal", "restaurantName dishes._id dishes.name");

const cleanDays = (days) => [...new Set((Array.isArray(days) ? days : []).map(Number))].filter((d) => d >= 0 && d <= 6).sort();

/**
 * GET /api/usual-meals — every usual that hasn't ended, with its food's name.
 */
router.get("/", async (req, res) => {
  try {
    const today = todayFrom(req.query.today);
    const usuals = await populated(
      UsualMeal.find({ $or: [{ endDate: null }, { endDate: { $gte: today } }] }).sort({ createdAt: 1 }),
    );
    return res.json({ success: true, data: usuals });
  } catch (error) {
    return fail(res, error, 500);
  }
});

/**
 * POST /api/usual-meals/from-entry/:entryId  { weekdays, today }
 * "Have this every Monday": makes a usual out of a planner entry. That entry
 * becomes the usual's own for its day, so the day isn't filled in twice.
 */
router.post("/from-entry/:entryId", async (req, res) => {
  try {
    const today = todayFrom(req.body.today);
    const entry = await MealPlanEntry.findById(req.params.entryId);
    if (!entry || entry.isArchived) return fail(res, "That food is no longer in the planner", 404);
    if (entry.usual) return fail(res, "This is already one of your usual meals");
    const usual = await UsualMeal.create({
      slot: entry.slot,
      weekdays: cleanDays(req.body.weekdays),
      ...usualItemFields(entry),
      // From the entry's own day if that's still to come, else from today.
      startDate: entry.date > today ? entry.date : today,
    });
    entry.usual = usual._id;
    await entry.save();
    await syncUsualMeals(today);
    return res.status(201).json({ success: true, data: await populated(UsualMeal.findById(usual._id)) });
  } catch (error) {
    return fail(res, error);
  }
});

/**
 * PATCH /api/usual-meals/:id  { active?, weekdays?, today }
 * Switch it off or on, or change which days it's on. Planned entries on
 * days it no longer covers are cleared; confirmed ones are never touched.
 */
router.patch("/:id", async (req, res) => {
  try {
    const today = todayFrom(req.body.today);
    const usual = await UsualMeal.findById(req.params.id);
    if (!usual) return fail(res, "Usual meal not found", 404);
    if (req.body.weekdays !== undefined) usual.weekdays = cleanDays(req.body.weekdays);
    if (req.body.active !== undefined) usual.active = !!req.body.active;
    await usual.save();

    if (!usual.active) {
      await removePlannedFrom(usual._id, today);
    } else {
      const upcoming = await MealPlanEntry.find({ usual: usual._id, status: "planned", date: { $gte: today } }).select("date");
      const stale = upcoming.filter((e) => !usual.weekdays.includes(new Date(`${e.date}T00:00:00Z`).getUTCDay()));
      if (stale.length > 0) await MealPlanEntry.deleteMany({ _id: { $in: stale.map((e) => e._id) } });
      await syncUsualMeals(today);
    }
    return res.json({ success: true, data: await populated(UsualMeal.findById(usual._id)) });
  } catch (error) {
    return fail(res, error);
  }
});

/**
 * DELETE /api/usual-meals/:id?from=YYYY-MM-DD
 * Stops it from `from` on (default: today): that day and every later one
 * are cleared of its planned entries. Anything already eaten stays.
 */
router.delete("/:id", async (req, res) => {
  try {
    const from = todayFrom(req.query.from);
    const usual = await UsualMeal.findById(req.params.id);
    if (!usual) return fail(res, "Usual meal not found", 404);
    await removePlannedFrom(usual._id, from);
    usual.endDate = addDays(from, -1);
    usual.active = false;
    await usual.save();
    return res.json({ success: true });
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
