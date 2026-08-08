// One-off, additive update: fills in defaultPortionAmount/defaultPortionUnit
// and an estimated nutrition profile for every generic ingredient, using
// standard reference values (USDA-style averages) scaled to a sensible
// portion size for each. Skips ingredients whose nutrition is auto-synced
// from a linked production recipe (Chinese Tea Egg, Dashi Stock, Minced
// Garlic, Okonomoyaki Mix) — those are server-managed and would just get
// immediately stale if overwritten here.
//
// Run once by hand: node manual_controls/scripts/estimate_generic_nutrition.js
import "dotenv/config";
import mongoose from "mongoose";
import Ingredient from "../../models/Ingredient.js";

// { id, portionAmount, portionUnit, nutrition: {calories, protein, carbs, fats, fiber, sodium} }
const UPDATES = [
  // Asian Pantry
  { id: "6a690e7b0f94cb20253ba6db", amt: 5, unit: "g", n: [18, 3.2, 0, 0.15, 0, 35] },
  { id: "6a70b821121d0b38050808fa", amt: 1, unit: "block", n: [70, 1, 9, 3.5, 0.5, 750] },
  { id: "6a70b821121d0b38050808f9", amt: 1, unit: "tbsp", n: [15, 1, 2, 0.5, 0.3, 220] },
  { id: "6a70b820121d0b38050808f8", amt: 1, unit: "sheet", n: [5, 1, 0.8, 0.05, 0.3, 5] },

  // Baking
  { id: "6a6e63fcfa8c3c8fdc9a309b", amt: 100, unit: "g", n: [364, 10, 76, 1, 2.7, 2] },
  { id: "6a6ba1b1f0a7125b3912c159", amt: 0.6, unit: "g", n: [1, 0, 0.2, 0, 0, 64] },
  { id: "6a70b816121d0b38050808c9", amt: 1, unit: "tsp", n: [0, 0, 0, 0, 0, 1259] },
  { id: "6a70b816121d0b38050808c8", amt: 1, unit: "cup", n: [829, 0, 214, 0, 0, 68] },
  { id: "6a667cff1211fa2ec98bf3a1", amt: 1, unit: "tbsp", n: [30, 0, 7, 0, 0.1, 1] },
  { id: "6a69123f0f94cb20253ba6e2", amt: 10, unit: "g", n: [36, 0, 9, 0, 0, 0] },
  { id: "6a70b816121d0b38050808ca", amt: 1, unit: "tsp", n: [12, 0, 0.5, 0, 0, 0] },

  // Bread & Pastry
  { id: "6a6908774e0143a11147531b", amt: 1, unit: "serving", n: [289, 11, 56, 2, 2, 560] },

  // Cheese
  { id: "6a70b817121d0b38050808cf", amt: 1, unit: "cup", n: [455, 28, 1.5, 37, 0, 735] },
  { id: "6a6b918ebed510a8ab40a24d", amt: 1, unit: "slice", n: [85, 5, 0.4, 7, 0, 174] },
  { id: "6a68ffbe4e0143a111475308", amt: 28, unit: "g", n: [117, 8.5, 0.4, 9.2, 0, 95] },
  { id: "6a70b817121d0b38050808d0", amt: 1, unit: "cup", n: [285, 27, 3.1, 18, 0, 702] },
  { id: "6a69002e4e0143a11147530b", amt: 28, unit: "g", n: [111, 10, 0.9, 7.3, 0, 454] },

  // Condiments & Sauces
  { id: "6a691bfa0f94cb20253ba702", amt: 2, unit: "tbsp", n: [70, 1, 15, 0.5, 0.3, 430] },
  { id: "6a6678a31211fa2ec98bf38d", amt: 1, unit: "tbsp", n: [5, 0, 1, 0, 0, 5] },
  { id: "6a691a650f94cb20253ba6fd", amt: 1, unit: "tbsp", n: [10, 1, 2, 0, 0, 800] },
  { id: "6a6917f10f94cb20253ba6f1", amt: 1, unit: "tbsp", n: [35, 0.5, 7, 0.5, 0.3, 258] },
  { id: "6a68147025be1fa8f5001710", amt: 1, unit: "tbsp", n: [64, 0, 17, 0, 0, 1] },
  { id: "6a6918c50f94cb20253ba6f8", amt: 1, unit: "tbsp", n: [17, 0.2, 4.5, 0, 0.2, 154] },
  { id: "6a6917380f94cb20253ba6ec", amt: 1, unit: "tbsp", n: [100, 0.3, 0.5, 11, 0, 95] },
  { id: "6a6814eb25be1fa8f5001713", amt: 2, unit: "tbsp", n: [150, 1.5, 4, 15, 1, 250] },
  { id: "6a691de30f94cb20253ba70b", amt: 15, unit: "ml", n: [8, 1, 1, 0, 0, 1000] },
  { id: "6a70b81d121d0b38050808eb", amt: 1, unit: "tbsp", n: [94, 0.1, 0.1, 10, 0, 88] },
  { id: "6a667afd1211fa2ec98bf397", amt: 1, unit: "tbsp", n: [36, 0, 8, 0, 0, 3] },
  { id: "6a66812d1211fa2ec98bf3b7", amt: 1, unit: "tbsp", n: [34, 2, 4.3, 1, 0.9, 634] },
  { id: "6a70b81d121d0b38050808ec", amt: 1, unit: "tbsp", n: [9, 0.6, 0.7, 0.5, 0.3, 174] },
  { id: "6a69187d0f94cb20253ba6f5", amt: 1, unit: "tbsp", n: [9, 0.3, 2, 0, 0, 492] },
  { id: "6a6679091211fa2ec98bf391", amt: 1, unit: "tbsp", n: [10, 0.5, 2, 0, 0, 400] },
  { id: "6a66695e1211fa2ec98bf389", amt: 1, unit: "tbsp", n: [0, 0, 0, 0, 0, 0] },
  { id: "6a691e350f94cb20253ba70e", amt: 1, unit: "tsp", n: [8, 1, 0.5, 0.2, 0, 600] },
  { id: "6a665be3593a1e60dd0a10b9", amt: 1, unit: "tbsp", n: [8, 1.3, 0.8, 0, 0.1, 902] },
  { id: "6a6913680f94cb20253ba6e8", amt: 2, unit: "tbsp", n: [45, 0.7, 10, 0, 0.3, 420] },
  { id: "6a6917990f94cb20253ba6ee", amt: 1, unit: "tbsp", n: [16, 1, 3, 0, 0, 690] },
  { id: "6a691c670f94cb20253ba705", amt: 2, unit: "tbsp", n: [25, 1, 3, 1, 0.5, 1400] },
  { id: "6a68156025be1fa8f5001717", amt: 1, unit: "tbsp", n: [120, 0, 0, 14, 0, 0] },
  { id: "6a6912d90f94cb20253ba6e5", amt: 2, unit: "tbsp", n: [40, 0.7, 9, 0, 0.3, 460] },

  // Dairy & Eggs
  { id: "6a70b817121d0b38050808cb", amt: 1, unit: "tbsp", n: [102, 0.1, 0, 11.5, 0, 91] },
  { id: "6a70b817121d0b38050808cd", amt: 1, unit: "cup", n: [821, 5, 6.6, 88, 0, 89] },
  { id: "6a70b817121d0b38050808cc", amt: 1, unit: "cup", n: [149, 8, 12, 8, 0, 105] },
  { id: "6a70b817121d0b38050808ce", amt: 1, unit: "cup", n: [149, 9, 11, 8, 0, 113] },

  // Essentials
  { id: "6a6e2e0da0cb389ff9a9ae5f", amt: 1, unit: "bulb", n: [59, 2.5, 13, 0.2, 0.9, 7] },
  { id: "6a680e9225be1fa8f50016fb", amt: 1, unit: "tsp", n: [6, 0.2, 1.5, 0.1, 0.6, 1] },
  { id: "6a680e1a25be1fa8f50016fa", amt: 1, unit: "tsp", n: [0, 0, 0, 0, 0, 2325] },
  { id: "6a6a9177e3f09c8c316d964b", amt: 1, unit: "tsp", n: [16, 0, 4.2, 0, 0, 0] },
  { id: "6a6680681211fa2ec98bf3b5", amt: 1, unit: "ml", n: [0, 0, 0, 0, 0, 0] },

  // Fruits
  { id: "6a70b819121d0b38050808d9", amt: 1, unit: "item", n: [17, 0.6, 5.4, 0.2, 1.6, 1] },
  { id: "6a70b819121d0b38050808da", amt: 1, unit: "item", n: [20, 0.5, 7, 0.1, 1.9, 1] },

  // Grains & Cereals
  { id: "6a70b81b121d0b38050808e2", amt: 1, unit: "cup", n: [684, 14, 143, 5.5, 6.5, 8] },
  { id: "6a68165725be1fa8f500171b", amt: 28, unit: "g", n: [110, 3.6, 20, 1, 1, 200] },
  { id: "6a70b81b121d0b38050808e1", amt: 1, unit: "cup", n: [675, 13, 148, 1.2, 2.4, 4] },

  // Herbs
  { id: "6a70b820121d0b38050808f5", amt: 1, unit: "tbsp", n: [1, 0.1, 0.1, 0, 0.1, 0] },
  { id: "6a70b820121d0b38050808f6", amt: 1, unit: "tbsp", n: [0, 0, 0.1, 0, 0.1, 1] },
  { id: "6a70b820121d0b38050808f7", amt: 1, unit: "tbsp", n: [1, 0.1, 0.2, 0, 0.1, 2] },

  // Legumes & Pulses
  { id: "6a70b81b121d0b38050808e3", amt: 1, unit: "cup", n: [227, 15, 41, 0.9, 15, 2] },
  { id: "6a70b81b121d0b38050808e4", amt: 1, unit: "cup", n: [269, 15, 45, 4.2, 12.5, 11] },
  { id: "6a70b81c121d0b38050808e5", amt: 1, unit: "cup", n: [230, 18, 40, 0.8, 16, 4] },

  // Noodles & Pasta
  { id: "6a70b81c121d0b38050808e8", amt: 1, unit: "package", n: [380, 8, 52, 15, 2, 180] },
  { id: "6a70b81c121d0b38050808e7", amt: 1, unit: "package", n: [690, 24, 142, 2, 6, 700] },
  { id: "6a70b81c121d0b38050808e6", amt: 1, unit: "lb", n: [1631, 57, 332, 7, 15, 32] },
  { id: "6a696cb7e3f09c8c316d9644", amt: 250, unit: "g", n: [285, 8, 62, 1, 3, 700] },

  // Nuts & Seeds
  { id: "6a70b81f121d0b38050808f3", amt: 1, unit: "cup", n: [828, 30, 31, 71, 18, 1] },
  { id: "6a680fb925be1fa8f50016fc", amt: 1, unit: "tbsp", n: [52, 1.6, 2.1, 4.5, 1.2, 1] },
  { id: "6a70b81f121d0b38050808f2", amt: 1, unit: "cup", n: [828, 38, 24, 72, 12, 15] },
  { id: "6a691e9b0f94cb20253ba712", amt: 1, unit: "tbsp", n: [52, 1.6, 2.1, 4.5, 1.1, 1] },

  // Oils & Fats
  { id: "6a70b81c121d0b38050808e9", amt: 1, unit: "tbsp", n: [119, 0, 0, 13.5, 0, 0] },
  { id: "6a68170d25be1fa8f500171e", amt: 1, unit: "tbsp", n: [120, 0, 0, 13.6, 0, 0] },
  { id: "6a695d5ba2aa8e9521e5f03e", amt: 1, unit: "tbsp", n: [102, 0.1, 0, 11.5, 0, 2] },
  { id: "6a70b81d121d0b38050808ea", amt: 1, unit: "tbsp", n: [124, 0, 0, 14, 0, 0] },

  // Protein
  { id: "6a70b81a121d0b38050808de", amt: 4, unit: "slice", n: [161, 12, 0.5, 12, 0, 581] },
  { id: "6a70b81a121d0b38050808db", amt: 1, unit: "lb", n: [540, 101, 0, 12, 0, 245] },
  { id: "6a70b81a121d0b38050808dc", amt: 1, unit: "lb", n: [722, 90, 0, 39, 0, 340] },
  { id: "6a6900a04e0143a11147530f", amt: 85, unit: "g", n: [87, 17, 0, 1.5, 0, 296] },
  { id: "6a695cb8a2aa8e9521e5f03b", amt: 1, unit: "egg", n: [72, 6.3, 0.4, 5, 0, 71] },
  { id: "6a70b81a121d0b38050808dd", amt: 1, unit: "lb", n: [1152, 95, 0, 82, 0, 327] },
  { id: "6a6e64bafa8c3c8fdc9a309e", amt: 100, unit: "g", n: [518, 9.3, 0, 53, 0, 47] },
  { id: "6a70b81a121d0b38050808df", amt: 1, unit: "fillet", n: [354, 37, 0, 22, 0, 98] },
  { id: "6a690a504e0143a11147531e", amt: 100, unit: "g", n: [208, 20, 0, 13, 0, 59] },
  { id: "6a6901864e0143a111475313", amt: 2, unit: "patties", n: [230, 11, 1, 20, 0, 490] },
  { id: "6a70b81b121d0b38050808e0", amt: 1, unit: "lb", n: [403, 85, 3, 4.5, 0, 680] },
  { id: "6a695ed0a2aa8e9521e5f041", amt: 100, unit: "g", n: [250, 26, 0, 16, 0, 60] },
  { id: "6a68ff754e0143a111475304", amt: 56, unit: "g", n: [66, 10.4, 0, 2.5, 0, 980] },
  { id: "6a68fe364e0143a111475301", amt: 85, unit: "g", n: [70, 8, 2, 4, 1, 7] },

  // Rice
  { id: "6a681db425be1fa8f500172e", amt: 0.25, unit: "cup", n: [167, 3.4, 37, 0.3, 0.5, 1] },
  { id: "6a681d1825be1fa8f500172a", amt: 0.5, unit: "cup", n: [335, 6.4, 73, 0.6, 0.6, 2] },

  // Seasonings & Spices
  { id: "6a70b81e121d0b38050808ed", amt: 1, unit: "tsp", n: [6, 0.2, 1.5, 0.1, 0.6, 1] },
  { id: "6a6e3f8a6cb1f7b63316dee1", amt: 1, unit: "bag", n: [1, 0.1, 0.1, 0, 0, 0] },
  { id: "6a70b81e121d0b38050808ef", amt: 1, unit: "tsp", n: [8, 0.4, 1.4, 0.4, 0.9, 77] },
  { id: "6a70b81f121d0b38050808f1", amt: 1, unit: "tsp", n: [6, 0.1, 2, 0.1, 1.4, 1] },
  { id: "6a70b81e121d0b38050808ee", amt: 1, unit: "tsp", n: [8, 0.4, 0.9, 0.5, 0.2, 4] },
  { id: "6a667fed1211fa2ec98bf3b1", amt: 15, unit: "ml", n: [6, 1, 0.6, 0, 0, 1400] },
  { id: "6a6e3f336cb1f7b63316dedd", amt: 1, unit: "bag", n: [16, 0.5, 3, 0.5, 1, 5] },
  { id: "6a68129f25be1fa8f5001705", amt: 1, unit: "tsp", n: [10, 0.5, 2.3, 0, 0.3, 1] },
  { id: "6a667e251211fa2ec98bf3a9", amt: 0.25, unit: "tsp", n: [3, 0, 0, 0, 0, 125] },
  { id: "6a6811da25be1fa8f5001702", amt: 1, unit: "tsp", n: [8, 0.2, 1.9, 0, 0.1, 1] },
  { id: "6a68131c25be1fa8f5001709", amt: 1, unit: "tsp", n: [6, 0.3, 1.2, 0.3, 0.8, 1] },
  { id: "6a7684ba612bf1394ddf19c6", amt: 1, unit: "tsp", n: [6, 0.2, 1, 0.3, 0.5, 1] },
  { id: "6a6920da0f94cb20253ba716", amt: 0.25, unit: "tbsp", n: [6, 0.3, 1.2, 0.3, 0.5, 1] },
  { id: "6a70b81e121d0b38050808f0", amt: 1, unit: "tbsp", n: [52, 1.6, 2.1, 4.5, 1.1, 1] },
  { id: "6a667ddc1211fa2ec98bf3a5", amt: 2, unit: "tbsp", n: [32, 0.1, 1, 0, 0, 4] },
  { id: "6a681eca25be1fa8f5001739", amt: 2, unit: "tbsp", n: [70, 0, 14, 0, 0, 180] },
  { id: "6a6921420f94cb20253ba71a", amt: 100, unit: "g", n: [280, 12, 50, 8, 30, 50] },
  { id: "6a68105625be1fa8f50016ff", amt: 0.25, unit: "tsp", n: [2, 0.1, 0.4, 0, 0.1, 0] },
  { id: "6a691a100f94cb20253ba6fb", amt: 50, unit: "ml", n: [53, 0.2, 1.7, 0, 0, 7] },

  // Stock & Soups
  { id: "6a70b81f121d0b38050808f4", amt: 1, unit: "cup", n: [15, 2.7, 1, 0.5, 0, 860] },
  { id: "6a6813ff25be1fa8f500170d", amt: 0.25, unit: "tsp", n: [2, 0.2, 0.3, 0, 0, 290] },
  { id: "6a667c601211fa2ec98bf39c", amt: 0.5, unit: "tsp", n: [2, 0.3, 0.2, 0, 0, 460] },
  { id: "6a681e8f25be1fa8f5001735", amt: 2, unit: "tbsp", n: [25, 1.5, 4, 0, 0, 1500] },

  // Vegetables
  { id: "6a70b818121d0b38050808d3", amt: 1, unit: "item", n: [24, 1, 5.5, 0.2, 2, 4] },
  { id: "6a70b818121d0b38050808d5", amt: 1, unit: "cup", n: [31, 2.5, 6, 0.3, 2.4, 30] },
  { id: "6a6e6415fa8c3c8fdc9a309c", amt: 100, unit: "g", n: [25, 1.3, 5.8, 0.1, 2.5, 18] },
  { id: "6a70b818121d0b38050808d1", amt: 1, unit: "item", n: [25, 0.6, 6, 0.1, 1.7, 42] },
  { id: "6a69061e4e0143a111475318", amt: 100, unit: "g", n: [22, 2.5, 3.3, 0.3, 1, 5] },
  { id: "6a695ba9a2aa8e9521e5f039", amt: 100, unit: "g", n: [37, 2.7, 7.8, 0.3, 2.7, 3] },
  { id: "6a70b819121d0b38050808d8", amt: 1, unit: "stalk", n: [5, 0.3, 1.1, 0, 0.4, 2] },
  { id: "6a681e4225be1fa8f5001731", amt: 5, unit: "g", n: [4, 0.1, 1, 0, 0.2, 115] },
  { id: "6a690df40f94cb20253ba6d8", amt: 100, unit: "g", n: [29, 1.9, 6, 0.3, 2.1, 7] },
  { id: "6a690d660f94cb20253ba6d6", amt: 100, unit: "g", n: [23, 2.9, 3.6, 0.4, 2.2, 79] },
  { id: "6a70b819121d0b38050808d7", amt: 1, unit: "cup", n: [15, 2.2, 2.3, 0.2, 0.7, 4] },
  { id: "6a68178425be1fa8f5001721", amt: 1, unit: "sheet", n: [5, 1, 0.8, 0.05, 0.3, 5] },
  { id: "6a70b818121d0b38050808d2", amt: 1, unit: "item", n: [164, 4.3, 37, 0.2, 4.7, 13] },
  { id: "6a70b819121d0b38050808d6", amt: 1, unit: "cup", n: [7, 0.9, 1.1, 0.1, 0.7, 24] },
  { id: "6a70b818121d0b38050808d4", amt: 1, unit: "item", n: [22, 1.1, 4.8, 0.2, 1.5, 6] },
  { id: "6a667f611211fa2ec98bf3ad", amt: 2, unit: "tbsp", n: [13, 0.9, 2.6, 0.2, 0.2, 345] },
  { id: "6a6e2d31a0cb389ff9a9ae58", amt: 1, unit: "count", n: [44, 1.2, 10, 0.1, 1.9, 4] },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  let updated = 0;
  let skipped = 0;

  for (const { id, amt, unit, n } of UPDATES) {
    const [calories, protein, carbs, fats, fiber, sodium] = n;
    const result = await Ingredient.findByIdAndUpdate(id, {
      defaultPortionAmount: amt,
      defaultPortionUnit: unit,
      nutrition: { calories, protein, carbs, fats, fiber, sodium },
    });
    if (result) {
      updated++;
    } else {
      skipped++;
      console.log(`Not found, skipped: ${id}`);
    }
  }

  console.log(`Updated ${updated} ingredient(s), ${skipped} not found.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
