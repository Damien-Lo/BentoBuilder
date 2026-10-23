import mongoose from "mongoose";
import { ownedByUser } from "../services/ownership.js";
import { createExtendedNutrientGoalsSchema } from "./nutritionSchema.js";

const userProfileSchema = new mongoose.Schema(
  {
    displayName:       { type: String,  trim: true, default: "" },
    dailyCalorieLimit: { type: Number,  default: null },
    dailyProteinLimit: { type: Number,  default: null },
    dailyCarbsLimit:   { type: Number,  default: null },
    dailyFatsLimit:    { type: Number,  default: null },
    dailyFiberLimit:   { type: Number,  default: null },
    dailySodiumLimit:  { type: Number,  default: null },
    // Goals for the background-tracked nutrients (sugar, fat breakdown,
    // cholesterol, potassium, vitamins, minerals) — edited from the
    // Nutrition tab's "All Nutrients" screen.
    extendedNutrientGoals: {
      type: createExtendedNutrientGoalsSchema(),
      default: () => ({}),
    },
    // When the planner auto-asks "How was it?" (see the app's
    // utils/ratingPrompt.ts): wait this many days after the last rating,
    // this many once the last few ratings agree, and this many after
    // repeated skips.
    ratingCooldownDays:        { type: Number, min: 1, default: 10 },
    ratingSettledCooldownDays: { type: Number, min: 1, default: 30 },
    ratingSkipBackoffDays:     { type: Number, min: 1, default: 60 },
    // 0 = Sunday … 6 = Saturday, matching JS Date#getDay()
    weekStartDay:      { type: Number,  min: 0, max: 6, default: 1 },

    // Weight goal tracking — a single starting point and a target, not a
    // full log (there's no history of intermediate weigh-ins yet).
    startingWeight:     { type: Number, default: null },
    startingWeightDate: { type: String, default: null }, // YYYY-MM-DD
    goalWeight:         { type: Number, default: null },

    // About you (Health → About you): what your health numbers are worked
    // out from — BMI, the calories you burn, a calorie and protein target.
    // Height in cm (shown in feet and inches); born YYYY-MM-DD.
    sex:           { type: String, enum: ["male", "female", null], default: null },
    birthDate:     { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    heightCm:      { type: Number, min: 50, max: 272, default: null },
    activityLevel: { type: String, enum: ["sedentary", "light", "moderate", "active", "very", null], default: null },
    // How each Health page shows its measurements — { weight: "metric",
    // activity: "imperial", … }: pounds, inches, miles, fl oz, °F (imperial,
    // the default) or kilograms, cm, km, mL, °C. Stored the same either way:
    // the app converts.
    unitPrefs: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    // Health → Targets: how fast to move toward the goal weight (kg a week,
    // losing and gaining each), and your own targets beyond the daily
    // nutrition goals above — { losePace, gainPace, water (mL), steps,
    // exercise (min a week), workouts (a week), sleep (min) }. Unset: the
    // suggestion.
    targets: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    // User-defined unit conversions on top of the app's built-in mass/volume
    // table, e.g. { unit: "packet", baseUnit: "g", factor: 340 } means
    // 1 packet = 340 g.
    unitConversions: {
      type: [
        {
          unit: { type: String, required: true, trim: true },
          baseUnit: { type: String, required: true, trim: true },
          factor: { type: Number, required: true, min: 0 },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// (Personal: each record belongs to an account — see services/ownership.js.)
userProfileSchema.plugin(ownedByUser);

const UserProfile = mongoose.model("UserProfile", userProfileSchema);
export default UserProfile;
