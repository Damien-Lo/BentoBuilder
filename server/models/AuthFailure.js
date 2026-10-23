import mongoose from "mongoose";

// A run of failed sign-in attempts for one key (an address, an email, or
// the email from an address — see services/auth.js), so slowing down
// guessing survives the server restarting. The key is kept as its SHA-256,
// not the address or email itself. Gone once its window has passed.
const authFailureSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  since: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

authFailureSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuthFailure = mongoose.model("AuthFailure", authFailureSchema);
export default AuthFailure;
