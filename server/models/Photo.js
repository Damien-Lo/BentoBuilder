import crypto from "node:crypto";
import mongoose from "mongoose";

import { ownedByUser } from "../services/ownership.js";

// A photo the app shows — a recipe's, a receipt's, a nutrition label's —
// kept in the database itself: one person's photos, shrunk on the device
// before they're sent (about 1,200 px, a few hundred KB), are no weight for
// it, and there's no other service to look after. Served by
// routes/PhotoRoutes.js; what shows it holds its address
// (`/api/photos/<id>/<key>`, e.g. Recipe.imageUrl).
//
// A photo is its owner's; it's served to whoever has its address, which
// holds a long random `key` — so only those it was shown to can open it (a
// shared recipe's photo: everyone; a receipt: its owner), and no one can
// guess one. (Photos from before keys are served by id until they're given
// one: manual_controls/scripts/assign_owners.js.)
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const photoSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    // (Only pictures: anything else served from here could be a page that
    // runs on the server's address.)
    contentType: { type: String, enum: PHOTO_TYPES, default: "image/jpeg" },
    key: { type: String, default: () => crypto.randomBytes(16).toString("hex") },
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

// (Personal: each photo belongs to an account — see services/ownership.js.)
photoSchema.plugin(ownedByUser);

export default mongoose.model("Photo", photoSchema);
