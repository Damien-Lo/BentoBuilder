import mongoose from "mongoose";

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
    // Occurrences of a repeating event that were deleted on their own.
    excludedDates: [{ type: String, match: DATE_RE }],
    location: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    // Minutes before the start to remind, or null for no reminder.
    remindMinutes: { type: Number, min: 0, default: 15 },
  },
  { timestamps: true },
);

calendarEventSchema.index({ date: 1 });

const CalendarEvent = mongoose.model("CalendarEvent", calendarEventSchema);
export default CalendarEvent;
