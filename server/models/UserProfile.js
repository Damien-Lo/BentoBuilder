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
  },
  { timestamps: true },
);

const UserProfile = mongoose.model("UserProfile", userProfileSchema);
export default UserProfile;
