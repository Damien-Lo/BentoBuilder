import mongoose from "mongoose";

// A one-time code the admin hands someone:
//   - "invite": to create an account (optionally only for one email);
//   - "reset": to set a new password for an existing account (there's no
//     email sending yet, so a forgotten password goes through the admin).
// Only the code's SHA-256 is stored; it's used up once used, and lapses at
// expiresAt.
const accessCodeSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["invite", "reset"], required: true },
    codeHash: { type: String, required: true, unique: true, select: false },
    // (An invite can be for one email only; a reset is always for one user.)
    email: { type: String, trim: true, lowercase: true, default: "" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

export default mongoose.model("AccessCode", accessCodeSchema);
