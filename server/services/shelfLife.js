import Ingredient from "../models/Ingredient.js";
import PantryItem from "../models/PantryItem.js";
import StorageLocation from "../models/StorageLocation.js";

// How long things keep, by where they're kept — worked out from what's been
// done with them before, never asked up front.
//
// A pantry entry has one expiry date: the one for where it is now. Moving
// it (out of the freezer to thaw, into the freezer to save it) gives it a
// new one, and each move is kept on the entry (PantryItem.moves). The next
// time the same ingredient makes the same kind of move, the date offered is
// the middle of what it was given the last few times; until there's any
// history, a plain default.

// Entries from before moves were recorded aren't learned from: their dates
// weren't kept with this in mind (frozen things carry fridge dates).
const LEARN_FROM = new Date("2026-10-13T00:00:00Z");
const RECENT = 5;
const DAY = 86_400_000;

// The kind of place a storage location is, from its name.
export function placeKind(name = "") {
  if (/freez/i.test(name)) return "frozen";
  if (/fridge|refriger/i.test(name)) return "chilled";
  return "shelf";
}

// What a move amounts to: out of the freezer is "thawed" wherever it goes;
// otherwise it's the kind of place it went to.
export function moveKind(fromName, toName) {
  const to = placeKind(toName);
  return placeKind(fromName) === "frozen" && to !== "frozen" ? "thawed" : to;
}

function defaultDays(kind, ingredient) {
  if (kind === "frozen") return 90;
  if (kind === "thawed") return /protein|meat|fish|seafood|poultry/i.test(ingredient?.category?.name ?? "") ? 2 : 4;
  if (kind === "chilled") return 7;
  return 30;
}

const middle = (days) => {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// The spans (in days) this set of ingredients has been given for `kind`,
// newest first: from moves of that kind, and from entries put straight
// there and never moved.
async function spansFor(ingredientIds, kind, locationKinds) {
  const entries = await PantryItem.find({ ingredient: { $in: ingredientIds }, createdAt: { $gte: LEARN_FROM } })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();
  const spans = [];
  for (const entry of entries) {
    for (const move of [...(entry.moves ?? [])].reverse()) {
      if (move.kind === kind && move.expiryAfter && move.at) spans.push(Math.round((new Date(move.expiryAfter) - new Date(move.at)) / DAY));
    }
    if (kind !== "thawed" && !(entry.moves ?? []).length && entry.purchaseDate && entry.expiryDate && locationKinds.get(String(entry.storageLocation)) === kind) {
      spans.push(Math.round((new Date(entry.expiryDate) - new Date(entry.purchaseDate)) / DAY));
    }
  }
  return spans.filter((d) => d > 0).slice(0, RECENT);
}

// How many days `ingredientId` should be given after a move of `kind`, and
// whether that's from its own history ("learned") or a default.
export async function suggestShelfDays(ingredientId, kind) {
  const ingredient = await Ingredient.findById(ingredientId).populate("category").lean();
  const locationKinds = new Map((await StorageLocation.find().lean()).map((l) => [String(l._id), placeKind(l.name)]));
  // Its own first; failing that, its generic's and that generic's other brands.
  let spans = await spansFor([ingredientId], kind, locationKinds);
  if (!spans.length && ingredient) {
    const parent = ingredient.genericParent ?? (ingredient.isGeneric ? ingredient._id : null);
    if (parent) {
      const family = await Ingredient.find({ $or: [{ _id: parent }, { genericParent: parent }] }).select("_id").lean();
      spans = await spansFor(family.map((i) => i._id), kind, locationKinds);
    }
  }
  return spans.length ? { days: middle(spans), learned: true } : { days: defaultDays(kind, ingredient), learned: false };
}
