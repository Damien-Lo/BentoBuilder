import AiUse from "../models/AiUse.js";
import { currentScope } from "./ownership.js";

// Reading a photo with the AI service (a receipt, a nutrition label, a
// meal) costs money, so each person has a daily allowance, and only a few
// at a time. Generous for real use; a stop to a runaway loop or someone
// running up the bill.
const PER_DAY = { admin: 300, member: 40 };
const AT_ONCE = 3;
const reading = new Map();

export class AllowanceError extends Error {}

// Counts one reading for whoever's asking; throws an AllowanceError when
// they're over. Returns `done`, to call when the reading is over.
export async function takeAllowance(req) {
  const scope = currentScope();
  if (!scope?.owner) return () => {};
  const who = String(scope.owner);
  if ((reading.get(who) ?? 0) >= AT_ONCE) throw new AllowanceError("Still reading your last few photos: try again in a moment.");
  const role = req.user?.role ?? (scope.legacy ? "admin" : "member");
  const day = new Date().toISOString().slice(0, 10);
  const use = await AiUse.findOneAndUpdate({ day }, { $inc: { count: 1 } }, { upsert: true, new: true });
  if (use.count > PER_DAY[role]) throw new AllowanceError(`That's today's limit of ${PER_DAY[role]} photos read. It starts again tomorrow.`);
  reading.set(who, (reading.get(who) ?? 0) + 1);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    const left = (reading.get(who) ?? 1) - 1;
    if (left > 0) reading.set(who, left);
    else reading.delete(who);
  };
}

// As Express middleware: until the answer has gone out.
export async function aiAllowance(req, res, next) {
  try {
    const done = await takeAllowance(req);
    res.on("finish", done);
    res.on("close", done);
    next();
  } catch (error) {
    if (error instanceof AllowanceError) return res.status(429).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: "Something went wrong on the server." });
  }
}
