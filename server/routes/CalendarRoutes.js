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

function fail(res, error, status = 400) {
  return res.status(status).json({ success: false, message: error?.message ?? String(error) });
}

// --- Calendars ---

router.get("/calendars", async (req, res) => {
  try {
    await getDefaultCalendar();
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

router.patch("/calendars/:id", async (req, res) => {
  try {
    const { name, color, visible, order } = req.body;
    const update = Object.fromEntries(
      Object.entries({ name, color, visible, order }).filter(([, v]) => v !== undefined),
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
    await CalendarEvent.deleteMany({ calendar: calendar._id });
    await calendar.deleteOne();
    return res.json({ success: true });
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
    const event = await CalendarEvent.create({
      ...req.body,
      calendar,
      endDate: req.body.endDate || req.body.date,
    });
    return res.status(201).json({ success: true, data: event });
  } catch (error) {
    return fail(res, error);
  }
});

router.patch("/events/:id", async (req, res) => {
  try {
    const { _id, createdAt, updatedAt, ...fields } = req.body;
    const event = await CalendarEvent.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
    if (!event) return fail(res, "Event not found", 404);
    return res.json({ success: true, data: event });
  } catch (error) {
    return fail(res, error);
  }
});

// Fields a client may set on an event (never ids or bookkeeping).
function eventFields(body) {
  const { _id, createdAt, updatedAt, __v, seriesId, originalDate, excludedDates, ...fields } = body ?? {};
  return fields;
}

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
      calendar: series.calendar,
      ...fields,
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
    const fields = eventFields(req.body);
    delete fields.occurrence;

    if (occurrence <= series.date) {
      const updated = await CalendarEvent.findByIdAndUpdate(series._id, fields, { new: true, runValidators: true });
      return res.json({ success: true, data: updated });
    }

    const following = await CalendarEvent.create({
      calendar: series.calendar,
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
