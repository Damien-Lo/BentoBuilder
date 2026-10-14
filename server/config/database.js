import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mongoose from "mongoose";

// Which database the server works on.
//
// There are two, on the same cluster: the real one (everything actually
// eaten, bought and planned) and a test one to try things out in — the same
// recipes and ingredients, but its own pantry, meal plan, calendar and
// tasks. The app's code can't tell them apart; only this connection differs.
//
// Switching is for a developer's own machine only. It's allowed where
// ALLOW_DATABASE_SWITCH=true is set in server/.env, and there the server
// starts on the test data (so that trying something never touches the real
// thing by accident) and remembers the last choice. Anywhere else — the
// deployed server — it's the real data, always, and can't be changed.

export const DATABASES = {
  real: { label: "Real data", description: "Your actual kitchen, calendar and tasks" },
  test: { label: "Test data", description: "A copy of your recipes and ingredients, with nothing else in it" },
};

// The real database is whichever the connection string points at (it has no
// name of its own in the string, so MongoDB's default applies).
export const TEST_DB_NAME = "bentobuilder_sandbox";

// (Not .json or .js: the dev server restarts itself when one of those changes.)
const CHOICE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tmp", "dev-database.txt");

export const canSwitchDatabase = () => process.env.ALLOW_DATABASE_SWITCH === "true";

export const connectionOptions = (name) => (name === "test" ? { dbName: TEST_DB_NAME } : {});

// The one to start on.
export function chosenDatabase() {
  if (!canSwitchDatabase()) return "real";
  try {
    return fs.readFileSync(CHOICE_FILE, "utf8").trim() === "real" ? "real" : "test";
  } catch {
    return "test";
  }
}

let current = "real";
export const currentDatabase = () => current;

// Connects to `name`, leaving whichever was connected before.
export async function connectDatabase(name) {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing from server/.env");
  const target = name === "test" && canSwitchDatabase() ? "test" : "real";
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(process.env.MONGODB_URI, connectionOptions(target));
  current = target;
  // (A database that's new, or newly reset, has none of the models' indexes.)
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes().catch(() => {})));
  if (canSwitchDatabase()) {
    fs.mkdirSync(path.dirname(CHOICE_FILE), { recursive: true });
    fs.writeFileSync(CHOICE_FILE, target);
  }
  return target;
}
