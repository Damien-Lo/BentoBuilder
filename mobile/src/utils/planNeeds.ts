import type { Ingredient } from "@/src/services/ingredientApi";
import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { PantryItem } from "@/src/types/pantry";

import { countQualifyingPantryPieces, getIngredientStockInUnit } from "./ingredientStock";
import { gatherRows, recipeLineToRow, type RawRow } from "./pantryDeduction";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";

// What the plan needs doing before it can be eaten.
//
// The meal plan is the only thing anyone commits to. From it and the pantry
// this works out, fresh every time, two lists:
//
//   prep   things you make ahead — an ingredient with a recipe that
//          produces it (a vacuum-sealed fillet, a stock) that the plan needs
//          more of than is in stock;
//   buy    plain ingredients the plan (or that prepping) needs and the
//          pantry is short of.
//
// Nothing here is stored. Change the plan or the pantry and the lists
// change with them — which is what lets a recommender or a change of mind
// rewrite the plan without anything downstream being left wrong.
//
// The meals are taken in date order, each claiming stock before the next,
// so two dinners that both want the last of something don't both count it.
// What's in date on the meal's day is used first, soonest to expire first.
// Stock that will be past its date by then still counts — a pantry's dates
// are estimates, and often out of date themselves — but the meal is listed
// under `checks`, to look at before relying on it. That goes for the freezer
// too: a frozen entry's date is its freezer date, and it can pass.
// (Unlike the planner's per-meal "add missing to grocery list", which
// looks at one meal alone.)

// A prep session or shopping trip from the Kitchen calendar, today or later.
export interface KitchenSession {
  // (One occurrence of a repeating session: its event and its day.)
  id: string;
  eventId: string;
  kind: "prep" | "shop";
  date: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
}

export interface NeedSource {
  date: string;
  label: string;
  // The planned meal itself.
  entryId?: string;
  // The pantry entries the meal would take first, where it has a choice
  // (MealPlanEntry.sizedTo: the piece it's counted at).
  prefer?: string[];
}

export interface PrepNeed {
  ingredientId: string;
  name: string;
  recipeId: string;
  recipeName: string;
  // How much more of it the plan needs, in the ingredient's own unit.
  amount: number;
  unit: string;
  // The same, as runs of its recipe (1.5 = one and a half batches).
  batches: number;
  // The first day something needs it.
  neededBy: string;
  for: NeedSource[];
  // The prep session to make it in — the last one on or before the day
  // it's needed — or null when there's none in time.
  session: string | null;
}

export interface BuyNeed {
  ingredientId: string;
  name: string;
  amount: number;
  unit: string;
  // Whole pieces (2 fillets) rather than a measured amount.
  pieces: boolean;
  // The day it has to be in the house: the meal's, or the prep session's
  // when it's for something made ahead.
  neededBy: string;
  for: NeedSource[];
  // The shopping trip to get it on, or null when there's none in time.
  session: string | null;
}

// Stock a meal is counting on that will be past its date by then.
export interface StockCheck {
  ingredientId: string;
  name: string;
  // The date on the oldest of it.
  expired: string;
  // The first day something needs it.
  neededBy: string;
  for: NeedSource[];
}

// Something the kitchen needs doing on a day: a shopping trip or prep
// session that's booked, something to take out of the freezer in time,
// something a recipe says to start early, something to use before it goes.
// Worked out, never stored: each is done by the thing itself changing (the
// entry is moved to the fridge, the item is bought), after which it's gone.
export interface KitchenTask {
  id: string;
  kind: "shop" | "prep" | "thaw" | "freeze" | "ahead" | "use";
  // The day to do it, and the time of day where it has one.
  date: string;
  minutes?: number;
  title: string;
  detail: string;
  // Should already have been done (frozen, and the meal is today).
  late?: boolean;
  // thaw, the first time for an ingredient: it isn't known yet whether
  // it's thawed or cooked from frozen — the task asks.
  asks?: boolean;
  // What it's about.
  pantryItemId?: string;
  ingredientId?: string;
  recipeId?: string;
  sessionId?: string;
  // thaw: the other frozen entries of the same thing, should a different
  // one have come out.
  others?: { pantryItemId: string; label: string }[];
  // thaw / use: how much, and the day it's wanted or dated.
  amount?: number;
  unit?: string;
  by?: string;
  for?: NeedSource[];
}

