// One-off (Oct 23, 2026): a copy of Damien's own data, from the account
// that's now Orbit's admin (support.team.orbit@gmail.com) into his personal
// one (Damien) — the admin's left exactly as it is. Copied: weigh-ins, Apple
// Health readings, Gym sessions and routines, meals logged and planned,
// calendar events, tasks, and the profile's settings — with what they
// depend on, so nothing breaks: the restaurant dishes, saved meals, usual
// meals and menu the meals point to, the meal suggestions' history, the
// custom exercises the routines use, the calendars the events are in, and
// the lists and groups the tasks are in (the default list's tasks into the
// personal account's own default list). Not copied: the pantry, grocery
// list and storage places (out of date), devices, photos (opened by link
// either way), and the shared catalog.
//
// Each copy gets a new id, and every link between the copies follows it —
// an event to its calendar, a plan to its routines, a session to its
// routine and exercises, a meal to its dish, a task to its list. The
// admin's built-in calendars (Calendar, Tasks, Kitchen, Gym) go into the
// personal account's own (made when it first signed in): their settings
// (the Kitchen's meal times, colours, what's hidden) copied onto them, and
// their events into them. The ids made are kept in copy_20261023_ids, so
// the copy can be removed exactly; the personal account's profile and
// calendars are backed up first.
//
// Afterwards (run separately, Oct 23): the 58 copied meals that noted which
// of the admin's pantry pieces they used had that note cleared — logged as
// if no pantry piece was used. Their nutrition is kept on its own
// (confirmedNutrition), so it didn't change; the notes are backed up in
// backup_20261023_copy_stockdeductions.
//
//   node manual_controls/scripts/move_personal_data.js        (dry run)
//   node manual_controls/scripts/move_personal_data.js --go

import "dotenv/config";
import mongoose from "mongoose";

const GO = process.argv.includes("--go");
const { ObjectId } = mongoose.Types;
const FROM = new ObjectId("6ad547d6919c8d53ececaefa"); // Orbit Admin
const TO = new ObjectId("6adbd87d0f6154443617151b"); // Damien

// Copied: every record of the admin's in each.
const COLLECTIONS = [
  "exercises",
  "gymworkouts",
  "gymsessions",
  "weightentries",
  "healthmetrics",
  "meals",
  "restaurantmeals",
  "usualmeals",
  "menuitems",
  "mealplanentries",
  "suggestionevents",
  "eventcalendars",
  "calendarevents",
  "todogroups",
  "todolists",
  "todotasks",
];
// The built-in calendars, matched one to one.
const BUILT_IN = ["isDefault", "isTasks", "isMeals", "isGym"];
// A built-in calendar's settings (not its kind, owner or bookkeeping).
const CALENDAR_SETTINGS = ["name", "color", "visible", "order", "hiddenKinds", "mealTimes", "mealTimesUntil"];
const PROFILE_SKIP = new Set(["_id", "owner", "__v", "createdAt", "updatedAt"]);

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName}${GO ? "" : "  (dry run — nothing changes)"}`);
const [from, to] = await Promise.all([db.collection("users").findOne({ _id: FROM }), db.collection("users").findOne({ _id: TO })]);
if (!from || !to) throw new Error("One of the two accounts wasn't found.");
console.log(`Copy from: ${from.name} (${from.role}) → into: ${to.name} (${to.role})\n`);

// What's copied, and each copy's new id.
const docs = {};
const ids = new Map(); // old id (hex) → new id
for (const c of COLLECTIONS) {
  docs[c] = await db.collection(c).find({ owner: FROM }).toArray();
  for (const d of docs[c]) ids.set(String(d._id), new ObjectId());
}
// The built-in calendars: into the personal account's own.
const theirs = await db.collection("eventcalendars").find({ owner: TO }).toArray();
const intoTheirs = [];
for (const cal of docs.eventcalendars) {
  const kind = BUILT_IN.find((k) => cal[k]);
  const match = kind && theirs.find((t) => t[kind]);
  if (match) {
    ids.set(String(cal._id), match._id);
    intoTheirs.push({ cal, match });
  }
}
docs.eventcalendars = docs.eventcalendars.filter((cal) => !intoTheirs.some((x) => x.cal === cal));
// The default task list, the same way: its tasks into the personal one's.
const theirDefault = await db.collection("todolists").findOne({ owner: TO, isDefault: true });
const adminDefault = docs.todolists.find((l) => l.isDefault);
if (theirDefault && adminDefault) {
  ids.set(String(adminDefault._id), theirDefault._id);
  docs.todolists = docs.todolists.filter((l) => l !== adminDefault);
}

// A copy: owned by Damien, every link to a copied record following it (an
// ObjectId, or an id kept as text in a plan).
const HEX = /^[0-9a-f]{24}$/;
function relink(value) {
  if (value instanceof ObjectId) return ids.get(String(value)) ?? value;
  if (typeof value === "string" && HEX.test(value) && ids.has(value)) return String(ids.get(value));
  if (Array.isArray(value)) return value.map(relink);
  if (value && typeof value === "object" && !(value instanceof Date) && value.constructor === Object) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, relink(v)]));
  return value;
}
const copyOf = (d) => ({ ...relink(d), _id: ids.get(String(d._id)), owner: TO });

for (const c of COLLECTIONS) {
  const have = await db.collection(c).countDocuments({ owner: TO });
  console.log(`${c.padEnd(18)} ${String(docs[c].length).padStart(5)} to copy   (Damien has ${have})`);
}
for (const { cal, match } of intoTheirs) console.log(`  built-in "${cal.name}" → into Damien's "${match.name}" (its settings and events)`);
if (theirDefault && adminDefault) console.log(`  default list "${adminDefault.name}" → into Damien's "${theirDefault.name}" (its tasks)`);
const fromProfile = await db.collection("userprofiles").findOne({ owner: FROM });
const toProfile = await db.collection("userprofiles").findOne({ owner: TO });
const settings = Object.fromEntries(Object.entries(fromProfile ?? {}).filter(([k]) => !PROFILE_SKIP.has(k)));
console.log(`\nProfile settings copied: goal ${settings.goalWeight} kg, calories ${settings.dailyCalorieLimit}, height ${settings.heightCm} cm, born ${settings.birthDate}, targets ${JSON.stringify(settings.targets ?? {})}`);
// (A link that stays pointing at the admin's — the pantry pieces a logged meal took from.)
const pantryLinks = docs.mealplanentries.filter((e) => (e.stockDeductions ?? []).length).length;
console.log(`(${pantryLinks} logged meals keep their note of which pantry pieces they used — the admin's pantry, not copied.)`);

