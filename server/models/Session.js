import mongoose from "mongoose";

// One signed-in device (a phone, a browser). The device keeps a random
// token and sends it with each request (Authorization: Bearer …); only the
// token's SHA-256 is stored here, so a copy of the database can't be used
// to sign in. A session lasts SESSION_DAYS from its last use (see
// services/auth.js) and can be ended from another device.
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    deviceName: { type: String, trim: true, default: "" },
    // The Device it's on (models/Device.js), once that device has been heard
    // from while signed in (routes/DeviceRoutes.js) — so Settings → Devices
    // lists each device once, signed in or not.
    device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", default: null },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// (Expired sessions are removed by MongoDB itself.)
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Session", sessionSchema);
