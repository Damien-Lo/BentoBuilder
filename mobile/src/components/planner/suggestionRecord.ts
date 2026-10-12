import { entryName } from "@/src/components/calendar/mealFood";
import { logSuggestionEvent, type MealPlanEntry, type MealSlot } from "@/src/services/mealPlanApi";
import type { Suggestion, Suggestions } from "@/src/utils/recommend";

// The record of what's done with suggestions (see models/SuggestionEvent.js
// on the server): what the weights will one day be fitted to.
//
// The most telling entry is "replaced" — a slot had a suggestion and you
// put something else there. That's only known once the plan comes back with
// the slot filled, by which time the screen that offered it may be gone
// (adding food is a different screen), or it may never have been on a
// screen at all: while you log on the phone planner the suggestions are
// worked out in the background, purely so that what you chose can be set
// against what would have been offered. So the offers outstanding are kept
// here, outside any screen, by "date|slot".

type Outstanding = { offer: Suggestion; rank: number; shown: boolean; suggestions: Suggestions };
const outstanding = new Map<string, Outstanding>();

export type SuggestionAction = "accepted" | "another" | "dismissed" | "replaced" | "side-swapped" | "side-removed" | "side-added";

export function recordSuggestion(
  action: SuggestionAction,
  date: string,
  slot: MealSlot,
  offer: Suggestion,
  rank: number,
  extra: { shown?: boolean; chosen?: { name: string; calories?: number; score?: number; factors?: Record<string, number> }; side?: { sideFrom: string | null; sideTo: string | null } } = {},
) {
  const { chosen, side, shown = true } = extra;
  logSuggestionEvent({
    date,
    slot,
    action,
    shown,
    ...side,
    chosen: chosen?.name,
    ...(chosen?.score != null ? { chosenCalories: Math.round(chosen.calories ?? 0), chosenScore: chosen.score, chosenFactors: chosen.factors } : {}),
    recipe: offer.main.recipe?._id ?? null,
    meal: offer.main.meal?._id ?? null,
    sides: offer.sides.map((d) => d.recipe?._id ?? "").filter(Boolean),
    name: [offer.main, ...offer.sides].map((d) => d.name).join(" + "),
    calories: Math.round(offer.calories),
    rank,
    score: offer.score,
    factors: offer.factors,
  });
}

// The plan as it now stands for `dates`: any outstanding offer whose slot
// has since been filled is settled — recorded as replaced if what's there
// wasn't the suggestion, scored by the suggestions it came from.
export function settleSuggestions(entries: MealPlanEntry[], dates: string[]) {
  for (const [key, was] of outstanding) {
    const [date, slot] = key.split("|") as [string, MealSlot];
    if (!dates.includes(date)) continue;
    const filled = entries.filter((e) => e.date === date && e.slot === slot);
    if (!filled.length) continue;
    outstanding.delete(key);
    if (filled.every((e) => !e.suggested)) {
      recordSuggestion("replaced", date, slot, was.offer, was.rank, { shown: was.shown, chosen: { name: filled.map((e) => entryName(e)).join(" + "), ...was.suggestions.rate(date, slot, filled) } });
    }
  }
}

// What's on offer for the empty slots of `dates` now. Offers worked out in
// the background (`shown` false) never displace ones that were on screen.
export function noteSuggestions(dates: string[], offers: { key: string; offer: Suggestion; rank: number }[], suggestions: Suggestions, shown: boolean) {
  const keep = (key: string) => !shown && outstanding.get(key)?.shown;
  for (const key of [...outstanding.keys()]) {
    if (dates.includes(key.split("|")[0]) && !keep(key)) outstanding.delete(key);
  }
  for (const { key, offer, rank } of offers) {
    if (!keep(key)) outstanding.set(key, { offer, rank, shown, suggestions });
  }
}
