import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const repeatSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      enum: ["daily", "weekdays", "weekly", "monthly", "yearly"],
      required: true,
    },
    interval: { type: Number, min: 1, default: 1 },
    // Weekly only: which days of the week (0 = Sunday … 6 = Saturday).
    // Empty = the start date's own weekday.
    weekdays: [{ type: Number, min: 0, max: 6 }],
    // Last date an occurrence can start on ("YYYY-MM-DD"), or null = forever.
    until: { type: String, match: DATE_RE, default: null },
  },
  { _id: false },
);

// A calendar event. Times are wall-clock (a date plus minutes after
// midnight) rather than instants, so "every Thursday 07:15" stays 07:15
// across daylight-saving changes.
const calendarEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Event title is required"], trim: true },
    calendar: { type: mongoose.Schema.Types.ObjectId, ref: "EventCalendar", required: true },
    allDay: { type: Boolean, default: false },
    // First day, and last day (same as `date` unless it runs past midnight
    // or spans several all-day days).
    date: { type: String, required: true, match: DATE_RE },
    endDate: { type: String, required: true, match: DATE_RE },
    // Minutes after midnight; ignored for all-day events.
    startMinutes: { type: Number, min: 0, max: 1440, default: 540 },
    endMinutes: { type: Number, min: 0, max: 1440, default: 600 },
    repeat: { type: repeatSchema, default: null },
    // Occurrences of a repeating event that were deleted on their own, or
    // edited on their own (then saved as separate events, below).
    excludedDates: [{ type: String, match: DATE_RE }],
    // Set on an occurrence that was edited on its own and split off its
    // series ("only this event"): the series, and which of its dates this
    // replaced. Deleting the series deletes these too.
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: "CalendarEvent", default: null },
    originalDate: { type: String, match: DATE_RE, default: null },
    location: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    // Minutes before the start to remind, or null for no reminder.
    remindMinutes: { type: Number, min: 0, default: 15 },
    // Events in the Meals calendar: which planner slot's food this shows.
    mealSlot: { type: String, enum: ["breakfast", "lunch", "dinner", "snack", null], default: null },
    // A repeating meal generated from the Meals calendar's regular times
    // (changed there, not by editing the series).
    mealAuto: { type: Boolean, default: false },
    // Events in the Kitchen calendar: a meal-prep session or a shopping trip.
    kitchenKind: { type: String, enum: ["prep", "shop", null], default: null },
    // Events in the Gym calendar: a planned workout — the routine to do (a
    // Gym workout; none for "a workout"), and, day by day (a repeating one
    // has many), whether it was done (and the session that did it, if
    // there's one) or skipped. A date in neither: not yet, or missed.
    gymWorkout: { type: mongoose.Schema.Types.ObjectId, ref: "GymWorkout", default: null },
    // What's planned across the series (in place of one `gymWorkout`), like
    // a meal time's usual food: the same each time ("same": workouts[0]),
    // one for each weekday ("weekday": byWeekday["0"…"6"], 0 = Sunday), or
    // in turn ("rotation": workouts in order, an occurrence each). A day's
    // own (gymPlanned) comes first.
    gymPlan: {
      type: new mongoose.Schema(
        {
          mode: { type: String, enum: ["same", "weekday", "rotation"], default: "same" },
          workouts: [{ type: mongoose.Schema.Types.ObjectId, ref: "GymWorkout" }],
          byWeekday: { type: mongoose.Schema.Types.Mixed, default: {} },
        },
        { _id: false },
      ),
      default: null,
    },
    // A day planned differently from the series (its workout, or none: a
    // day off from it).
    gymPlanned: {
      type: [
        new mongoose.Schema(
          {
            date: { type: String, required: true, match: DATE_RE },
            workout: { type: mongoose.Schema.Types.ObjectId, ref: "GymWorkout", default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    gymDone: {
      type: [
        new mongoose.Schema(
          {
            date: { type: String, required: true, match: DATE_RE },
            session: { type: mongoose.Schema.Types.ObjectId, ref: "GymSession", default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    gymSkipped: [{ type: String, match: DATE_RE }],
  },
  { timestamps: true },
);

calendarEventSchema.index({ date: 1 });

// (Personal: each record belongs to an account — see services/ownership.js.)
calendarEventSchema.plugin(ownedByUser);

const CalendarEvent = mongoose.model("CalendarEvent", calendarEventSchema);
export default CalendarEvent;
