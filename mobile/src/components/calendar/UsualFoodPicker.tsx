import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import { getIngredients } from "@/src/services/ingredientApi";
import { getMeals } from "@/src/services/mealApi";
import { getRecipes } from "@/src/services/recipeApi";
import { useOrbitPage, type OrbitColors } from "@/src/theme/orbit";

// Something that can be had as a usual: a recipe (one serving), a saved
// meal, or an ingredient (one portion).
export interface UsualFood {
  key: string;
  name: string;
  kind: string;
  input: { recipe?: string; meal?: string; ingredient?: string; ingredientQuantity?: number; ingredientUnit?: string };
}

// Everything a usual can be.
export async function loadUsualFoods(): Promise<UsualFood[]> {
  const [recipes, meals, ingredients] = await Promise.all([getRecipes(), getMeals(), getIngredients()]);
  return [
    ...recipes.filter((r) => !r.isArchived).map((r) => ({ key: `r:${r._id}`, name: r.name, kind: "Recipe", input: { recipe: r._id } })),
    ...meals.filter((m) => !m.isArchived).map((m) => ({ key: `m:${m._id}`, name: m.name, kind: "Meal", input: { meal: m._id } })),
    ...ingredients
      .filter((i) => !i.isArchived)
      .map((i) => ({ key: `i:${i._id}`, name: i.name, kind: `Ingredient · ${i.defaultPortionAmount || 1} ${i.defaultPortionUnit ?? ""}`.trimEnd(), input: { ingredient: i._id, ingredientQuantity: i.defaultPortionAmount || 1, ingredientUnit: i.defaultPortionUnit ?? "" } })),
  ];
}

// Picking the food for a new usual: type to search your recipes, saved
// meals and ingredients. On a page in Orbit's look (useOrbitPage) it takes
// that page's colours, light or dark; elsewhere (the desktop) its own.
export function UsualFoodPicker({ title, foods, onPick, onClose }: { title: string; foods: UsualFood[] | null; onPick: (food: UsualFood) => void; onClose: () => void }) {
  const o = useOrbitPage();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = (foods ?? []).filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 40);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center bg-slate-900/40 px-4 pt-24" style={o && { backgroundColor: o.scrim }}>
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close" />
        <View className="w-full max-w-md rounded-3xl bg-white p-4" style={[{ maxHeight: "70%" }, o && { backgroundColor: o.surface, borderRadius: 20, borderWidth: 1, borderColor: o.border }]}>
          <Text className="text-lg font-bold text-slate-900" style={o && { color: o.text }}>{title}</Text>
          <View className="mt-3 flex-row items-center rounded-xl border border-slate-200 px-3" style={[{ height: 42 }, o && { borderRadius: 14, borderColor: o.border, backgroundColor: o.canvas }]}>
            <Ionicons name="search" size={16} color={o?.muted ?? "#64748B"} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search recipes, meals and ingredients"
              placeholderTextColor={o?.faint ?? "#94A3B8"}
              accessibilityLabel="Search"
              className="ml-2 flex-1 text-base text-slate-900"
              style={o && { color: o.text }}
            />
          </View>
          {!foods ? (
            <ActivityIndicator className="my-6" color={o?.muted ?? "#2563EB"} />
          ) : (
            <ScrollView className="mt-2" keyboardShouldPersistTaps="handled">
              {rows.map((food) => (
                <Choice key={food.key} o={o} onPress={() => onPick(food)} accessibilityLabel={`Choose ${food.name}`} className="rounded-xl px-2 py-2.5 active:bg-blue-50">
                  <Text numberOfLines={1} className="text-base font-semibold text-slate-900" style={o && { color: o.text }}>
                    {food.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-500" style={o && { color: o.muted }}>{food.kind}</Text>
                </Choice>
              ))}
              {!rows.length && <Text className="px-2 py-3 text-sm text-slate-500" style={o && { color: o.muted }}>Nothing by that name.</Text>}
            </ScrollView>
          )}
          <Choice o={o} onPress={onClose} className="mt-3 items-center rounded-xl bg-slate-100 py-2.5 active:bg-slate-200" orbitStyle={o && { marginTop: 12, alignItems: "center", borderRadius: 14, paddingVertical: 11, backgroundColor: o.pill }}>
            <Text className="font-semibold text-slate-700" style={o && { color: o.onPill }}>Cancel</Text>
          </Choice>
        </View>
      </View>
    </Modal>
  );
}

// Something to tap in the picker: in Orbit's look a Tap (its pressed look
// as a plain style, which the phone keeps), else as it always was.
function Choice({ o, onPress, accessibilityLabel, className, orbitStyle, children }: { o: OrbitColors | null; onPress: () => void; accessibilityLabel?: string; className: string; orbitStyle?: ViewStyle | null; children: ReactNode }) {
  if (!o) {
    return (
      <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel} className={className}>
        {children}
      </Pressable>
    );
  }
  return (
    <Tap onPress={onPress} accessibilityLabel={accessibilityLabel} style={orbitStyle ?? { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 10 }} pressedStyle={orbitStyle ? { opacity: 0.7 } : { backgroundColor: o.pill }}>
      {children}
    </Tap>
  );
}
