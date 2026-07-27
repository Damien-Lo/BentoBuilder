import mongoose from "mongoose";

const userProfileSchema = new mongoose.Schema(
  {
    displayName:       { type: String,  trim: true, default: "" },
    dailyCalorieLimit: { type: Number,  default: null },
    dailyProteinLimit: { type: Number,  default: null },
    dailyCarbsLimit:   { type: Number,  default: null },
    dailyFatsLimit:    { type: Number,  default: null },
    dailyFiberLimit:   { type: Number,  default: null },
    dailySodiumLimit:  { type: Number,  default: null },
    // 0 = Sunday … 6 = Saturday, matching JS Date#getDay()
    weekStartDay:      { type: Number,  min: 0, max: 6, default: 1 },

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

const UserProfile = mongoose.model("UserProfile", userProfileSchema);
export default UserProfile;
