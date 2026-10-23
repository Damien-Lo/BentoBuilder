import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailable,
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  type QuantityTypeIdentifier,
  type StatisticsOptions,
} from "@kingstinct/react-native-healthkit";
import { Platform } from "react-native";

import { API_BASE_URL } from "@/src/config/api";
import { syncWeightEntries } from "@/src/services/weightEntryApi";

// Apple Health → Orbit. On an iPhone, with your say-so, your health data
// — the Watch's and the phone's — is read from Apple Health a day at a
// time and kept on the server as readings (server/models/HealthMetric.js)
// — in metric, as Apple Health keeps them —
// for Health to show and the rest of the app to use. Synced when asked
// (Sync now), when Health opens, and whenever the app comes to the front
// (HealthAutoSync) — each an hour or more after the last: from a couple of
// days before the last sync, or the last 90 days the first time. Nothing here on the web or Android.

// What's read: each quantity a day at a time — a total, or a figure for
// the day — in the unit it's kept in.
const QUANTITIES: { type: string; id: QuantityTypeIdentifier; stat: StatisticsOptions; unit: string; scale?: number }[] = [
  { type: "steps", id: "HKQuantityTypeIdentifierStepCount", stat: "cumulativeSum", unit: "count" },
  { type: "activeEnergy", id: "HKQuantityTypeIdentifierActiveEnergyBurned", stat: "cumulativeSum", unit: "kcal" },
  { type: "restingEnergy", id: "HKQuantityTypeIdentifierBasalEnergyBurned", stat: "cumulativeSum", unit: "kcal" },
  { type: "exerciseMinutes", id: "HKQuantityTypeIdentifierAppleExerciseTime", stat: "cumulativeSum", unit: "min" },
  { type: "distance", id: "HKQuantityTypeIdentifierDistanceWalkingRunning", stat: "cumulativeSum", unit: "km" },
  { type: "restingHeartRate", id: "HKQuantityTypeIdentifierRestingHeartRate", stat: "discreteAverage", unit: "count/min" },
  { type: "walkingHeartRate", id: "HKQuantityTypeIdentifierWalkingHeartRateAverage", stat: "discreteAverage", unit: "count/min" },
  { type: "hrv", id: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", stat: "discreteAverage", unit: "ms" },
  { type: "vo2max", id: "HKQuantityTypeIdentifierVO2Max", stat: "discreteAverage", unit: "ml/(kg*min)" },
  { type: "oxygen", id: "HKQuantityTypeIdentifierOxygenSaturation", stat: "discreteAverage", unit: "%", scale: 100 },
  { type: "respiratoryRate", id: "HKQuantityTypeIdentifierRespiratoryRate", stat: "discreteAverage", unit: "count/min" },
  { type: "weight", id: "HKQuantityTypeIdentifierBodyMass", stat: "mostRecent", unit: "kg" },
  { type: "flights", id: "HKQuantityTypeIdentifierFlightsClimbed", stat: "cumulativeSum", unit: "count" },
  { type: "standMinutes", id: "HKQuantityTypeIdentifierAppleStandTime", stat: "cumulativeSum", unit: "min" },
  { type: "bodyFat", id: "HKQuantityTypeIdentifierBodyFatPercentage", stat: "mostRecent", unit: "%", scale: 100 },
  { type: "leanMass", id: "HKQuantityTypeIdentifierLeanBodyMass", stat: "mostRecent", unit: "kg" },
  { type: "waist", id: "HKQuantityTypeIdentifierWaistCircumference", stat: "mostRecent", unit: "cm" },
  { type: "systolic", id: "HKQuantityTypeIdentifierBloodPressureSystolic", stat: "discreteAverage", unit: "mmHg" },
  { type: "diastolic", id: "HKQuantityTypeIdentifierBloodPressureDiastolic", stat: "discreteAverage", unit: "mmHg" },
  { type: "wristTemp", id: "HKQuantityTypeIdentifierAppleSleepingWristTemperature", stat: "discreteAverage", unit: "degC" },
  { type: "water", id: "HKQuantityTypeIdentifierDietaryWater", stat: "cumulativeSum", unit: "mL" },
  { type: "caffeine", id: "HKQuantityTypeIdentifierDietaryCaffeine", stat: "cumulativeSum", unit: "mg" },
];
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis" as const;
const MINDFUL = "HKCategoryTypeIdentifierMindfulSession" as const;
const WORKOUTS = "HKWorkoutTypeIdentifier" as const;

// A distance in km, from whatever unit it came in (a workout's comes in
// metres — under a name that isn't always "m" — so anything unknown is
// taken as metres).
function toKm(q: { unit: string; quantity: number }) {
  const unit = q.unit.toLowerCase();
  if (unit === "km") return q.quantity;
  if (unit === "mi") return q.quantity * 1.609344;
  if (unit === "ft") return q.quantity * 0.0003048;
  if (unit === "yd") return q.quantity * 0.0009144;
  return q.quantity / 1000;
}

export interface HealthMetricInput {
  type: string;
  key: string;
  date: string;
  value: number;
  unit: string;
  start?: string | null;
  end?: string | null;
  source: "apple" | "manual";
  detail?: Record<string, number> | null;
}

const LAST_SYNC = "health.lastSync";

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Whether this device can reach Apple Health at all.
export function healthAvailable() {
  if (Platform.OS !== "ios") return false;
  try {
    return isHealthDataAvailable();
  } catch {
    return false;
  }
}

// Asks once (iOS shows its sheet the first time; after that it's settled
// in Settings → Health → Data Access).
export async function connectAppleHealth() {
  return requestAuthorization({ toRead: [...QUANTITIES.map((q) => q.id), SLEEP, MINDFUL, WORKOUTS] });
}

export async function lastSynced(): Promise<Date | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNC);
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

