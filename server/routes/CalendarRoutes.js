import express from "express";

import CalendarEvent from "../models/CalendarEvent.js";
import EventCalendar from "../models/EventCalendar.js";

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

// --- Date-only math ("YYYY-MM-DD", in UTC so no timezone shifts a day) ---
function toDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toStr(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(s, n) {
  return toStr(new Date(toDate(s).getTime() + n * DAY_MS));
}
function daysBetween(a, b) {
  return Math.round((toDate(b) - toDate(a)) / DAY_MS);
}
// Same day-of-month `n` months on, clamped to the month's last day.
function addMonths(s, n, dayOfMonth) {
  const d = toDate(s);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(dayOfMonth, last));
  return toStr(first);
}

// The start dates of `event`'s occurrences whose span touches [from, to].
export function occurrenceDates(event, from, to) {
  const span = daysBetween(event.date, event.endDate);
  const touches = (start) => start <= to && addDays(start, span) >= from;
  const repeat = event.repeat;
  if (!repeat) return touches(event.date) ? [event.date] : [];

  const excluded = new Set(event.excludedDates ?? []);
  const until = repeat.until && repeat.until < to ? repeat.until : to;
  const interval = Math.max(1, repeat.interval ?? 1);

  // Weekly on chosen days (and the older "every weekday", which is just
  // weekly on Mon–Fri): walk week by week from the start date's week.
  if (repeat.frequency === "weekly" || repeat.frequency === "weekdays") {
    const days =
      repeat.frequency === "weekdays"
        ? [1, 2, 3, 4, 5]
        : [...new Set(repeat.weekdays?.length ? repeat.weekdays : [toDate(event.date).getUTCDay()])].sort();
    const firstWeek = addDays(event.date, -toDate(event.date).getUTCDay());
    const unit = 7 * (repeat.frequency === "weekdays" ? 1 : interval);
    const out = [];
    const gap = daysBetween(firstWeek, addDays(from, -span - 6));
    let week = gap > 0 ? addDays(firstWeek, Math.floor(gap / unit) * unit) : firstWeek;
    for (let guard = 0; week <= until && guard < 2000; guard++) {
      for (const d of days) {
        const start = addDays(week, d);
        if (start >= event.date && start <= until && !excluded.has(start) && touches(start)) out.push(start);
      }
      week = addDays(week, unit);
    }
    return out;
  }

  const dayOfMonth = toDate(event.date).getUTCDate();
  const out = [];

  // Jump close to the window first, so a years-old daily event doesn't walk
  // every day since it started.
  let start = event.date;
  let step = 0;
  const earliest = addDays(from, -span);
  if (repeat.frequency === "daily" || repeat.frequency === "weekly") {
    const unit = (repeat.frequency === "daily" ? 1 : 7) * interval;
    const gap = daysBetween(event.date, earliest);
    if (gap > 0) {
      step = Math.floor(gap / unit);
      start = addDays(event.date, step * unit);
    }
  }

  for (let guard = 0; start <= until && guard < 5000; guard++) {
    const weekday = toDate(start).getUTCDay();
    const skipWeekend = repeat.frequency === "weekdays" && (weekday === 0 || weekday === 6);
    if (!skipWeekend && !excluded.has(start) && touches(start)) out.push(start);

    step += 1;
    switch (repeat.frequency) {
      case "daily": start = addDays(event.date, step * interval); break;
      case "weekdays": start = addDays(start, 1); break;
      case "weekly": start = addDays(event.date, step * 7 * interval); break;
      case "monthly": start = addMonths(event.date, step * interval, dayOfMonth); break;
      case "yearly": start = addMonths(event.date, step * 12 * interval, dayOfMonth); break;
      default: start = addDays(until, 1);
    }
  }
  return out;
}

async function getDefaultCalendar() {
  const existing = await EventCalendar.findOne({ isDefault: true });
  if (existing) return existing;
  return EventCalendar.create({ name: "Calendar", color: "blue", isDefault: true, order: -1 });
}

