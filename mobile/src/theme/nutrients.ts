// One colour for each main nutrient, the same everywhere it's drawn — bars,
// charts, icons, phone and web (decided Oct 2026). A shade for each theme:
// the dark one lighter, to read on a dark card. (Going over a goal doesn't
// change a nutrient's colour: its number turns red instead.)

export type MainNutrient = "calories" | "protein" | "carbs" | "fats" | "fiber" | "sodium";

const COLORS: Record<MainNutrient, { light: string; dark: string }> = {
  calories: { light: "#F97316", dark: "#FB923C" }, // orange
  protein: { light: "#3B82F6", dark: "#60A5FA" }, // blue
  // (Carbs an orange-amber — off the Kitchen's yellow, short of calories'
  // orange. It was amber, #F59E0B / #FBBF24, until the Kitchen went yellow.)
  carbs: { light: "#EE8A0E", dark: "#FCA235" }, // orange-amber
  fats: { light: "#EC4899", dark: "#F472B6" }, // pink
  fiber: { light: "#10B981", dark: "#34D399" }, // green
  sodium: { light: "#64748B", dark: "#94A3B8" }, // slate (a limit, not something to aim for)
};

export function nutrientColor(nutrient: MainNutrient, dark = false): string {
  return dark ? COLORS[nutrient].dark : COLORS[nutrient].light;
}
