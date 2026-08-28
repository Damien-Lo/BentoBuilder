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
 * Manual adds accumulate on repeat (adding 1 more egg twice means 2 total),
 * unlike the meal-plan case above, which replaces — a manual add is "more of
 * this," not a refreshed total. Items with no linked ingredient (free-text,
 * e.g. "paper towels") have no dedupe key, so they always create a fresh row,
 * matching the existing behavior for unlinked items.
 */
export async function upsertManualContribution({ ingredient, name, amount, unit }) {
  const roundedAmount = amount != null && Number.isFinite(amount) && amount > 0 ? round(amount) : null;

  if (!ingredient) {
    return GroceryItem.create({
      ingredient: null,
      name,
      quantity: roundedAmount,
      unit: unit || "",
      requestedBy: roundedAmount != null ? [{ source: "manual", amount: roundedAmount }] : [],
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
      requestedBy: roundedAmount != null ? [{ source: "manual", amount: roundedAmount }] : [],
    });
  }

  seedLegacyContribution(item);

  if (roundedAmount != null) {
    const existingManual = item.requestedBy.find((contribution) => contribution.source === "manual");
    if (existingManual) {
      existingManual.amount = round(existingManual.amount + roundedAmount);
    } else {
      item.requestedBy.push({ source: "manual", amount: roundedAmount });
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
