import GroceryItem from "../models/GroceryItem.js";

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function unitsConflict(existingUnit, incomingUnit) {
  return (
    existingUnit &&
    incomingUnit &&
    existingUnit.trim().toLowerCase() !== incomingUnit.trim().toLowerCase()
  );
}

// A legacy item (created before requestedBy existed) has a real hand-entered
// quantity but no contribution recording where it came from. The first time
// real contribution-tracking touches it, preserve that quantity as an
// implicit manual contribution rather than silently overwriting or losing it.
function seedLegacyContribution(item) {
  if (item.requestedBy.length === 0 && item.quantity != null && item.quantity > 0) {
    item.requestedBy.push({ source: "manual", amount: item.quantity });
  }
}

function recomputeQuantity(item) {
  item.quantity = round(item.requestedBy.reduce((sum, contribution) => sum + contribution.amount, 0));
}

/**
 * Idempotent per (ingredient, mealPlanEntry): re-calling this for the same
 * entry updates its existing contribution amount in place instead of
 * duplicating — this is what lets re-pressing "add missing to grocery list"
 * closer to shopping day refresh a stale shortfall. Finds or creates the
 * ingredient's toBuy item; a completed/pendingLog item for the same
 * ingredient is left alone and a fresh toBuy item is created instead, since
 * that one already represents purchased/in-progress stock.
 */
export async function upsertMealPlanEntryContribution({ ingredient, mealPlanEntry, name, amount, unit }) {
  const roundedAmount = round(amount);
  if (!(roundedAmount > 0)) {
    throw new Error("amount must be greater than 0");
  }

  let item = await GroceryItem.findOne({ ingredient, status: "toBuy" });
  if (item && unitsConflict(item.unit, unit)) {
    item = null;
  }

  if (!item) {
    item = new GroceryItem({ ingredient, name, unit, quantity: 0, status: "toBuy", requestedBy: [] });
  } else {
    seedLegacyContribution(item);
  }

  const existingContribution = item.requestedBy.find(
    (contribution) =>
      contribution.source === "mealPlanEntry" && String(contribution.mealPlanEntry) === String(mealPlanEntry),
  );

  if (existingContribution) {
    existingContribution.amount = roundedAmount;
  } else {
    item.requestedBy.push({ source: "mealPlanEntry", mealPlanEntry, amount: roundedAmount });
  }

  if (!item.unit) item.unit = unit;
  recomputeQuantity(item);
  await item.save();
  return item;
}

/**
 * Adds from a list rather than one meal — by hand ("manual"), or from the
 * plan's or the menu's To buy ("plan", "menu"): each source's amount is its
 * own, so the item says where it came from (its tags on the grocery list).
 *
 * Manual adds accumulate on repeat (adding 1 more egg twice means 2 total),
 * unlike the meal-plan case above, which replaces — a manual add is "more of
 * this," not a refreshed total. Items with no linked ingredient (free-text,
 * e.g. "paper towels") have no dedupe key, so they always create a fresh row,
 * matching the existing behavior for unlinked items.
 */
export async function upsertManualContribution({ ingredient, name, amount, unit, source = "manual" }) {
  const roundedAmount = amount != null && Number.isFinite(amount) && amount > 0 ? round(amount) : null;

  if (!ingredient) {
    return GroceryItem.create({
      ingredient: null,
      name,
      quantity: roundedAmount,
      unit: unit || "",
      requestedBy: roundedAmount != null ? [{ source, amount: roundedAmount }] : [],
    });
  }

  let item = await GroceryItem.findOne({ ingredient, status: "toBuy" });
  if (item && unitsConflict(item.unit, unit)) {
    item = null;
  }

  if (!item) {
    return GroceryItem.create({
      ingredient,
      name,
      quantity: roundedAmount,
      unit: unit || "",
      requestedBy: roundedAmount != null ? [{ source, amount: roundedAmount }] : [],
    });
  }

  seedLegacyContribution(item);

  if (roundedAmount != null) {
    const existing = item.requestedBy.find((contribution) => contribution.source === source);
    if (existing) {
      existing.amount = round(existing.amount + roundedAmount);
    } else {
      item.requestedBy.push({ source, amount: roundedAmount });
    }
    if (!item.unit) item.unit = unit;
    recomputeQuantity(item);
  }

  await item.save();
  return item;
}

