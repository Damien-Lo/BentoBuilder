// After `expo export --platform web` (see "build:web" in package.json).
//
// Expo puts files that come from packages — the icon fonts, navigation
// images — under dist/assets/node_modules/…, and Cloudflare Pages doesn't
// upload anything in a folder called node_modules, so on the hosted web app
// every icon was missing (a square). This moves that folder to
// dist/assets/vendor/ and points the app's files at the new place.
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

let changed = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|css|html|json|map)$/.test(entry.name)) {
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes("/assets/node_modules/")) continue;
      fs.writeFileSync(file, text.split("/assets/node_modules/").join("/assets/vendor/"));
      changed += 1;
    }
  }
};
walk(dist);
console.log(`fix-web-export: moved assets/node_modules to assets/vendor; updated ${changed} file(s).`);
