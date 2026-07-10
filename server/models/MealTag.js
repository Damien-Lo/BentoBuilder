import mongoose from "mongoose";

const mealTagSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true },
);

mealTagSchema.index({ normalizedName: 1 }, { unique: true });

const MealTag = mongoose.model("MealTag", mealTagSchema);
export default MealTag;