// The Kitchen's calendar: meals, prep sessions and shopping trips in one.
// (It began as "Meals", with prep and shopping briefly in a calendar of
// their own; both are brought into this one the first time it's asked for.)
async function getMealsCalendar() {
  let calendar = await EventCalendar.findOne({ isMeals: true });
  if (!calendar) calendar = await EventCalendar.create({ name: "Kitchen", color: "orange", isMeals: true, isKitchen: true, order: 999 });
  if (!calendar.isKitchen) {
    calendar.isKitchen = true;
    if (calendar.name === "Meals") calendar.name = "Kitchen";
    await calendar.save();
  }
  const separate = await EventCalendar.find({ isKitchen: true, isMeals: { $ne: true } });
  for (const old of separate) {
    await CalendarEvent.updateMany({ calendar: old._id }, { $set: { calendar: calendar._id } });
    await old.deleteOne();
  }
  return calendar;
}

// The Gym's calendar: planned workouts. (Gym's colour is orange; the
// Kitchen's calendar, orange before the sections swapped colours, turns
// yellow — if it's still the colour it started with.)
async function getGymCalendar() {
  const existing = await EventCalendar.findOne({ isGym: true });
  if (existing) return existing;
  await EventCalendar.updateOne({ isMeals: true, color: "orange" }, { $set: { color: "yellow" } });
  return EventCalendar.create({ name: "Gym", color: "orange", isGym: true, order: 998 });
}

// An event's workout follows its calendar: kept in the Gym calendar,
// never set anywhere else.
async function withGymRules(fields) {
  if (fields.calendar === undefined) return fields;
  const calendar = await EventCalendar.findById(fields.calendar).select("isGym");
  if (calendar?.isGym) return fields;
  return { ...fields, gymWorkout: null };
}

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

// An event's meal type follows its calendar: required in Meals, never set
// anywhere else. Returns the fields to save.
// (A prep session or shopping trip is in the same calendar and isn't a meal.)
async function withMealRules(fields, fallbackSlot = null, fallbackKind = null) {
  const calendar = fields.calendar ? await EventCalendar.findById(fields.calendar).select("isMeals") : null;
  if (!calendar?.isMeals) return { ...fields, mealSlot: null, mealAuto: false, kitchenKind: null };
  // (An explicit null turns a session back into a meal.)
  const kitchenKind = fields.kitchenKind !== undefined ? fields.kitchenKind : fallbackKind;
  if (kitchenKind) return { ...fields, kitchenKind, mealSlot: null, mealAuto: false };
  const mealSlot = fields.mealSlot ?? fallbackSlot;
  if (!MEAL_SLOTS.includes(mealSlot)) throw new Error("Pick which meal this is (breakfast, lunch, dinner or snack).");
  if (fields.allDay) throw new Error("A meal needs a start and end time.");
  return { ...fields, mealSlot };
}

// --- Regular meal times ---

// { slot: [7 × ({ start, end } | null)] }, tidied; anything invalid = none.
function cleanMealTimes(input) {
  const out = {};
  for (const slot of MEAL_SLOTS) {
    out[slot] = Array.from({ length: 7 }, (_, day) => {
      const time = input?.[slot]?.[day];
      const start = Number(time?.start);
      const end = Number(time?.end);
      return time && start >= 0 && end <= 1440 && end > start ? { start, end } : null;
    });
  }
  return out;
}

const seriesKey = (start, end, weekdays) => `${start}-${end}:${[...weekdays].sort().join("")}`;

