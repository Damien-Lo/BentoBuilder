import AsyncStorage from "@react-native-async-storage/async-storage";

import { todayStr } from "@/src/utils/mealPlan";

// Answers from the server, shared and kept a short while, so the app isn't
// waiting on the same thing twice. Opening a screen used to send the same
// requests several times over (the profile five times, the ingredient list
// twice), all at once.
//
//   - The same request already on its way is shared, not sent again.
//   - An answer is kept for REMEMBER_MS, for the next screen that asks.
//   - Any change sent to the server (anything but a GET) forgets them all,
//     so nothing shown is older than the person's own last change.
//   - Only lists and records are kept (REMEMBERED) — never something being
//     watched for a change (a photo the phone is taking, a receipt being
//     read, signing in).
//
// It also learns which of them this device asks for (with dates kept
// relative to today: "this week", "next week"), so that the next time the
// app starts they can be fetched up front, behind a short loading screen
// (preload), and screens open already filled in.

const REMEMBER_MS = 20_000;
// (Fetched up front: kept until first used, within this.)
const PRELOAD_MS = 120_000;

const REMEMBERED = [
  /^\/api\/(ingredients|recipes|meals|restaurant-meals|pantry|profile|storage-locations|stores|brands|categories|tags|recipe-categories|menu|usual-meals|grocery-list|weight-entries)(\?|$)/,
  /^\/api\/meal-plan\/(range|last-used|last-entries)(\?|$)/,
  /^\/api\/calendar\/(events|calendars|meal-times)(\?|$)/,
  /^\/api\/todo\/(calendar|dashboard|overview|tasks)(\?|$)/,
];
export const remembered = (path: string) => REMEMBERED.some((pattern) => pattern.test(path));

interface Answer {
  status: number;
  contentType: string;
  text: string;
}
const kept = new Map<string, { until: number; answer: Promise<Answer> }>();

const asResponse = (answer: Answer) => new Response(answer.text, { status: answer.status, headers: { "Content-Type": answer.contentType } });

// A GET to the server, by its path ("/api/…?…"): shared or kept if it can be.
export async function rememberedFetch(path: string, send: () => Promise<Response>, keepFor = REMEMBER_MS): Promise<Response> {
  learn(path);
  const now = Date.now();
  const hit = kept.get(path);
  if (hit && hit.until > now) return asResponse(await hit.answer);

  const answer = send().then(async (response) => ({ status: response.status, contentType: response.headers.get("Content-Type") ?? "application/json", text: await response.text() }));
  kept.set(path, { until: now + keepFor, answer });
  try {
    const result = await answer;
    // (Only a good answer is kept.)
    if (result.status !== 200 && kept.get(path)?.answer === answer) kept.delete(path);
    return asResponse(result);
  } catch (error) {
    if (kept.get(path)?.answer === answer) kept.delete(path);
    throw error;
  }
}

// Forgets everything kept: after a change, or when someone else signs in.
export function forgetAnswers() {
  kept.clear();
}

// --- Learning what this device asks for, to fetch it up front next time ---

const LEARNED_KEY = "orbit.preload";
const MAX_LEARNED = 30;
// (Only what's asked for while the app is starting up, and in the first
// screens after — not every corner visited.)
const LEARN_FOR_MS = 60_000;
const DAY = 24 * 60 * 60 * 1000;

let learning = true;
let learned: Map<string, number> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Today as a date, at midnight, for counting days from.
const dayNumber = (date: string) => Math.round(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY);
const dateOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

// "/api/meal-plan/range?from=2026-10-13&to=2026-10-25" → "…from={-6}&to={6}"
// (days from today), so it means the same thing tomorrow.
function template(path: string) {
  const today = dayNumber(todayStr());
  return path.replace(/=(\d{4}-\d{2}-\d{2})(?=&|$)/g, (_, date: string) => `={${dayNumber(date) - today}}`);
}
function expand(pattern: string) {
  const today = dayNumber(todayStr());
  return pattern.replace(/\{(-?\d+)\}/g, (_, offset: string) => dateOf(today + Number(offset)));
}

async function loadLearned() {
  if (learned) return learned;
  learned = new Map();
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(LEARNED_KEY)) ?? "[]") as [string, number][];
    for (const [pattern, at] of saved) learned.set(pattern, at);
  } catch {
    // (Nothing learned yet.)
  }
  return learned;
}

function learn(path: string) {
  if (!learning) return;
  void loadLearned().then((map) => {
    map.set(template(path), Date.now());
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const recent = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LEARNED);
      void AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(recent)).catch(() => {});
    }, 2000);
  });
}

// What a device that hasn't learned anything yet starts with.
const STARTER = [
  "/api/profile",
  "/api/pantry",
  "/api/recipes",
  "/api/ingredients",
  "/api/grocery-list",
  "/api/menu",
  "/api/storage-locations",
  "/api/meal-plan/range?from={-7}&to={13}&today={0}",
];

// Fetches, up front, what this device usually asks for when it starts —
// at most a few at a time. `onProgress(done, total)` as they arrive. It
// resolves when they're all in (or failed: a screen will just ask again).
export async function preload(onProgress?: (done: number, total: number) => void) {
  learning = true;
  setTimeout(() => {
    learning = false;
  }, LEARN_FOR_MS);
  const map = await loadLearned();
  const patterns = map.size ? [...map.keys()] : STARTER;
  const paths = [...new Set(patterns.map(expand))].filter(remembered);
  let done = 0;
  onProgress?.(0, paths.length);
  const queue = [...paths];
  const worker = async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      await fetchPath(path).catch(() => {});
      onProgress?.(++done, paths.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// (Set by authApi's fetch: how to send a GET for a path, kept for PRELOAD_MS.)
let fetchPath: (path: string) => Promise<unknown> = async () => {};
export function setPreloadFetcher(fetcher: (path: string, keepFor: number) => Promise<unknown>) {
  fetchPath = (path) => fetcher(path, PRELOAD_MS);
}