/**
 * Called when a MealPlanEntry is archived (soft-deleted). Only ever touches
 * toBuy items — a pendingLog or completed item is real shopping/pantry
 * progress and must never be mutated here, even if it still carries a
 * contribution referencing this entry.
 */
export async function removeMealPlanEntryContributions(mealPlanEntryId) {
  const items = await GroceryItem.find({
    status: "toBuy",
    "requestedBy.source": "mealPlanEntry",
    "requestedBy.mealPlanEntry": mealPlanEntryId,
  });

  for (const item of items) {
    item.requestedBy = item.requestedBy.filter(
      (contribution) =>
        !(contribution.source === "mealPlanEntry" && String(contribution.mealPlanEntry) === String(mealPlanEntryId)),
    );

    if (item.requestedBy.length === 0) {
      await item.deleteOne();
    } else {
      recomputeQuantity(item);
      await item.save();
    }
  }
}

/**
 * Keeps what a list (the plan, or the menu) has put on the grocery list in
 * step with what it needs now: `needs` is everything it wants for the next
 * shopping trip, [{ ingredient, name, amount, unit }]. Each toBuy item's
 * contribution from `source` is set to that need (created, changed, or taken
 * away), and an item left with nothing asking for it goes. What else asks
 * for an item (added by hand, the other list) is left as it is, and nothing
 * bought (pendingLog, completed) is touched — a need is first reduced by
 * what's been bought and not yet put away. For the plan, the one-meal adds
 * from before ("mealPlanEntry") are the plan's too, and are folded in.
 * Gives back how many items changed.
 */
export async function syncListContributions(source, needs) {
  const owned = (contribution) => contribution.source === source || (source === "plan" && contribution.source === "mealPlanEntry");
  const sameUnit = (a, b) => !unitsConflict(a, b);
  const toBuy = await GroceryItem.find({ status: "toBuy" });
  const bought = await GroceryItem.find({ status: "pendingLog", ingredient: { $ne: null } }).lean();
  const wanted = new Map();
  for (const need of needs) {
    if (!need.ingredient || !(Number(need.amount) > 0)) continue;
    const inBasket = bought.filter((b) => String(b.ingredient) === String(need.ingredient) && sameUnit(b.unit, need.unit)).reduce((sum, b) => sum + (b.quantity ?? 0), 0);
    const amount = round(Number(need.amount) - inBasket);
    if (amount > 0) wanted.set(`${need.ingredient}|${(need.unit ?? "").trim().toLowerCase()}`, { ...need, amount });
  }

  let changed = 0;
  const met = new Set();
  for (const item of toBuy) {
    const key = item.ingredient ? [...wanted.keys()].find((k) => k.startsWith(`${item.ingredient}|`) && sameUnit(item.unit, wanted.get(k).unit) && !met.has(k)) : null;
    const need = key ? wanted.get(key) : null;
    const usable = !!need;
    const had = item.requestedBy.some(owned);
    if (!had && !usable) continue;
    const before = JSON.stringify(item.requestedBy);
    if (usable) seedLegacyContribution(item);
    item.requestedBy = item.requestedBy.filter((c) => !owned(c));
    if (usable) {
      item.requestedBy.push({ source, amount: need.amount });
      if (!item.unit) item.unit = need.unit ?? "";
      met.add(key);
    }
    if (JSON.stringify(item.requestedBy) === before) continue;
    changed += 1;
    if (!item.requestedBy.length) await item.deleteOne();
    else {
      recomputeQuantity(item);
      await item.save();
    }
  }
  for (const [key, need] of wanted) {
    if (met.has(key)) continue;
    await GroceryItem.create({ ingredient: need.ingredient, name: need.name, unit: need.unit ?? "", quantity: need.amount, status: "toBuy", requestedBy: [{ source, amount: need.amount }] });
    changed += 1;
  }
  return changed;
}