// Makes the repeating meal events match `times` from `today` on. A series
// that already matches is left alone; one that doesn't ends yesterday (so
// the past keeps the times it had) and a new one starts today. Days skipped
// or edited on their own stay skipped in the new series. With `until`, the
// series stop after that day (and none run at all once it's passed).
async function applyMealTimes(calendar, times, today, until = null) {
  const over = !!until && until < today;
  for (const slot of MEAL_SLOTS) {
    // The series wanted: one per distinct time, on the days that share it.
    const wanted = new Map();
    times[slot].forEach((time, day) => {
      if (!time || over) return;
      const key = `${time.start}-${time.end}`;
      wanted.set(key, { ...time, weekdays: [...(wanted.get(key)?.weekdays ?? []), day] });
    });
    const wantedKeys = new Set([...wanted.values()].map((w) => seriesKey(w.start, w.end, w.weekdays)));

    const active = await CalendarEvent.find({
      calendar: calendar._id,
      mealAuto: true,
      mealSlot: slot,
      repeat: { $ne: null },
      $or: [{ "repeat.until": null }, { "repeat.until": { $gte: today } }],
    });
    const kept = new Set();
    const carried = new Set();
    for (const series of active) {
      const key = seriesKey(series.startMinutes, series.endMinutes, series.repeat.weekdays ?? []);
      // The same times on the same days: it stays, running to the end
      // that's now wanted.
      if (wantedKeys.has(key) && !kept.has(key)) {
        kept.add(key);
        if ((series.repeat.until ?? null) !== until) {
          series.repeat.until = until;
          await series.save();
        }
        continue;
      }
      for (const d of series.excludedDates ?? []) if (d >= today) carried.add(d);
      if (series.date >= today) {
        // Never happened yet: remove it, keeping any days edited on their own.
        await CalendarEvent.updateMany({ seriesId: series._id }, { $set: { seriesId: null } });
        await series.deleteOne();
      } else {
        series.repeat.until = addDays(today, -1);
        series.excludedDates = (series.excludedDates ?? []).filter((d) => d < today);
        await series.save();
      }
    }

    for (const want of wanted.values()) {
      if (kept.has(seriesKey(want.start, want.end, want.weekdays))) continue;
      // Its first day: today, or the next day it falls on.
      let first = today;
      while (!want.weekdays.includes(toDate(first).getUTCDay())) first = addDays(first, 1);
      // (Its days don't come round again before the end.)
      if (until && first > until) continue;
      await CalendarEvent.create({
        title: MEAL_LABELS[slot],
        calendar: calendar._id,
        date: first,
        endDate: first,
        startMinutes: want.start,
        endMinutes: want.end,
        repeat: { frequency: "weekly", interval: 1, weekdays: want.weekdays, until },
        excludedDates: [...carried].filter((d) => want.weekdays.includes(toDate(d).getUTCDay())),
        remindMinutes: null,
        mealSlot: slot,
        mealAuto: true,
      });
    }
  }
}

function fail(res, error, status = 400) {
  return res.status(status).json({ success: false, message: error?.message ?? String(error) });
}

// --- Calendars ---

router.get("/calendars", async (req, res) => {
  try {
    await getDefaultCalendar();
    if (!(await EventCalendar.exists({ isTasks: true }))) {
      await EventCalendar.create({ name: "Tasks", color: "indigo", isTasks: true, order: 1000 });
    }
    await getMealsCalendar();
    await getGymCalendar();
    const calendars = await EventCalendar.find().sort({ order: 1, createdAt: 1 });
    return res.json({ success: true, data: calendars });
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.post("/calendars", async (req, res) => {
  try {
    const count = await EventCalendar.countDocuments();
    const calendar = await EventCalendar.create({
      name: req.body.name,
      color: req.body.color ?? "blue",
      order: count,
    });
    return res.status(201).json({ success: true, data: calendar });
  } catch (error) {
    return fail(res, error);
  }
});

// PATCH /calendars/reorder  { ids } — the calendars in their new order.
router.patch("/calendars/reorder", async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    await Promise.all(ids.map((id, order) => EventCalendar.updateOne({ _id: id }, { $set: { order } })));
    const calendars = await EventCalendar.find().sort({ order: 1, createdAt: 1 });
    return res.json({ success: true, data: calendars });
  } catch (error) {
    return fail(res, error);
  }
});

router.patch("/calendars/:id", async (req, res) => {
  try {
    const { name, color, visible, order } = req.body;
    const hiddenKinds = Array.isArray(req.body.hiddenKinds) ? req.body.hiddenKinds.map(String) : undefined;
    const update = Object.fromEntries(
      Object.entries({ name, color, visible, order, hiddenKinds }).filter(([, v]) => v !== undefined),
    );
    const calendar = await EventCalendar.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!calendar) return fail(res, "Calendar not found", 404);
    return res.json({ success: true, data: calendar });
  } catch (error) {
    return fail(res, error);
  }
});

