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
    // The same calendar is the Kitchen's whole calendar (so isKitchen is set
    // with isMeals): meals, and when you prep and when you shop. What a
    // session is for is worked out from the meal plan, not kept here.
    isKitchen: { type: Boolean, default: false },
    // The kinds of thing in a calendar that are switched off while the rest
    // still shows — the Kitchen's "meals", "prep" and "shop".
    hiddenKinds: { type: [String], default: [] },
    // Meals calendar only — the regular time of each meal on each day of the
    // week: { breakfast: [Sunday … Saturday], lunch: […], … }, each day
    // either { start, end } (minutes after midnight) or null for none. The
    // repeating meal events are generated from this.
    mealTimes: { type: mongoose.Schema.Types.Mixed, default: null },
    // The last day the regular meal times run to ("YYYY-MM-DD"), or null
    // for no end.
    mealTimesUntil: { type: String, default: null },
  },
  { timestamps: true },
);

const EventCalendar = mongoose.model("EventCalendar", eventCalendarSchema);
export default EventCalendar;
