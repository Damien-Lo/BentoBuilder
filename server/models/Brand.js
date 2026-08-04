import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

brandSchema.pre("validate", function () {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }
});

const Brand =
  mongoose.models.Brand ||
  mongoose.model("Brand", brandSchema);

export default Brand;