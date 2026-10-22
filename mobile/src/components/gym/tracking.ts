import type { SetType } from "@/src/services/gymApi";

// How an exercise is logged — its "track" (set on each library exercise):
//   weight      weight × reps (most lifts)
//   bodyweight  reps, with any weight added (push-ups, dips, a weighted pull-up)
//   assisted    the help × reps (an assisted pull-up: less help is better)
//   duration    a time held (a plank)
//   cardio      a distance and a time (the treadmill, the elliptical)
// — what each set asks for, how it reads, what counts as its best, and
// what it adds to the volume (only weight moved: bodyweight's added
// weight, never help, holds or cardio).

export type Track = "weight" | "bodyweight" | "assisted" | "duration" | "cardio";
export const trackOf = (exercise?: { track?: Track | null } | null): Track => exercise?.track ?? "weight";

export interface AnySet {
  weight?: number | null; // lbs
  reps?: number | null;
  seconds?: number | null;
  distance?: number | null; // miles
  type?: SetType;
}

// A set as typed: each number as text (the time as "1:30").
export interface SetDraft {
  weight: string;
  reps: string;
  time: string;
  distance: string;
}
export type DraftField = keyof SetDraft;

// What a set asks for, under each track: its boxes, in order.
export const FIELDS: Record<Track, { key: DraftField; head: string; kind: "decimal" | "whole" | "time" }[]> = {
  weight: [
    { key: "weight", head: "LBS", kind: "decimal" },
    { key: "reps", head: "REPS", kind: "whole" },
  ],
  bodyweight: [
    { key: "weight", head: "+LBS", kind: "decimal" },
    { key: "reps", head: "REPS", kind: "whole" },
  ],
  assisted: [
    { key: "weight", head: "−LBS", kind: "decimal" },
    { key: "reps", head: "REPS", kind: "whole" },
  ],
  duration: [{ key: "time", head: "TIME", kind: "time" }],
  cardio: [
    { key: "distance", head: "MILES", kind: "decimal" },
    { key: "time", head: "TIME", kind: "time" },
  ],
};
// (A plain number typed as a time: seconds for a hold, minutes for cardio.)
const PLAIN_TIME: Record<Track, "seconds" | "minutes"> = { weight: "seconds", bodyweight: "seconds", assisted: "seconds", duration: "seconds", cardio: "minutes" };
export const TIME_HINT: Record<Track, string> = { weight: "0:00", bodyweight: "0:00", assisted: "0:00", duration: "0:45", cardio: "30:00" };

const asText = (n: number | null | undefined) => (n == null ? "" : String(n));
const asNumber = (text: string) => {
  const n = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
};

// "1:30" → 90; "1:02:00" → 3720; a plain number by the track.
export function parseTime(text: string, track: Track): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => Number(p || 0));
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
    return parts.reduce((total, p) => total * 60 + p, 0);
  }
  const n = asNumber(t);
  return n == null ? null : PLAIN_TIME[track] === "minutes" ? Math.round(n * 60) : Math.round(n);
}
// 90 → "1:30"; 3720 → "1:02:00".
export function timeText(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export const draftOf = (set?: AnySet | null): SetDraft => ({ weight: asText(set?.weight), reps: asText(set?.reps), time: set?.seconds != null ? timeText(set.seconds) : "", distance: asText(set?.distance) });
export const fromDraft = (draft: SetDraft, track: Track) => ({ weight: asNumber(draft.weight), reps: asNumber(draft.reps), seconds: parseTime(draft.time, track), distance: asNumber(draft.distance) });
// Only what a field allows, as it's typed.
export const cleanField = (kind: "decimal" | "whole" | "time", text: string) => text.replace(kind === "decimal" ? /[^0-9.,]/g : kind === "time" ? /[^0-9:]/g : /[^0-9]/g, "");

// Whether a set has what its track needs to count as done.
export function setComplete(set: AnySet, track: Track) {
  if (track === "duration") return (set.seconds ?? 0) > 0;
  if (track === "cardio") return (set.seconds ?? 0) > 0 || (set.distance ?? 0) > 0;
  return (set.reps ?? 0) > 0;
}

// The weight it moved.
export function setVolume(set: AnySet, track: Track) {
  if (track === "weight" || track === "bodyweight") return (set.weight ?? 0) * (set.reps ?? 0);
  return 0;
}

const n = (x: number) => (Math.round(x * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

// A set in words: "45 lbs × 10", "12 reps", "+10 lbs × 8", "−75 lbs × 12",
// "1:30", "2.13 mi · 30:00".
export function setText(set: AnySet, track: Track) {
  const reps = set.reps ?? "—";
  switch (track) {
    case "weight":
      return set.weight != null ? `${n(set.weight)} lbs × ${reps}` : `${reps} reps`;
    case "bodyweight":
      return set.weight ? `+${n(set.weight)} lbs × ${reps}` : `${reps} reps`;
    case "assisted":
      return set.weight != null ? `−${n(set.weight)} lbs × ${reps}` : `${reps} reps`;
    case "duration":
      return set.seconds != null ? timeText(set.seconds) : "—";
    case "cardio":
      return [set.distance != null ? `${n(set.distance)} mi` : null, set.seconds != null ? timeText(set.seconds) : null].filter(Boolean).join(" · ") || "—";
  }
}

// What an exercise's best is, by its track — the one a record beats: the
// heaviest weight, the most reps, the least help, the longest hold, the
// farthest (or, without distances, longest) cardio.
export interface Best {
  value: number;
  lower: boolean; // less is better (help)
  text: string; // "185 lbs"
  unit: string;
}
const counted = (sets: AnySet[], track: Track) => sets.filter((s) => s.type !== "warmup" && setComplete(s, track));

export function bestOf(sets: AnySet[], track: Track): Best | null {
  const done = counted(sets, track);
  if (!done.length) return null;
  switch (track) {
    case "weight": {
      const v = Math.max(0, ...done.map((s) => s.weight ?? 0));
      return v ? { value: v, lower: false, text: `${n(v)} lbs`, unit: "lbs" } : null;
    }
    case "bodyweight": {
      const v = Math.max(0, ...done.map((s) => s.reps ?? 0));
      return v ? { value: v, lower: false, text: `${v} reps`, unit: "reps" } : null;
    }
    case "assisted": {
      const helped = done.filter((s) => s.weight != null);
      if (!helped.length) return null;
      const v = Math.min(...helped.map((s) => s.weight!));
      return { value: v, lower: true, text: v ? `−${n(v)} lbs` : "No help", unit: "lbs" };
    }
    case "duration": {
      const v = Math.max(0, ...done.map((s) => s.seconds ?? 0));
      return v ? { value: v, lower: false, text: timeText(v), unit: "s" } : null;
    }
    case "cardio": {
      const far = Math.max(0, ...done.map((s) => s.distance ?? 0));
      if (far) return { value: far, lower: false, text: `${n(far)} mi`, unit: "mi" };
      const long = Math.max(0, ...done.map((s) => s.seconds ?? 0));
      return long ? { value: long, lower: false, text: timeText(long), unit: "s" } : null;
    }
  }
}
// Whether `best` beats `before` — and by how much, in words ("+10 lbs",
// "−5 lbs of help", "+0:15").
export function beats(best: Best, before: Best) {
  return best.unit === before.unit && (best.lower ? best.value < before.value : best.value > before.value);
}
export function gainText(best: Best, before: Best) {
  const by = Math.abs(best.value - before.value);
  if (best.unit === "s") return `+${timeText(by)}`;
  if (best.lower) return `${n(by)} lbs less help`;
  return `+${n(by)} ${best.unit}`;
}
