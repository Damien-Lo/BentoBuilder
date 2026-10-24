import mongoose from "mongoose";

// A person with an account. There's no public sign-up: the first account
// (the admin) is made with manual_controls/scripts/create_admin.js, and
// everyone else joins with an invite code the admin makes (see
// models/AccessCode.js). Passwords are kept only as a scrypt hash (see
// services/auth.js).
//
// `household` is for later: when people can share a pantry and grocery
// list, they'll belong to a household and shared things will be owned by
// it. Until then it stays null and everything belongs to the person.
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    name: { type: String, trim: true, default: "" },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    // Reviews what others add to or change in the public restaurants (see
    // routes/RestaurantRoutes.js) — the admin always does; a member only when
    // given this.
    reviewer: { type: Boolean, default: false },
    household: { type: mongoose.Schema.Types.ObjectId, default: null },
    lastSignInAt: { type: Date, default: null },
    // Turned off by the admin: can't sign in, and is signed out everywhere.
    disabledAt: { type: Date, default: null },
    // The admin's: links put in every invite message — the web app; where a
    // new person registers their iPhone for the app (Apple only installs a
    // test build on phones registered first), and where they install it.
    inviteLinks: {
      web: { type: String, trim: true, default: "" },
      register: { type: String, trim: true, default: "" },
      install: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