// Something wrong with the plan as it stands, to be put right by changing
// the plan, the calendar or the pantry.
export interface KitchenIssue {
  id: string;
  kind: "no-trip" | "no-prep" | "prep-over" | "past-date" | "thaw-late";
  // Which side of the kitchen it belongs to.
  about: "buy" | "prep" | "pantry";
  title: string;
  detail: string;
  // The first day it bites.
  date: string;
  count: number;
  sessionId?: string;
}

// When a meal is, for working back from, where nothing more exact is known.
const SLOT_MINUTES: Record<string, number> = { breakfast: 7 * 60 + 30, lunch: 12 * 60, dinner: 19 * 60, snack: 15 * 60 + 30 };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Thu 15 Oct".
const dayLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};
const shiftDay = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// How many days before it's cooked an ingredient comes out of the freezer.
// Never asked: the evening before, until what's been done says otherwise —
// the middle of the last few times it was eaten out of the freezer (how
// long it had thawed, or 0 if it hadn't; Ingredient.thawLeads, noted as
// meals are eaten). 0 is "cooked from frozen", which can also be said
// outright on the thaw task.
export function thawLead(ingredient: Ingredient): number {
  if (ingredient.cooksFromFrozen != null) return ingredient.cooksFromFrozen ? 0 : Math.max(1, middle(ingredient.thawLeads ?? []) ?? 1);
  const leads = ingredient.thawLeads ?? [];
  return leads.length >= 2 ? middle(leads)! : 1;
}
const middle = (days: number[]) => (days.length ? [...days].sort((a, b) => a - b)[Math.floor(days.length / 2)] : null);

const idOf = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "object" && value !== null && "_id" in value ? String((value as { _id?: unknown })._id ?? "") : "";

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

function entryLabel(entry: MealPlanEntry): string {
  return entry.meal?.name ?? entry.recipe?.name ?? entry.ingredient?.name ?? "A meal";
}

