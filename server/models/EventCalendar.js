import mongoose from "mongoose";

// One of the user's calendars (like Outlook's "Personal", "Dining", "Gym"):
// a coloured group of events that can be shown or hidden as a whole.
const eventCalendarSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Calendar name is required"], trim: true },
    // Colour key — the same palette as to-do lists (mobile TODO_LIST_COLORS).
    color: { type: String, trim: true, default: "blue" },
    // Hidden calendars' events aren't drawn (the drawer's checkmarks).
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // The built-in "Calendar": created on first use, can't be deleted.
    isDefault: { type: Boolean, default: false },
    // The built-in "Tasks" calendar: holds no events of its own — the app
    // fills it with the tasks and subtasks switched on for the calendar.
    // Created on first use, can't be deleted.
    isTasks: { type: Boolean, default: false },
    // The built-in "Meals" calendar: every event in it has a meal type and
    // shows that day's food from the Kitchen planner. Created on first use,
    // can't be deleted.
    isMeals: { type: Boolean, default: false },
    // Meals calendar only — the regular time of each meal on each day of the
    // week: { breakfast: [Sunday … Saturday], lunch: […], … }, each day
    // either { start, end } (minutes after midnight) or null for none. The
    // repeating meal events are generated from this.
    mealTimes: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

const EventCalendar = mongoose.model("EventCalendar", eventCalendarSchema);
export default EventCalendar;
