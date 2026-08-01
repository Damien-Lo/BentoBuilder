import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    label:   { type: String, trim: true, default: "Course" },
    recipe:  { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", default: null },
    servings: { type: Number, min: 0.5, default: 1 },
  },
  { _id: true },
);

const bentoSectionSchema = new mongoose.Schema(
  {
    row:     { type: Number, required: true },
    col:     { type: Number, required: true },
    rowSpan: { type: Number, min: 1, default: 1 },
    colSpan: { type: Number, min: 1, default: 1 },
    recipe:  { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", default: null },
    label:   { type: String, trim: true, default: "" },
    color:   { type: String, trim: true, default: "" },
  },
  { _id: true },
);

const bentoLayoutSchema = new mongoose.Schema(
  {
    rows:     { type: Number, min: 1, default: 2 },
    cols:     { type: Number, min: 1, default: 2 },
    sections: [bentoSectionSchema],
  },
  { _id: false },
);

const mealSchema = new mongoose.Schema(
  {
    name:  { type: String, required: [true, "Meal name is required"], trim: true },
    type:  { type: String, enum: ["course", "bento"], required: [true, "Meal type is required"] },
    tags:  [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
    notes: { type: String, trim: true, default: "" },
    isArchived:  { type: Boolean, default: false },

    // course-based only
    courses: [courseSchema],

    // bento-based only
    bentoLayout: { type: bentoLayoutSchema, default: null },
  },
  { timestamps: true },
);

const Meal = mongoose.model("Meal", mealSchema);
export default Meal;