export function computePlanNeeds(
  // The meals still to come (planned, not yet eaten).
  entries: MealPlanEntry[],
  recipes: Recipe[],
  ingredients: Ingredient[],
  pantryItems: PantryItem[],
  globalConversions: CustomUnitConversion[],
  // The sessions still to come; without any, everything is unscheduled.
  sessions: KitchenSession[] = [],
  // Given, the kitchen's tasks and issues are worked out too.
  today?: string,
): { prep: PrepNeed[]; buy: BuyNeed[]; checks: StockCheck[]; tasks: KitchenTask[]; issues: KitchenIssue[] } {
  // The last session of a kind on or before `date`.
  const sessionBy = (kind: KitchenSession["kind"], date: string) =>
    sessions
      .filter((s) => s.kind === kind && s.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startMinutes - a.startMinutes)[0] ?? null;

  const recipeMap = new Map(recipes.map((r) => [r._id, r]));
  const ingredientMap = new Map(ingredients.map((i) => [i._id, i]));
  // What's left of each ingredient after the meals so far have claimed
  // theirs, lot by lot (a pantry entry each, soonest to expire first): an
  // amount in the ingredient's own unit, or one usable piece.
  type Lot = { expires: string | null; amount: number; item: PantryItem };
  // Frozen entries the plan draws on: how much, in what, and for when.
  const thawing = new Map<string, { item: PantryItem; amount: number; unit: string; by: string; for: NeedSource[] }>();
  // Fresh entries the plan draws on that will be past their date by then.
  const freezing = new Map<string, { item: PantryItem; by: string; for: NeedSource[] }>();
  const inFreezer = (item: PantryItem) => /freez/i.test(typeof item.storageLocation === "object" && item.storageLocation ? (item.storageLocation.name ?? "") : "");
  const left = new Map<string, Lot[]>();
  const checks = new Map<string, StockCheck>();
  // A pantry entry as told from the others of its kind: by the piece it
  // was made from, or its own weight when it is one.
  const entryName = (item: PantryItem, own: Ingredient) => {
    const from = item.madeFrom?.[0];
    if (from) return `the ${own.name} from ${Math.round(from.amount)} ${from.unit}`;
    return own.pieceLabel ? `the ${Math.round(item.quantityAvailable ?? 0)} ${item.quantityUnit} ${own.name}` : own.name;
  };
  const idOfItem = (item: PantryItem) => (typeof item.ingredient === "string" ? item.ingredient : (item.ingredient?._id ?? ""));
  // An ingredient's own pantry entries, and those of its branded variants.
  const entriesOf = (ing: Ingredient) => {
    const family = new Set([ing._id, ...(ing.isGeneric ? ingredients.filter((i) => idOf(i.genericParent) === ing._id).map((i) => i._id) : [])]);
    return pantryItems.filter((item) => (item.quantityAvailable ?? 0) > 0 && family.has(idOfItem(item)));
  };
  const lots = (key: string, ing: Ingredient, measure: (item: PantryItem) => number) => {
    if (!left.has(key)) {
      left.set(
        key,
        entriesOf(ing)
          .map((item) => ({ expires: item.expiryDate ? item.expiryDate.slice(0, 10) : null, amount: measure(item), item }))
          .filter((lot) => lot.amount > 0)
          .sort((a, b) => (a.expires ?? "9").localeCompare(b.expires ?? "9")),
      );
    }
    return left.get(key)!;
  };
  // Takes up to `wanted`: first from what's good on `due`, then from what
  // will be past its date by then — noting the meal as one to check.
  const claim = (from: Lot[], wanted: number, due: string, ing: Ingredient, source: NeedSource, unit: string) => {
    let got = 0;
    const good = (lot: Lot) => !lot.expires || lot.expires >= due;
    const first = (lot: Lot) => (source.prefer?.includes(lot.item._id) ? 0 : 1);
    const order = source.prefer?.length ? [...from].sort((a, b) => first(a) - first(b)) : from;
    for (const pass of [true, false]) {
      for (const lot of order) {
        if (got >= wanted - 1e-9) return got;
        if (good(lot) !== pass || lot.amount <= 0) continue;
        const take = Math.min(lot.amount, wanted - got);
        lot.amount -= take;
        got += take;
        if (today && take > 0 && inFreezer(lot.item)) {
          const out = thawing.get(lot.item._id) ?? { item: lot.item, amount: 0, unit, by: due, for: [] };
          thawing.set(lot.item._id, out);
          out.amount += take;
          if (due < out.by) out.by = due;
          if (!out.for.some((f) => f.date === source.date && f.label === source.label)) out.for.push(source);
        }
        // Still good now, but not by the day it's wanted: into the freezer
        // with it while it is (then it's thawed for the day like the rest).
        if (!pass && today && !inFreezer(lot.item) && lot.expires! >= today) {
          const out = freezing.get(lot.item._id) ?? { item: lot.item, by: due, for: [] };
          freezing.set(lot.item._id, out);
          if (due < out.by) out.by = due;
          if (!out.for.some((f) => f.date === source.date && f.label === source.label)) out.for.push(source);
        }
        if (!pass) {
          const check = checks.get(ing._id) ?? { ingredientId: ing._id, name: ing.name, expired: lot.expires!, neededBy: due, for: [] };
          checks.set(ing._id, check);
          if (lot.expires! < check.expired) check.expired = lot.expires!;
          if (due < check.neededBy) check.neededBy = due;
          if (!check.for.some((f) => f.date === source.date && f.label === source.label)) check.for.push(source);
        }
      }
    }
    return got;
  };
  const prep = new Map<string, PrepNeed>();
  const buy = new Map<string, BuyNeed>();

  const note = <T extends { amount: number; neededBy: string; for: NeedSource[] }>(need: T, amount: number, source: NeedSource, due: string) => {
    need.amount += amount;
    if (due < need.neededBy) need.neededBy = due;
    if (!need.for.some((f) => f.date === source.date && f.label === source.label)) need.for.push(source);
  };

  // `due` is the day the ingredient has to be on hand: the meal's day, or
  // the prep session's for what goes into something made ahead.
  function require(row: RawRow, source: NeedSource, due: string, making: Set<string>) {
    const ing = ingredientMap.get(row.ingredientId);
    if (!ing || ing.isAlwaysAvailable || !(row.quantity > 0)) return;
    const conversions = getIngredientConversions(ing, globalConversions, ingredients);

    if (row.matchMode === "wholePiece") {
      const key = `${ing._id}|pieces|${row.pieceMinWeight}|${row.pieceMaxWeight}|${row.pieceWeightUnit}`;
      // (Each pantry entry is one piece, if it's the right size.)
      const pieces = lots(key, ing, (item) => countQualifyingPantryPieces(ing, row.pieceMinWeight ?? 0, row.pieceMaxWeight ?? Infinity, row.pieceWeightUnit ?? "g", ingredients, [item], globalConversions));
      const short = row.quantity - claim(pieces, row.quantity, due, ing, source, row.unit || ing.pieceLabel || "piece");
      if (short > 0) {
        const trip = sessionBy("shop", due);
        const needKey = `${key}|${trip?.id}`;
        const need = buy.get(needKey) ?? { ingredientId: ing._id, name: ing.name, amount: 0, unit: row.unit || ing.pieceLabel || "piece", pieces: true, neededBy: due, for: [], session: trip?.id ?? null };
        buy.set(needKey, need);
        note(need, short, source, due);
      }
      return;
    }

    // A measured amount, in the ingredient's own unit where it converts.
    const native = ing.defaultPortionUnit || row.unit;
    const converted = convertUnits(row.quantity, row.unit, native, conversions);
    const unit = converted == null ? row.unit : native;
    const needed = converted ?? row.quantity;
    const key = `${ing._id}|${unit}`;
    const stock = lots(key, ing, (item) => getIngredientStockInUnit(ing, unit, ingredients, [item], globalConversions));
    const short = needed - claim(stock, needed, due, ing, source, unit);
    if (short <= 1e-6) return;

    const recipe = recipeMap.get(idOf(ing.productionRecipe));
    if (recipe && !making.has(recipe._id) && unit === native) {
      // Something you make. What making that much of it takes is needed
      // in turn — and, when it's made ahead, it goes on the prep list and
      // its ingredients are needed by the session it's made in. (Rice
      // cooked at the meal isn't prep: only its ingredients count.)
      const batchYield = (recipe.servings || 1) * (ing.defaultPortionAmount || 1);
      let madeOn = due;
      if (recipe.madeAhead) {
        const session = sessionBy("prep", due);
        const needKey = `${ing._id}|${session?.id}`;
        const need = prep.get(needKey) ?? { ingredientId: ing._id, name: ing.name, recipeId: recipe._id, recipeName: recipe.name, amount: 0, unit, batches: 0, neededBy: due, for: [], session: session?.id ?? null };
        prep.set(needKey, need);
        note(need, short, source, due);
        need.batches = need.amount / batchYield;
        madeOn = session?.date ?? due;
      }
      const inside = new Set(making).add(recipe._id);
      for (const line of recipe.ingredientList) {
        if (idOf(line.ingredient)) require(recipeLineToRow(line, short / batchYield), source, madeOn, inside);
      }
      return;
    }

    const trip = sessionBy("shop", due);
    const needKey = `${key}|${trip?.id}`;
    const need = buy.get(needKey) ?? { ingredientId: ing._id, name: ing.name, amount: 0, unit, pieces: false, neededBy: due, for: [], session: trip?.id ?? null };
    buy.set(needKey, need);
    note(need, short, source, due);
  }

  const inOrder = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9));
  for (const entry of inOrder) {
    const source: NeedSource = { date: entry.date, label: entryLabel(entry), entryId: entry._id || undefined, prefer: entry.sizedTo?.claims };
    for (const row of gatherRows(entry, recipeMap)) require(row, source, entry.date, new Set());
  }

  const soonest = <T extends { neededBy: string; name: string }>(list: T[]) => list.sort((a, b) => a.neededBy.localeCompare(b.neededBy) || a.name.localeCompare(b.name));
  const needs = { prep: soonest([...prep.values()]), buy: soonest([...buy.values()]), checks: soonest([...checks.values()]) };
  if (!today) return { ...needs, tasks: [], issues: [] };

  // --- What that leaves to do, and what's wrong ---
  const tasks: KitchenTask[] = [];
  const issues: KitchenIssue[] = [];
  const names = (list: { name: string }[]) => `${list.slice(0, 3).map((n) => n.name).join(", ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}`;

  // The booked sessions, each with what falls to it.
  for (const session of sessions) {
    const rows = session.kind === "shop" ? needs.buy.filter((n) => n.session === session.id) : needs.prep.filter((n) => n.session === session.id);
    tasks.push({
      id: `${session.kind}:${session.id}`,
      kind: session.kind,
      date: session.date,
      minutes: session.startMinutes,
      title: session.kind === "shop" ? "Shopping trip" : "Prep session",
      detail: rows.length ? (session.kind === "shop" ? `${rows.length} thing${rows.length === 1 ? "" : "s"} to get: ${names(rows)}` : `To make: ${names(rows.map((r) => ({ name: (r as PrepNeed).recipeName })))}`) : session.kind === "shop" ? "Nothing on the list for it yet" : "Nothing falls to it yet",
      sessionId: session.id,
    });
    // A prep session with more to make than it has time for.
    if (session.kind === "prep") {
      const minutes = (rows as PrepNeed[]).reduce((sum, need) => {
        const recipe = recipeMap.get(need.recipeId);
        return sum + ((recipe?.prepTimeMinutes ?? 0) + (recipe?.cookTimeMinutes ?? 0)) * Math.max(1, Math.ceil(need.batches - 0.01));
      }, 0);
      const length = session.endMinutes - session.startMinutes;
      if (minutes > length) {
        issues.push({ id: `prep-over:${session.id}`, kind: "prep-over", about: "prep", title: "A prep session is over-full", detail: `About ${minutes} min of prep in a ${length} min session`, date: session.date, count: rows.length, sessionId: session.id });
      }
    }
  }

  // Out of the freezer as long before as it usually is (the evening before,
  // until that's known) — unless it's cooked from frozen.
  for (const out of thawing.values()) {
    const own = ingredientMap.get(idOfItem(out.item));
    if (!own) continue;
    const lead = thawLead(own);
    if (!lead) continue;
    const late = shiftDay(out.by, -lead) < today;
    tasks.push({
      id: `thaw:${out.item._id}`,
      kind: "thaw",
      date: late ? today : shiftDay(out.by, -lead),
      title: `Take ${entryName(out.item, own)} out of the freezer`,
      others: pantryItems
        .filter((p) => p._id !== out.item._id && idOfItem(p) === own._id && (p.quantityAvailable ?? 0) > 0 && inFreezer(p) && !thawing.has(p._id))
        .map((p) => ({ pantryItemId: p._id, label: p.madeFrom?.[0] ? `From ${Math.round(p.madeFrom[0].amount)} ${p.madeFrom[0].unit}` : `${Math.round(p.quantityAvailable ?? 0)} ${p.quantityUnit}` })),
      detail: `${needAmountLabel(out.amount, out.unit)} for ${out.for[0]?.label ?? "a meal"}`,
      late,
      asks: own.cooksFromFrozen == null,
      pantryItemId: out.item._id,
      ingredientId: own._id,
      amount: out.amount,
      unit: out.unit,
      by: out.by,
      for: out.for,
    });
  }
  const lateThaws = tasks.filter((t) => t.kind === "thaw" && t.late);
  if (lateThaws.length) {
    issues.push({ id: "thaw-late", kind: "thaw-late", about: "pantry", title: "Still in the freezer, and should be out", detail: lateThaws.map((t) => t.title.replace(/^Take | out of the freezer$/g, "")).join(", "), date: today, count: lateThaws.length });
  }

  // What a recipe says to start early.
  for (const entry of inOrder) {
    const ahead = entry.recipe?.startAhead;
    if (!entry.recipe || !ahead?.hours || ahead.hours <= 0) continue;
    const at = (SLOT_MINUTES[entry.slot] ?? 12 * 60) - Math.round(ahead.hours * 60);
    const daysBack = at < 0 ? Math.ceil(-at / 1440) : 0;
    tasks.push({
      id: `ahead:${entry._id}`,
      kind: "ahead",
      date: shiftDay(entry.date, -daysBack),
      minutes: at + daysBack * 1440,
      title: ahead.note || `Start ${entry.recipe.name}`,
      detail: `for ${entry.recipe.name}`,
      recipeId: entry.recipe._id,
      by: entry.date,
    });
  }

  // Wanted after its date: freeze it before then.
  for (const out of freezing.values()) {
    const own = ingredientMap.get(idOfItem(out.item));
    if (!own) continue;
    const expires = out.item.expiryDate!.slice(0, 10);
    tasks.push({
      id: `freeze:${out.item._id}`,
      kind: "freeze",
      // (The day before it goes, or today if that's already here.)
      date: expires > today ? shiftDay(expires, -1) : today,
      title: `Freeze ${entryName(out.item, own)}`,
      detail: `good until ${expires === today ? "today" : dayLabel(expires)}, and it's for ${out.for[0]?.label ?? "a meal"} on ${dayLabel(out.by)}`,
      pantryItemId: out.item._id,
      ingredientId: own._id,
      by: out.by,
      for: out.for,
    });
  }

  // About to go, with nothing planned that uses it up: use it or freeze it.
  // (Only what's been thawed, or bought in the last three weeks — an old
  // entry's date says more about the pantry's upkeep than about the food.)
  const spoken = new Set([...left.values()].flatMap((list) => list.filter((lot) => lot.amount <= 1e-9).map((lot) => lot.item._id)));
  const horizon = shiftDay(today, 2);
  const recent = shiftDay(today, -21);
  for (const item of pantryItems) {
    const expires = item.expiryDate?.slice(0, 10);
    if (!expires || expires < today || expires > horizon || (item.quantityAvailable ?? 0) <= 0 || spoken.has(item._id) || inFreezer(item)) continue;
    const thawed = (item.moves ?? []).some((m) => m.kind === "thawed");
    if (!thawed && (item.purchaseDate ?? "").slice(0, 10) < recent) continue;
    const own = ingredientMap.get(idOfItem(item));
    if (!own || own.isAlwaysAvailable) continue;
    tasks.push({ id: `use:${item._id}`, kind: "use", date: today, title: `Use or freeze ${own.name}`, detail: thawed ? "thawed, and near its date" : "near its date, and nothing planned uses it up", pantryItemId: item._id, ingredientId: own._id, amount: item.quantityAvailable, unit: item.quantityUnit, by: expires });
  }

  // What can't happen as things stand.
  const noTrip = needs.buy.filter((n) => !n.session);
  if (noTrip.length) issues.push({ id: "no-trip", kind: "no-trip", about: "buy", title: `${noTrip.length} thing${noTrip.length === 1 ? "" : "s"} needed before any shopping trip`, detail: names(noTrip), date: noTrip[0].neededBy, count: noTrip.length });
  const noPrep = needs.prep.filter((n) => !n.session);
  if (noPrep.length) issues.push({ id: "no-prep", kind: "no-prep", about: "prep", title: `${noPrep.length} thing${noPrep.length === 1 ? "" : "s"} to make with no prep session in time`, detail: names(noPrep.map((n) => ({ name: n.recipeName }))), date: noPrep[0].neededBy, count: noPrep.length });
  // (What can still be frozen in time is a task, not something wrong.)
  const toFreeze = new Set([...freezing.values()].map((out) => idOfItem(out.item)));
  const pastDate = needs.checks.filter((check) => !toFreeze.has(check.ingredientId));
  if (pastDate.length) issues.push({ id: "past-date", kind: "past-date", about: "pantry", title: `${pastDate.length} thing${pastDate.length === 1 ? "" : "s"} in the pantry past ${pastDate.length === 1 ? "its" : "their"} date`, detail: names(pastDate), date: pastDate[0].neededBy, count: pastDate.length });

  tasks.sort((a, b) => a.date.localeCompare(b.date) || (a.minutes ?? 0) - (b.minutes ?? 0));
  issues.sort((a, b) => a.date.localeCompare(b.date));
  return { ...needs, tasks, issues };
}

// "1.5 tbsp", "2 fillets", "350 g": an amount short enough to read in a list.
export function needAmountLabel(amount: number, unit: string): string {
  const rounded = amount >= 100 ? Math.round(amount) : amount >= 10 ? Math.round(amount * 10) / 10 : Math.round(amount * 100) / 100;
  return `${rounded} ${unit}${rounded !== 1 && /^(fillet|steak|piece|bag|item|egg|stalk|sheet|cutlet|package|pack|count|bulb|sprig)$/.test(unit) ? "s" : ""}`;
}

// The Kitchen calendar's sessions among a range of event occurrences.
export function kitchenSessions(occurrences: { _id: string; title: string; kitchenKind?: "prep" | "shop" | null; occurrenceDate: string; startMinutes: number; endMinutes: number }[], today: string): KitchenSession[] {
  return occurrences
    .filter((e) => !!e.kitchenKind && e.occurrenceDate >= today)
    .map((e) => ({ id: `${e._id}|${e.occurrenceDate}`, eventId: e._id, kind: e.kitchenKind!, date: e.occurrenceDate, startMinutes: e.startMinutes, endMinutes: e.endMinutes, title: e.title }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);
}