// A night's sleep: the samples that ended on a morning, by stage, in minutes.
function nights(samples: readonly { startDate: Date; endDate: Date; value: number }[]): HealthMetricInput[] {
  const byNight = new Map<string, { start: Date; end: Date; stages: Record<string, number> }>();
  const STAGE: Record<number, string> = {
    [CategoryValueSleepAnalysis.inBed]: "inBed",
    [CategoryValueSleepAnalysis.asleepUnspecified]: "asleep",
    [CategoryValueSleepAnalysis.awake]: "awake",
    [CategoryValueSleepAnalysis.asleepCore]: "core",
    [CategoryValueSleepAnalysis.asleepDeep]: "deep",
    [CategoryValueSleepAnalysis.asleepREM]: "rem",
  };
  for (const s of samples) {
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    // (A nap after 6 pm counts toward the next morning's night.)
    const night = dayOf(end.getHours() >= 18 ? new Date(end.getTime() + 86_400_000) : end);
    const entry = byNight.get(night) ?? { start, end, stages: {} };
    if (start < entry.start) entry.start = start;
    if (end > entry.end) entry.end = end;
    const stage = STAGE[s.value] ?? "asleep";
    entry.stages[stage] = (entry.stages[stage] ?? 0) + (end.getTime() - start.getTime()) / 60_000;
    byNight.set(night, entry);
  }
  return [...byNight.entries()].map(([date, n]) => {
    const asleep = ["asleep", "core", "deep", "rem"].reduce((sum, k) => sum + (n.stages[k] ?? 0), 0);
    const stages = Object.fromEntries(Object.entries(n.stages).map(([k, v]) => [k, Math.round(v)]));
    return { type: "sleep", key: `sleep:${date}`, date, value: Math.round(asleep), unit: "min", start: n.start.toISOString(), end: n.end.toISOString(), source: "apple" as const, detail: stages };
  });
}

