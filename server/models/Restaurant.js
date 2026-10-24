import mongoose from "mongoose";

// A restaurant — public, and built up by everyone: one record for each real
// place, whoever added it. Its menu is its dishes (RestaurantDish), or for a
// chain location its chain's (Chain). Anyone signed in can add to it or
// correct it, wiki-style: every change is kept in `history`, so the admin
// can see who changed what and put it back. What's one person's own — notes,
// ratings, what they paid — is in their FoodSettings (kind "restaurant" /
// "dish"), never here.
//
// Where it is (a point, for "near me" and for telling two "Pho Dai Loi"s
// apart) and its Google place ID (which Google's terms allow keeping) make
// "Open in Google Maps" work; both optional. Two records for the same place
// are merged by pointing one at the other (`mergedInto`).

export const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // What changed: { field: [before, after] }.
    changes: { type: mongoose.Schema.Types.Mixed, default: {} },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Restaurant name is required"], trim: true },
    // Its kind of food ("Korean", "Pizza") — free text, for browsing.
    cuisine: { type: String, trim: true, default: "" },
    // A location of a chain: the chain's menu is its menu.
    chain: { type: mongoose.Schema.Types.ObjectId, ref: "Chain", default: null },

    address: { type: String, trim: true, default: "" },
    // GeoJSON: [longitude, latitude].
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined },
    },
    googlePlaceId: { type: String, trim: true, default: null },
    website: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    history: { type: [historySchema], default: [] },
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", default: null },
    // Reviewed before anyone else sees it: one added by a member waits
    // ("pending" — seen by them, usable and loggable by them) until a reviewer
    // approves it, or rejects it (with a reason). One from before reviews, or
    // added by a reviewer, is approved.
    status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
    reviewNote: { type: String, trim: true, default: "" },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

restaurantSchema.index({ location: "2dsphere" }, { sparse: true });
restaurantSchema.index({ name: 1 });
restaurantSchema.index({ chain: 1 });

export default mongoose.model("Restaurant", restaurantSchema);