// Deleting a calendar deletes its events too (the app confirms first).
router.delete("/calendars/:id", async (req, res) => {
  try {
    const calendar = await EventCalendar.findById(req.params.id);
    if (!calendar) return fail(res, "Calendar not found", 404);
    if (calendar.isDefault) return fail(res, "The default calendar can't be deleted");
    if (calendar.isTasks) return fail(res, "The Tasks calendar can't be deleted — hide it instead");
    if (calendar.isMeals || calendar.isKitchen) return fail(res, "The Kitchen calendar can't be deleted — hide it instead");
    if (calendar.isGym) return fail(res, "The Gym calendar can't be deleted — hide it instead");
    await CalendarEvent.deleteMany({ calendar: calendar._id });
    await calendar.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    return fail(res, error);
  }
});

// GET /meal-times — the Kitchen calendar's regular meal times.
router.get("/meal-times", async (req, res) => {
  try {
    const calendar = await getMealsCalendar();
    return res.json({ success: true, data: cleanMealTimes(calendar.mealTimes) });
  } catch (error) {
    return fail(res, error, 500);
  }
});

// GET /meal-times/until — the last day they run to, or null.
router.get("/meal-times/until", async (req, res) => {
  try {
    return res.json({ success: true, data: (await getMealsCalendar()).mealTimesUntil ?? null });
  } catch (error) {
    return fail(res, error, 500);
  }
});

// PUT /meal-times  { mealTimes, today, until? } — saves them and brings the
// repeating meal events into line from `today` on. `until` (a date, or null
// for no end) is left as it was when not sent.
router.put("/meal-times", async (req, res) => {
  try {
    const { today } = req.body;
    if (!DATE_RE.test(today ?? "")) return fail(res, "today must be a YYYY-MM-DD date");
    const calendar = await getMealsCalendar();
    const times = cleanMealTimes(req.body.mealTimes);
    const until = req.body.until === undefined ? (calendar.mealTimesUntil ?? null) : req.body.until || null;
    if (until && !DATE_RE.test(until)) return fail(res, "until must be a YYYY-MM-DD date");
    await applyMealTimes(calendar, times, today, until);
    calendar.mealTimesUntil = until;
    calendar.mealTimes = times;
    calendar.markModified("mealTimes");
    await calendar.save();
    return res.json({ success: true, data: times });
  } catch (error) {
    return fail(res, error);
  }
});

// --- Events ---

// GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD — every occurrence touching
// the range, repeats expanded: each item is the event plus `occurrenceDate`
// / `occurrenceEndDate` for that occurrence.
router.get("/events", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from ?? "") || !DATE_RE.test(to ?? "")) {
      return fail(res, "from and to must be YYYY-MM-DD dates");
    }
    const events = await CalendarEvent.find({
      date: { $lte: to },
      $or: [{ repeat: { $ne: null } }, { endDate: { $gte: from } }],
    }).lean();

    const occurrences = [];
    for (const event of events) {
      const span = daysBetween(event.date, event.endDate);
      for (const date of occurrenceDates(event, from, to)) {
        occurrences.push({ ...event, occurrenceDate: date, occurrenceEndDate: addDays(date, span) });
      }
    }
    occurrences.sort(
      (a, b) =>
        a.occurrenceDate.localeCompare(b.occurrenceDate) ||
        Number(b.allDay) - Number(a.allDay) ||
        a.startMinutes - b.startMinutes,
    );
    return res.json({ success: true, data: occurrences });
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.get("/events/:id", async (req, res) => {
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return fail(res, "Event not found", 404);
    return res.json({ success: true, data: event });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/events", async (req, res) => {
  try {
    const calendar = req.body.calendar || (await getDefaultCalendar())._id;
    const event = await CalendarEvent.create(
      await withGymRules(
        await withMealRules({
          ...eventFields(req.body),
          calendar,
          endDate: req.body.endDate || req.body.date,
        }),
      ),
    );
    return res.status(201).json({ success: true, data: event });
  } catch (error) {
    return fail(res, error);
  }
});