// Reads Apple Health since a little before the last sync and sends it to
// the server. What came of it: how many readings went in. (One at a time:
// asked again while one's running, it's that one.)
type SyncResult = { sent: number; added: number; updated: number; from: Date };
let running: Promise<SyncResult> | null = null;
export function syncAppleHealth(): Promise<SyncResult> {
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

async function runSync(): Promise<SyncResult> {
  const now = new Date();
  const last = await lastSynced();
  const from = midnight(last ? new Date(last.getTime() - 2 * 86_400_000) : new Date(now.getTime() - 90 * 86_400_000));
  const metrics: HealthMetricInput[] = [];

  for (const q of QUANTITIES) {
    try {
      const days = await queryStatisticsCollectionForQuantity(q.id, [q.stat], from, { day: 1 }, { filter: { date: { startDate: from, endDate: now } }, unit: q.unit as never });
      for (const d of days) {
        const quantity = q.stat === "cumulativeSum" ? d.sumQuantity : q.stat === "mostRecent" ? d.mostRecentQuantity : d.averageQuantity;
        if (!quantity || !d.startDate || !Number.isFinite(quantity.quantity)) continue;
        if (q.stat === "cumulativeSum" && quantity.quantity === 0) continue;
        const date = dayOf(new Date(d.startDate));
        const value = Math.round(quantity.quantity * (q.scale ?? 1) * 100) / 100;
        metrics.push({ type: q.type, key: `${q.type}:${date}`, date, value, unit: q.unit === "%" ? "%" : quantity.unit || q.unit, start: new Date(d.startDate).toISOString(), end: d.endDate ? new Date(d.endDate).toISOString() : null, source: "apple" });
      }
    } catch {
      // (Not allowed, or nothing recorded: the rest still syncs.)
    }
  }
  try {
    // (Sleep from the evening before.)
    const samples = await queryCategorySamples(SLEEP, { limit: 0, filter: { date: { startDate: new Date(from.getTime() - 12 * 3_600_000), endDate: now } } });
    metrics.push(...nights(samples as unknown as { startDate: Date; endDate: Date; value: number }[]).filter((m) => m.date >= dayOf(from)));
  } catch {
    // (As above.)
  }

  try {
    // Mindful minutes, a day at a time.
    const sessions = await queryCategorySamples(MINDFUL, { limit: 0, filter: { date: { startDate: from, endDate: now } } });
    const byDay = new Map<string, number>();
    for (const s of sessions as unknown as { startDate: Date; endDate: Date }[]) {
      const day = dayOf(new Date(s.startDate));
      byDay.set(day, (byDay.get(day) ?? 0) + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000);
    }
    for (const [date, minutes] of byDay) metrics.push({ type: "mindfulMinutes", key: `mindfulMinutes:${date}`, date, value: Math.round(minutes), unit: "min", source: "apple" });
  } catch {
    // (As above.)
  }
  try {
    // Each workout (the Watch's, or another app's): what it was, how long,
    // the calories and distance.
    const workouts = await queryWorkoutSamples({ limit: 0, filter: { date: { startDate: from, endDate: now } } });
    for (const w of workouts) {
      const start = new Date(w.startDate);
      const minutes = w.duration.unit === "min" ? w.duration.quantity : w.duration.quantity / 60;
      const kcal = w.totalEnergyBurned ? (w.totalEnergyBurned.unit === "kJ" ? w.totalEnergyBurned.quantity / 4.184 : w.totalEnergyBurned.quantity) : 0;
      const km = w.totalDistance ? toKm(w.totalDistance) : 0;
      metrics.push({
        type: "workout",
        key: `workout:${w.uuid}`,
        date: dayOf(start),
        value: Math.round(minutes),
        unit: "min",
        start: start.toISOString(),
        end: new Date(w.endDate).toISOString(),
        source: "apple",
        detail: { activity: Number(w.workoutActivityType), kcal: Math.round(kcal), km: Math.round(km * 100) / 100 },
      });
    }
  } catch {
    // (As above.)
  }

  // Weight goes to your weigh-ins (Health → Weight), not the readings.
  const weights = metrics.filter((m) => m.type === "weight").map((m) => ({ date: m.date, weight: m.value }));
  if (weights.length) await syncWeightEntries(weights);
  const readings = metrics.filter((m) => m.type !== "weight");

  let added = 0;
  let updated = 0;
  for (let i = 0; i < readings.length; i += 1000) {
    const res = await fetch(`${API_BASE_URL}/api/health-data/metrics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics: readings.slice(i, i + 1000) }) });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.message ?? "Couldn't save your health data.");
    added += body.data.added;
    updated += body.data.updated;
  }
  await AsyncStorage.setItem(LAST_SYNC, now.toISOString()).catch(() => {});
  return { sent: readings.length + weights.length, added, updated, from };
}

// --- Reading it back (any device) ---

export interface HealthMetric {
  _id: string;
  type: string;
  date: string;
  value: number;
  unit: string;
  start?: string | null;
  end?: string | null;
  source: string;
  detail?: Record<string, number> | null;
}

// A reading typed in (blood pressure, waist, mood…): one a day for each,
// kept apart from Apple Health's.
export async function addHealthReading(type: string, value: number, unit: string, date: string, detail?: Record<string, number>) {
  const metric: HealthMetricInput = { type, key: `${type}:manual:${date}`, date, value, unit, source: "manual", detail: detail ?? null };
  const res = await fetch(`${API_BASE_URL}/api/health-data/metrics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics: [metric] }) });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.message ?? "Couldn't save it.");
}
export async function deleteHealthReading(id: string) {
  const res = await fetch(`${API_BASE_URL}/api/health-data/metrics/${id}`, { method: "DELETE" });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.message ?? "Couldn't delete it.");
}

export async function getHealthMetrics(types: string[], from?: string, to?: string): Promise<HealthMetric[]> {
  const params = new URLSearchParams({ types: types.join(","), ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const res = await fetch(`${API_BASE_URL}/api/health-data/metrics?${params}`);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.message ?? "Couldn't load your health data.");
  return body.data as HealthMetric[];
}