if (!GO) {
  console.log("\nDry run. Run again with --go to copy.");
  await mongoose.disconnect();
  process.exit(0);
}

// Damien's own, before they change: the profile and the built-in calendars.
await db.collection("backup_20261023_copy_damien").insertMany([...(toProfile ? [{ ...toProfile, _from: "userprofiles" }] : []), ...theirs.map((t) => ({ ...t, _from: "eventcalendars" }))]);

// The copies, and their ids kept (to remove the copy exactly, if need be).
const made = {};
for (const c of COLLECTIONS) {
  const copies = docs[c].map(copyOf);
  if (copies.length) await db.collection(c).insertMany(copies, { ordered: true });
  made[c] = copies.map((x) => x._id);
}
for (const { cal, match } of intoTheirs) {
  const set = Object.fromEntries(CALENDAR_SETTINGS.filter((k) => cal[k] !== undefined).map((k) => [k, cal[k]]));
  await db.collection("eventcalendars").updateOne({ _id: match._id }, { $set: set });
}
if (toProfile) await db.collection("userprofiles").updateOne({ _id: toProfile._id }, { $set: settings });
await db.collection("copy_20261023_ids").insertOne({ at: new Date(), from: FROM, to: TO, made });

// Checked: each copied, the admin's untouched.
let ok = true;
for (const c of COLLECTIONS) {
  const theirsNow = await db.collection(c).countDocuments({ _id: { $in: made[c] }, owner: TO });
  const adminNow = await db.collection(c).countDocuments({ owner: FROM });
  const adminBefore = docs[c].length + (c === "eventcalendars" ? intoTheirs.length : 0) + (c === "todolists" && theirDefault && adminDefault ? 1 : 0);
  const good = theirsNow === made[c].length && adminNow === adminBefore;
  ok &&= good;
  console.log(`${c.padEnd(18)} copied ${String(theirsNow).padStart(5)} of ${made[c].length} · admin still ${adminNow} ${good ? "✓" : "✗"}`);
}
// Links: none of the copies points at an admin record that was copied.
const oldIds = new Set([...ids.keys()]);
let stray = 0;
const walk = (v) => {
  if (v instanceof ObjectId) {
    if (oldIds.has(String(v))) stray++;
  } else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object" && !(v instanceof Date)) Object.values(v).forEach(walk);
};
for (const c of COLLECTIONS) for (const d of await db.collection(c).find({ _id: { $in: made[c] } }).toArray()) walk({ ...d, _id: null });
console.log(`Links still pointing at the admin's copied records: ${stray} ${stray ? "✗" : "✓"}`);
console.log(ok && !stray ? "\nCopied." : "\nSomething doesn't add up — the copy's ids are in copy_20261023_ids.");
await mongoose.disconnect();
