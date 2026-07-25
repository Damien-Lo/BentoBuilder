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
  },
  { timestamps: true },
);

const UserProfile = mongoose.model("UserProfile", userProfileSchema);
export default UserProfile;
