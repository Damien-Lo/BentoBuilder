import { API_BASE_URL } from "@/src/config/api";
import type { Exercise } from "@/src/services/exerciseApi";

// Your workouts in Gym (see server/models/GymWorkout.js): each exercise in
// order, with its rest, a note, and the sets you aim for.
export interface WorkoutSet {
  weight: number | null; // lbs
  reps: number | null;
}
export interface WorkoutExercise {
  exercise: Pick<Exercise, "_id" | "name" | "images" | "group" | "primaryMuscles" | "secondaryMuscles" | "equipment">;
  restSeconds: number;
  note: string;
  sets: WorkoutSet[];
}
export interface GymWorkout {
  _id: string;
  name: string;
  exercises: WorkoutExercise[];
  updatedAt?: string;
}
// What's sent: each exercise by its id.
export type WorkoutInput = { name: string; exercises: (Omit<WorkoutExercise, "exercise"> & { exercise: string })[] };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/gym${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message ?? "Something went wrong with your workouts.");
  return result.data as T;
}

export const getWorkouts = () => call<GymWorkout[]>("/workouts");
export const getWorkout = (id: string) => call<GymWorkout>(`/workouts/${id}`);
export const createWorkout = (workout: WorkoutInput) => call<GymWorkout>("/workouts", { method: "POST", body: JSON.stringify(workout) });
export const updateWorkout = (id: string, workout: WorkoutInput) => call<GymWorkout>(`/workouts/${id}`, { method: "PUT", body: JSON.stringify(workout) });
export const deleteWorkout = (id: string) => call<void>(`/workouts/${id}`, { method: "DELETE" });

// "1 min 30 s", "45 s", "Off".
export function restLabel(seconds: number) {
  if (!seconds) return "Off";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}
export const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

// --- Sessions: the workouts you did ---

export interface DoneSetInput {
  weight: number | null;
  reps: number | null;
}
export interface SessionInput {
  workout?: string | null;
  name: string;
  startedAt: string;
  finishedAt: string;
  exercises: { exercise: string; note: string; sets: DoneSetInput[] }[];
}
// One exercise's part of a session: when, and its sets.
export interface ExerciseSessionRecord {
  _id: string;
  name: string;
  finishedAt: string;
  sets: DoneSetInput[];
}

export const saveSession = (session: SessionInput) => call<{ _id: string }>("/sessions", { method: "POST", body: JSON.stringify(session) });
export const getExerciseSessions = (exerciseId: string) => call<ExerciseSessionRecord[]>(`/sessions?exercise=${encodeURIComponent(exerciseId)}`);
// For each exercise, its sets from the last time it was done.
export const getPreviousSets = (exerciseIds: string[]) =>
  exerciseIds.length ? call<Record<string, DoneSetInput[]>>(`/previous?exercises=${exerciseIds.map(encodeURIComponent).join(",")}`) : Promise.resolve({} as Record<string, DoneSetInput[]>);

// A finished workout, in full.
export interface GymSessionRecord {
  _id: string;
  name: string;
  startedAt: string;
  finishedAt: string;
  workout?: string | null;
  exercises: { exercise: Pick<Exercise, "_id" | "name" | "primaryMuscles" | "secondaryMuscles"> | null; note: string; sets: DoneSetInput[] }[];
}
export const getSessions = () => call<GymSessionRecord[]>("/sessions");
export const getSession = (id: string) => call<GymSessionRecord>(`/sessions/${id}`);
export const deleteSession = (id: string) => call<void>(`/sessions/${id}`, { method: "DELETE" });

// What a session came to: how long, the sets, the weight moved.
export function sessionTotals(session: Pick<GymSessionRecord, "startedAt" | "finishedAt" | "exercises">) {
  const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = session.exercises.reduce((sum, e) => sum + e.sets.reduce((v, s) => v + (s.weight ?? 0) * (s.reps ?? 0), 0), 0);
  const seconds = Math.max(0, (new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 1000);
  return { sets, volume, seconds };
}