router.patch("/events/:id", async (req, res) => {
  try {
    const { _id, createdAt, updatedAt, mealAuto, ...fields } = req.body;
    const current = await CalendarEvent.findById(req.params.id);
    if (!current) return fail(res, "Event not found", 404);
    // A regular meal's series is changed through the Kitchen calendar's meal times.
    if (current.mealAuto && current.repeat) {
      return fail(res, "This is a regular meal time. Change it in the Kitchen calendar's meal times, or edit just one day.");
    }
    const ruled = await withMealRules(
      { ...fields, calendar: fields.calendar ?? current.calendar, allDay: fields.allDay ?? current.allDay },
      current.mealSlot,
      current.kitchenKind,
    );
    const event = await CalendarEvent.findByIdAndUpdate(req.params.id, await withGymRules(ruled), { new: true, runValidators: true });
    return res.json({ success: true, data: event });
  } catch (error) {
    return fail(res, error);
  }
});

// Fields a client may set on an event (never ids or bookkeeping).
function eventFields(body) {
  const { _id, createdAt, updatedAt, __v, seriesId, originalDate, excludedDates, mealAuto, gymDone, gymSkipped, ...fields } = body ?? {};
  return fields;
}

// --- Planned workouts ---

// POST /events/:id/gym-status  { date, status: "done" | "skipped" | "open", session? }
// A planned workout, on one of its days: done (with the session, if
// there's one), skipped, or back to not yet.
router.post("/events/:id/gym-status", async (req, res) => {
  try {
    const { date, status, session } = req.body ?? {};
    if (!DATE_RE.test(date ?? "")) return fail(res, "date must be a YYYY-MM-DD date");
    if (!["done", "skipped", "open"].includes(status)) return fail(res, "status must be done, skipped or open");
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return fail(res, "Event not found", 404);
    event.gymDone = event.gymDone.filter((d) => d.date !== date);
    event.gymSkipped = event.gymSkipped.filter((d) => d !== date);
    if (status === "done") event.gymDone.push({ date, session: session || null });
    if (status === "skipped") event.gymSkipped.push(date);
    await event.save();
    return res.json({ success: true, data: event });
  } catch (error) {
    return fail(res, error);
  }
});

// POST /gym/link  { date, session, workout?, event? }
// A finished Gym session, on its day: marks that day's planned workout done
// with it — the event it was started from, if given; else the one for the
// same routine; else the first not yet done. Nothing planned: nothing.
router.post("/gym/link", async (req, res) => {
  try {
    const { date, session, workout, event: eventId } = req.body ?? {};
    if (!DATE_RE.test(date ?? "") || !session) return fail(res, "date and session are needed");
    const calendar = await getGymCalendar();
    const events = (await CalendarEvent.find({ calendar: calendar._id, date: { $lte: date }, $or: [{ repeat: { $ne: null } }, { endDate: { $gte: date } }] })).filter((e) => occurrenceDates(e.toObject(), date, date).includes(date));
    const open = events.filter((e) => !e.gymDone.some((d) => d.date === date) && !e.gymSkipped.includes(date));
    const target =
      (eventId && events.find((e) => String(e._id) === String(eventId))) ||
      (workout && open.find((e) => String(e.gymWorkout) === String(workout))) ||
      open[0];
    if (!target) return res.json({ success: true, data: null });
    target.gymDone = target.gymDone.filter((d) => d.date !== date);
    target.gymSkipped = target.gymSkipped.filter((d) => d !== date);
    target.gymDone.push({ date, session });
    await target.save();
    return res.json({ success: true, data: target });
  } catch (error) {
    return fail(res, error);
  }
});

