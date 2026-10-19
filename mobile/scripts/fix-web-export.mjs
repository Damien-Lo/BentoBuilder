// After `expo export --platform web` (see "build:web" in package.json).
//
// Expo puts files that come from packages — the icon fonts, navigation
// images — under dist/assets/node_modules/…, and Cloudflare Pages doesn't
// upload anything in a folder called node_modules, so on the hosted web app
// every icon was missing (a square). This moves that folder to
// dist/assets/vendor/ and points the app's files at the new place.
//
// A file it changes gets a new name, too (and whatever refers to it is
// updated): app files are cached by browsers for good, on the promise that a
// different file has a different name — and the name Expo gave it was from
// before the change.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] ?? "dist");
const from = path.join(dist, "assets", "node_modules");
const to = path.join(dist, "assets", "vendor");

if (!fs.existsSync(from)) {
  console.log("fix-web-export: no assets/node_modules — nothing to move.");
  process.exit(0);
}
fs.rmSync(to, { recursive: true, force: true });
fs.renameSync(from, to);

const textFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|css|html|json|map)$/.test(entry.name)) textFiles.push(file);
  }
};
walk(dist);

// Point everything at the new place.
const changed = [];
for (const file of textFiles) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("/assets/node_modules/")) continue;
  fs.writeFileSync(file, text.split("/assets/node_modules/").join("/assets/vendor/"));
  changed.push(file);
}

// Each changed file under a name of its own (from its new contents).
const renames = [];
for (const file of changed) {
  const match = /^(.*-)([a-f0-9]{32})(\.[a-z]+)$/.exec(path.basename(file));
  if (!match) continue;
  const hash = crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
  const renamed = `${match[1]}${hash}${match[3]}`;
  fs.renameSync(file, path.join(path.dirname(file), renamed));
  renames.push([path.basename(file), renamed]);
}
for (const file of textFiles.map((f) => {
  const r = renames.find(([from]) => path.basename(f) === from);
  return r ? path.join(path.dirname(f), r[1]) : f;
})) {
  let text = fs.readFileSync(file, "utf8");
  let edited = false;
  for (const [from, to] of renames) {
    if (text.includes(from)) {
      text = text.split(from).join(to);
      edited = true;
    }
  }
  if (edited) fs.writeFileSync(file, text);
}

console.log(`fix-web-export: moved assets/node_modules to assets/vendor; updated ${changed.length} file(s); renamed ${renames.map(([a, b]) => `${a} → ${b}`).join(", ") || "none"}.`);
