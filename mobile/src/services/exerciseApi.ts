import { API_BASE_URL } from "@/src/config/api";

// Gym's exercise library (see server/models/Exercise.js): every exercise in
// free-exercise-db, ~130 of them the core — shown by default, under clean
// names — and the rest found by searching.
export interface Exercise {
  _id: string;
  name: string;
  core: boolean;
  // The section it's browsed under: the muscle it mainly works, or "cardio".
  group: string;
  category: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  level: string | null;
  mechanic: string | null;
  // Photos (the start and end of the movement): paths in free-exercise-db.
  images: string[];
  instructions?: string[];
}

async function call<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/exercises${path}`, { headers: { "Content-Type": "application/json" } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message ?? "Couldn't load the exercises.");
  return result.data as T;
}

export const getExercises = () => call<Exercise[]>("");
export const getExercise = (id: string) => call<Exercise>(`/${id}`);

// The sections, in the order a body is read — top to bottom, front then
// back — and cardio last.
export const EXERCISE_GROUPS = [
  "chest", "shoulders", "biceps", "triceps", "forearms", "abdominals",
  "lats", "middle back", "lower back", "traps", "neck",
  "glutes", "quadriceps", "hamstrings", "adductors", "abductors", "calves", "cardio",
];

const GROUP_LABEL: Record<string, string> = { abdominals: "Abs", quadriceps: "Quads", adductors: "Hip adduction", abductors: "Hip abduction" };
export const groupLabel = (group: string) => GROUP_LABEL[group] ?? group.replace(/\b\w/g, (c) => c.toUpperCase());

// A photo's address (free-exercise-db's own copy, on GitHub).
export const exerciseImage = (imagePath: string) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${imagePath}`;