// POST /events/:id/detach  { occurrence, ...event fields }
// "Only this event": the series skips that date, and the edited occurrence
// becomes its own one-off event (remembering which series and date).
router.post("/events/:id/detach", async (req, res) => {
  try {
    const { occurrence } = req.body;
    if (!DATE_RE.test(occurrence ?? "")) return fail(res, "occurrence must be a YYYY-MM-DD date");
    const series = await CalendarEvent.findById(req.params.id);
    if (!series) return fail(res, "Event not found", 404);
    const fields = eventFields(req.body);
    delete fields.occurrence;
    const single = await CalendarEvent.create({
      ...(await withMealRules({ calendar: series.calendar, ...fields }, series.mealSlot, series.kitchenKind)),
      endDate: fields.endDate || fields.date,
      repeat: null,
      seriesId: series._id,
      originalDate: occurrence,
    });
    await CalendarEvent.updateOne({ _id: series._id }, { $addToSet: { excludedDates: occurrence } });
    return res.status(201).json({ success: true, data: single });
  } catch (error) {
    return fail(res, error);
  }
});

// POST /events/:id/split  { occurrence, ...event fields }
// "This and following events": the series ends the day before `occurrence`,
// and a new series with the edited details starts from it. Splitting at
// the very first occurrence just edits the whole series.
router.post("/events/:id/split", async (req, res) => {
  try {
    const { occurrence } = req.body;
    if (!DATE_RE.test(occurrence ?? "")) return fail(res, "occurrence must be a YYYY-MM-DD date");
    const series = await CalendarEvent.findById(req.params.id);
    if (!series) return fail(res, "Event not found", 404);
    if (series.mealAuto) return fail(res, "This is a regular meal time. Change it in the Kitchen calendar's meal times.");
    const fields = await withMealRules({ calendar: series.calendar, ...eventFields(req.body) }, series.mealSlot, series.kitchenKind);
    delete fields.occurrence;

    if (occurrence <= series.date) {
      const updated = await CalendarEvent.findByIdAndUpdate(series._id, fields, { new: true, runValidators: true });
      return res.json({ success: true, data: updated });
    }

    const following = await CalendarEvent.create({
      ...fields,
      endDate: fields.endDate || fields.date,
      // Skipped dates from here on belong to the new series.
      excludedDates: (series.excludedDates ?? []).filter((d) => d >= occurrence),
    });
    series.repeat.until = addDays(occurrence, -1);
    series.excludedDates = (series.excludedDates ?? []).filter((d) => d < occurrence);
    await series.save();
    return res.status(201).json({ success: true, data: following });
  } catch (error) {
    return fail(res, error);
  }
});

// DELETE /events/:id — the whole event (every occurrence), or with
// ?occurrence=YYYY-MM-DD just that one occurrence of a repeating event.
router.delete("/events/:id", async (req, res) => {
  try {
    const { occurrence } = req.query;
    if (occurrence) {
      if (!DATE_RE.test(occurrence)) return fail(res, "occurrence must be a YYYY-MM-DD date");
      const event = await CalendarEvent.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { excludedDates: occurrence } },
        { new: true },
      );
      if (!event) return fail(res, "Event not found", 404);
      return res.json({ success: true, data: event });
    }
    const target = await CalendarEvent.findById(req.params.id).select("mealAuto repeat");
    if (target?.mealAuto && target.repeat) {
      return fail(res, "This is a regular meal time. Turn it off in the Kitchen calendar's meal times, or delete just one day.");
    }
    // ?from=YYYY-MM-DD: "this and following" — end the series the day
    // before (or delete it, if that's its first occurrence).
    const { from } = req.query;
    if (from) {
      if (!DATE_RE.test(from)) return fail(res, "from must be a YYYY-MM-DD date");
      const series = await CalendarEvent.findById(req.params.id);
      if (!series) return fail(res, "Event not found", 404);
      if (series.repeat && from > series.date) {
        series.repeat.until = addDays(from, -1);
        await series.save();
        return res.json({ success: true, data: series });
      }
    }
    const event = await CalendarEvent.findByIdAndDelete(req.params.id);
    if (!event) return fail(res, "Event not found", 404);
    // Occurrences that were split off this series go with it.
    await CalendarEvent.deleteMany({ seriesId: event._id });
    return res.json({ success: true });
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
