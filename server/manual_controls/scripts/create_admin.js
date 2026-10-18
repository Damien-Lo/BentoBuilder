// Makes the admin account — the first one, which invites everyone else — or
// sets a new password on an existing account and makes it the admin (for a
// forgotten admin password: there's no one above the admin to ask).
//
// Run from server/:
//   node manual_controls/scripts/create_admin.js            (real data)
//   node manual_controls/scripts/create_admin.js --test     (test data)
// It asks for the email, name and password; the password isn't shown as
// it's typed and is never printed or stored, only its hash.
import "dotenv/config";
import readline from "node:readline";
import mongoose from "mongoose";

import { TEST_DB_NAME } from "../../config/database.js";
import Session from "../../models/Session.js";
import User from "../../models/User.js";
import { hashPassword, isEmail, normalEmail, passwordProblem } from "../../services/auth.js";

// (One reader for every question, taking the lines in turn; the typing is
// hidden for passwords.)
let rl;
let lines;
let hiding = false;
async function ask(question, hidden = false) {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    rl._writeToOutput = (text) => {
      if (!hiding) rl.output.write(text);
    };
    lines = rl[Symbol.asyncIterator]();
  }
  process.stdout.write(question);
  hiding = hidden;
  const { value } = await lines.next();
  if (hidden) process.stdout.write("\n");
  hiding = false;
  return value ?? "";
}

async function main() {
  const test = process.argv.includes("--test");
  await mongoose.connect(process.env.MONGODB_URI, test ? { dbName: TEST_DB_NAME } : {});
  console.log(`Database: ${mongoose.connection.name} (${test ? "TEST" : "REAL"} data)`);

  const email = normalEmail(await ask("Email: "));
  if (!isEmail(email)) throw new Error("That isn't an email address.");
  const existing = await User.findOne({ email });
  const name = existing ? existing.name : (await ask("Name: ")).trim();

  const password = await ask(existing ? `New password for ${email}: ` : "Password: ", true);
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if ((await ask("Same password again: ", true)) !== password) throw new Error("The passwords don't match.");

  const passwordHash = await hashPassword(password);
  if (existing) {
    await User.updateOne({ _id: existing._id }, { passwordHash, role: "admin" });
    const ended = await Session.deleteMany({ user: existing._id });
    console.log(`${email} has a new password and is the admin (signed out of ${ended.deletedCount} device(s)).`);
  } else {
    const user = await User.create({ email, name, passwordHash, role: "admin" });
    console.log(`Admin account made for ${email} (${user._id}).`);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    rl?.close();
    return mongoose.disconnect();
  });
