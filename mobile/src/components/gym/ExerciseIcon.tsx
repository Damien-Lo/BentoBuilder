import { Image } from "expo-image";

import { EXERCISE_ICONS } from "@/src/components/gym/exerciseIconFiles";
import { MuscleIcon } from "@/src/components/gym/MuscleMap";

// An exercise's round icon: its picture — the core exercises each have one
// (assets/exercise-icons: a figure doing it, the muscles it works in red) —
// or, for the rest of the library, its muscle map close up.

// "Bench Press (Barbell)" → "bench-press-barbell": a picture's file name.
export const exerciseIconSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function ExerciseIcon({ name, primary = [], secondary = [], size = 44 }: { name: string; primary?: string[]; secondary?: string[]; size?: number }) {
  const picture = EXERCISE_ICONS[exerciseIconSlug(name)];
  if (!picture) return <MuscleIcon primary={primary} secondary={secondary} size={size} />;
  return <Image source={picture} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />;
}
