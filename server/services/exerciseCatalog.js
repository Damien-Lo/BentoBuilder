import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXERCISE_CORE } from "../data/exerciseCore.js";
import Exercise from "../models/Exercise.js";

// Fills Gym's exercise library from free-exercise-db (data/), and keeps it
// in step with the core list: run each time the server connects to a
// database. It adds what's missing and brings each library exercise's
// details, name and core flag up to date; it never deletes anything.

const LIBRARY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "free-exercise-db", "exercises.json");

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
  const result = await Exercise.bulkWrite(operations, { ordered: false });
  return { added: result.upsertedCount, updated: result.modifiedCount, core: core.size };
}
