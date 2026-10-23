// One-off (Oct 23, 2026): Health's measurements move from imperial to
// metric storage — kilograms, km, cm, mL, °C, as Apple Health keeps them
// (the app shows either). Converts, in the real database, for every
// account: weigh-ins (and their previous weights), each profile's goal and
// starting weight, and the readings kept in imperial (lean mass, distance,
// waist, water, wrist temperature, workouts' distance). Everything it
// touches is copied to backup_20261023_* collections first, and it records
// that it ran (migrations: "health-metric-units") so it can't run twice.
//
//   node manual_controls/scripts/convert_health_to_metric.js        (dry run)
//   node manual_controls/scripts/convert_health_to_metric.js --go

import "dotenv/config";
import mongoose from "mongoose";

const GO = process.argv.includes("--go");
const MARK = "health-metric-units";
const LB = 0.45359237;
const r2 = (n) => Math.round(n * 100) / 100;

// Each reading type kept in imperial: how it becomes metric, and its unit.
const READINGS = {
  leanMass: { to: (v) => v * LB, unit: "kg" },
  distance: { to: (v) => v * 1.609344, unit: "km" },
  waist: { to: (v) => v * 2.54, unit: "cm" },
  water: { to: (v) => v * 29.5735, unit: "mL" },
  wristTemp: { to: (v) => ((v - 32) * 5) / 9, unit: "degC" },
};

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName}${GO ? "" : "  (dry run — nothing changes)"}`);

if (await db.collection("migrations").findOne({ _id: MARK })) {
  console.log("Already converted — nothing to do.");
  await mongoose.disconnect();
  process.exit(0);
}

const weights = await db.collection("weightentries").find({}).toArray();
const profiles = await db.collection("userprofiles").find({ $or: [{ goalWeight: { $type: "number" } }, { startingWeight: { $type: "number" } }] }).toArray();
const readings = await db.collection("healthmetrics").find({ $or: [{ type: { $in: Object.keys(READINGS) } }, { type: "workout", "detail.miles": { $exists: true } }] }).toArray();

const sum = (list, f) => Math.round(list.reduce((s, x) => s + (f(x) ?? 0), 0) * 100) / 100;
console.log(`Weigh-ins: ${weights.length} (total ${sum(weights, (w) => w.weight)} lb → ${r2(sum(weights, (w) => w.weight) * LB)} kg)`);
console.log(`Profiles with a goal or starting weight: ${profiles.length}`);
for (const p of profiles) console.log(`  ${p._id}: goal ${p.goalWeight} lb → ${p.goalWeight != null ? r2(p.goalWeight * LB) : "—"} kg, start ${p.startingWeight} lb → ${p.startingWeight != null ? r2(p.startingWeight * LB) : "—"} kg`);
const byType = {};
for (const m of readings) byType[m.type] = (byType[m.type] ?? 0) + 1;
console.log(`Readings: ${JSON.stringify(byType)}`);
const sample = (type) => readings.find((m) => m.type === type);
for (const type of Object.keys(READINGS)) {
  const m = sample(type);
  if (m) console.log(`  e.g. ${type} ${m.date}: ${m.value} ${m.unit} → ${r2(READINGS[type].to(m.value))} ${READINGS[type].unit}`);
}
const w = sample("workout");
if (w) console.log(`  e.g. workout ${w.date}: ${w.detail.miles} mi → ${r2(w.detail.miles * 1.609344)} km`);

if (!GO) {
  console.log("\nDry run. Run again with --go to convert.");
  await mongoose.disconnect();
  process.exit(0);
}

// Backups first.
const backup = async (name, docs) => {
  if (docs.length) await db.collection(`backup_20261023_${name}`).insertMany(docs, { ordered: false });
};
await backup("weightentries", weights);
await backup("userprofiles", profiles);
await backup("healthmetrics", readings);
console.log("Backed up.");

// Then each, converted.
const weightOps = weights.map((e) => ({
  updateOne: { filter: { _id: e._id }, update: { $set: { weight: r2(e.weight * LB), ...(typeof e.previousWeight === "number" ? { previousWeight: r2(e.previousWeight * LB) } : {}) } } },
}));
if (weightOps.length) await db.collection("weightentries").bulkWrite(weightOps);
const profileOps = profiles.map((p) => ({
  updateOne: {
    filter: { _id: p._id },
    update: { $set: { ...(typeof p.goalWeight === "number" ? { goalWeight: r2(p.goalWeight * LB) } : {}), ...(typeof p.startingWeight === "number" ? { startingWeight: r2(p.startingWeight * LB) } : {}) } },
  },
}));
if (profileOps.length) await db.collection("userprofiles").bulkWrite(profileOps);
const readingOps = readings.map((m) => {
  if (m.type === "workout") {
    const { miles, ...rest } = m.detail;
    return { updateOne: { filter: { _id: m._id }, update: { $set: { detail: { ...rest, km: r2(miles * 1.609344) } } } } };
  }
  const how = READINGS[m.type];
  return { updateOne: { filter: { _id: m._id }, update: { $set: { value: r2(how.to(m.value)), unit: how.unit } } } };
});
if (readingOps.length) await db.collection("healthmetrics").bulkWrite(readingOps);
await db.collection("migrations").insertOne({ _id: MARK, at: new Date(), weights: weights.length, profiles: profiles.length, readings: readings.length });

const after = await db.collection("weightentries").find({}).toArray();
console.log(`Converted. Weigh-ins total now ${sum(after, (e) => e.weight)} kg (expected ${r2(sum(weights, (e) => e.weight) * LB)}).`);
await mongoose.disconnect();
