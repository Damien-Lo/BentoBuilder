import mongoose from "mongoose";

// A photo the app shows — a recipe's, for now — kept in the database
// itself: one person's photos, shrunk on the device before they're sent
// (about 1,200 px, a few hundred KB), are no weight for it, and there's no
// other service to look after. Served by routes/PhotoRoutes.js; what shows
// it holds its address (`/api/photos/<id>`, e.g. Recipe.imageUrl).
const photoSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, default: "image/jpeg" },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    // What it's of, so it can be found and tidied away.
    of: {
      kind: { type: String, default: "" },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Photo", photoSchema);
