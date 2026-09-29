import { API_BASE_URL } from "@/src/config/api";

// When the planner auto-asks "How was it?" after something is logged as
// eaten. Swiping to rate, or rating from an item's own page, is always
// available — this only decides the automatic prompt.

export interface RatingPromptState {
  skipCount?: number; // skips in a row, reset by a real rating
  lastSkippedAt?: string | null;
  disabled?: boolean; // "Don't ask about this"
}

interface RatableItem {
  name?: string;
  scores?: { value: number; ratedAt: string }[];
  ratingPrompt?: RatingPromptState;
  // Recipes only: last time what goes in it changed.
  contentChangedAt?: string | null;
  // Ingredients only: its category, to leave out supplements and water.
  category?: string | { name?: string } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Wait this long after the last rating before asking again...
const COOLDOWN_DAYS = 10;
// ...or this long once the last few ratings agree (another one adds little).
const SETTLED_COOLDOWN_DAYS = 30;
const SETTLED_RATINGS = 3; // how many recent ratings must agree
const SETTLED_SPREAD = 1; // agree = within this many points of each other
// After this many skips in a row, back off for much longer.
const SKIP_LIMIT = 2;
const SKIP_BACKOFF_DAYS = 60;

// Things that aren't worth rating as a meal.
const NEVER_ASK_CATEGORY = /supplement|vitamin/i;
const NEVER_ASK_NAME = /^water$/i;

function daysSince(iso: string | null | undefined, now: number): number {
  if (!iso) return Infinity;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? Infinity : (now - time) / DAY_MS;
}

export function shouldAutoPromptRating(item: RatableItem | null | undefined, now = Date.now()): boolean {
  if (!item) return false;
  const prompt = item.ratingPrompt ?? {};
  if (prompt.disabled) return false;

  const categoryName = typeof item.category === "object" ? item.category?.name ?? "" : "";
  if (NEVER_ASK_CATEGORY.test(categoryName) || NEVER_ASK_NAME.test(item.name?.trim() ?? "")) return false;

  const scores = [...(item.scores ?? [])].sort(
    (a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime(),
  );
  const recent = scores.slice(0, SETTLED_RATINGS);
  const settled =
    recent.length === SETTLED_RATINGS &&
    Math.max(...recent.map((s) => s.value)) - Math.min(...recent.map((s) => s.value)) <= SETTLED_SPREAD;
  const cooldown = settled ? SETTLED_COOLDOWN_DAYS : COOLDOWN_DAYS;

  // Skipped recently: hold off (much longer after several skips in a row).
  const skipCount = prompt.skipCount ?? 0;
  if (skipCount > 0) {
    const backoff = skipCount >= SKIP_LIMIT ? SKIP_BACKOFF_DAYS : cooldown;
    if (daysSince(prompt.lastSkippedAt, now) < backoff) return false;
  }

  const last = scores[0];
  if (!last) return true; // never rated
  if (item.contentChangedAt && new Date(item.contentChangedAt) > new Date(last.ratedAt)) return true; // changed since
  return daysSince(last.ratedAt, now) >= cooldown;
}

export type RatingPromptAction = "skip" | "disable" | "enable";

// Records a skipped prompt, or turns the auto prompt off/on for one item.
export async function updateRatingPrompt(
  kind: "recipe" | "ingredient",
  id: string,
  action: RatingPromptAction,
): Promise<RatingPromptState> {
  const response = await fetch(
    `${API_BASE_URL}/api/${kind === "recipe" ? "recipes" : "ingredients"}/${id}/rating-prompt`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) },
  );
  const result = (await response.json()) as { success: boolean; data?: RatingPromptState; message?: string };
  if (!response.ok || !result.success) throw new Error(result.message ?? "Couldn't update the rating prompt.");
  return result.data ?? {};
}
