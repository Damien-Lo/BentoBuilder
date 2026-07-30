// Suggests a default storage location / expiry duration for an ingredient
// from its own recent pantry history — used anywhere a new pantry entry is
// logged (ingredient edit quick-add, add-to-pantry, grocery-list log-to-
// pantry) so all three stay consistent.

import type { PantryItem } from "@/src/types/pantry";
import { daysBetweenDateOnly, daysToNiceDuration, type DurationUnit } from "@/src/utils/date";

export const PANTRY_HISTORY_WINDOW = 20;

export interface SuggestedStorageLocation {
  id: string;
  name: string;
}

export interface SuggestedStore {
  id: string;
  name: string;
}

export interface SuggestedExpiryDuration {
  amount: number;
  unit: DurationUnit;
}

export function referenceId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    const id = (value as { _id?: unknown })._id;
    return typeof id === "string" ? id : "";
  }
  return "";
}

export function referenceName(value: unknown): string {
  if (typeof value === "object" && value !== null && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

/** The N most recently logged entries (by creation time), newest first. */
export function recentPantryEntries(
  entries: PantryItem[],
  windowSize: number = PANTRY_HISTORY_WINDOW,
): PantryItem[] {
  return [...entries]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, windowSize);
}

/** The most frequently used storage location across the given entries. */
export function suggestStorageLocation(
  entries: PantryItem[],
): SuggestedStorageLocation | null {
  const counts = new Map<string, { name: string; count: number }>();

  for (const entry of entries) {
    const id = referenceId(entry.storageLocation);
    if (!id) continue;

    const existing = counts.get(id);
    counts.set(id, {
      name: referenceName(entry.storageLocation) || existing?.name || "",
      count: (existing?.count ?? 0) + 1,
    });
  }

  let best: { id: string; name: string; count: number } | null = null;
  for (const [id, { name, count }] of counts) {
    if (!best || count > best.count) {
      best = { id, name, count };
    }
  }

  return best ? { id: best.id, name: best.name } : null;
}

/** The most frequently bought-from store across the given entries. */
export function suggestStore(entries: PantryItem[]): SuggestedStore | null {
  const counts = new Map<string, { name: string; count: number }>();

  for (const entry of entries) {
    const id = referenceId(entry.store);
    if (!id) continue;

    const existing = counts.get(id);
    counts.set(id, {
      name: referenceName(entry.store) || existing?.name || "",
      count: (existing?.count ?? 0) + 1,
    });
  }

  let best: { id: string; name: string; count: number } | null = null;
  for (const [id, { name, count }] of counts) {
    if (!best || count > best.count) {
      best = { id, name, count };
    }
  }

  return best ? { id: best.id, name: best.name } : null;
}

/**
 * Average expiry duration (purchaseDate -> expiryDate) across the given
 * entries that have both dates set, rounded to the nearest whole unit.
 */
export function suggestExpiryDuration(
  entries: PantryItem[],
): SuggestedExpiryDuration | null {
  const days = entries
    .map((entry) => daysBetweenDateOnly(entry.purchaseDate, entry.expiryDate))
    .filter((value): value is number => value != null && value > 0);

  if (days.length === 0) return null;

  const avgDays = days.reduce((sum, value) => sum + value, 0) / days.length;
  return daysToNiceDuration(avgDays);
}
