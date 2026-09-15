// One-time data update: sets the new display-only Ingredient.pieceLabel
// field on the 3 ingredients already converted to wholePiece matching on
// their recipe lines, so the pantry list can show a piece count ("3
// steaks") instead of a summed weight for them. Matches the unit label
// each ingredient's own wholePiece recipe line already uses.
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Ingredient from "../../models/Ingredient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const LABELS = {
  "Filet Mignon": "steak",
  "Salmon Fillet": "fillet",
  "Tuna Steak": "steak",
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  const names = Object.keys(LABELS);
  const ingredients = await Ingredient.find({ name: { $in: names } });

  const backupPath = path.join(__dirname, "../seeds/ingredients_piece_label_backup.json");
  fs.writeFileSync(backupPath, JSON.stringify(ingredients.map((i) => i.toObject()), null, 2));
  console.log(`Backed up ${ingredients.length} ingredient(s) to ${backupPath}`);

  for (const name of names) {
    const ing = ingredients.find((i) => i.name === name);
    if (!ing) {
      console.warn(`SKIP: "${name}" not found`);
      continue;
    }
    ing.pieceLabel = LABELS[name];
    await ing.save();
    console.log(`Set "${name}".pieceLabel = "${LABELS[name]}"`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
