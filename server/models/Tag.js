import mongoose from "mongoose";

const tagSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true },
);

tagSchema.index({ normalizedName: 1 }, { unique: true });

const Tag = mongoose.model("Tag", tagSchema);
export default Tag;
