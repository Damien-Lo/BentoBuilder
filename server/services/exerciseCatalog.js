import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXERCISE_CORE, EXERCISE_EXTRAS } from "../data/exerciseCore.js";
import Exercise from "../models/Exercise.js";

// Fills Gym's exercise library from free-exercise-db (data/), and keeps it
// in step with the core list: run each time the server connects to a
// database. It adds what's missing and brings each library exercise's
// details, name and core flag up to date; it never deletes anything.

const LIBRARY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "free-exercise-db", "exercises.json");

// How an exercise is logged, from what it is: assisted by its name, cardio
// by its category, holds and stretches by time, what needs nothing but the
// body by reps — the rest by weight and reps. (`TRACKS` names the ones the
// rules miss.)
const TRACKS = {
  "Chest Dip": "bodyweight",
  "Leg Raise (Parallel Bars)": "bodyweight",
  "Weighted Pull-Up": "bodyweight",
  "Glute-Ham Raise": "bodyweight",
};
export function trackFor(name, item) {
  if (TRACKS[name]) return TRACKS[name];
  if (/assisted/i.test(name)) return "assisted";
  if (item.category === "cardio") return "cardio";
  if (item.category === "stretching" || /\bplank\b|wall sit|\bhold\b|dead hang|l-sit/i.test(name)) return "duration";
  if (item.equipment === "body only") return "bodyweight";
  return "weight";
}

export async function ensureExerciseCatalog() {
  const library = JSON.parse(fs.readFileSync(LIBRARY, "utf8"));
  // The core, by the exercise's name in the library: its own name and group.
  const core = new Map();
  for (const [group, entries] of Object.entries(EXERCISE_CORE)) {
    for (const entry of entries) core.set(entry.source, { name: entry.name, group });
  }
  const operations = library.map((item) => {
    const chosen = core.get(item.name);
    const group = chosen?.group ?? (item.category === "cardio" ? "cardio" : item.primaryMuscles?.[0] ?? "other");
    return {
      updateOne: {
        filter: { sourceId: item.id },
        update: {
          $set: {
            name: chosen?.name ?? item.name,
            sourceName: item.name,
            track: trackFor(chosen?.name ?? item.name, item),
            core: !!chosen,
            group,
            category: item.category ?? null,
            equipment: item.equipment ?? null,
            primaryMuscles: item.primaryMuscles ?? [],
            secondaryMuscles: item.secondaryMuscles ?? [],
            level: item.level ?? null,
            mechanic: item.mechanic ?? null,
            force: item.force ?? null,
            images: item.images ?? [],
            instructions: item.instructions ?? [],
          },
          $setOnInsert: { sourceId: item.id, owner: null },
        },
        upsert: true,
      },
    };
  });
  // And Orbit's own (data/exerciseCore.js), in the core.
  for (const extra of EXERCISE_EXTRAS) {
    const { id, ...fields } = extra;
    operations.push({
      updateOne: {
        filter: { sourceId: id },
        update: { $set: { track: trackFor(fields.name, fields), ...fields, sourceName: null, core: true, images: [] }, $setOnInsert: { sourceId: id, owner: null } },
        upsert: true,
      },
    });
  }
  const result = await Exercise.bulkWrite(operations, { ordered: false });
  return { added: result.upsertedCount, updated: result.modifiedCount, core: core.size };
}
