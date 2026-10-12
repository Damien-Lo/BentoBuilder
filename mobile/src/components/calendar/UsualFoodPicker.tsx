import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { getIngredients } from "@/src/services/ingredientApi";
import { getMeals } from "@/src/services/mealApi";
import { getRecipes } from "@/src/services/recipeApi";

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
// meals and ingredients.
export function UsualFoodPicker({ title, foods, onPick, onClose }: { title: string; foods: UsualFood[] | null; onPick: (food: UsualFood) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = (foods ?? []).filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 40);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center bg-slate-900/40 px-4 pt-24">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close" />
        <View className="w-full max-w-md rounded-3xl bg-white p-4" style={{ maxHeight: "70%" }}>
          <Text className="text-lg font-bold text-slate-900">{title}</Text>
          <View className="mt-3 flex-row items-center rounded-xl border border-slate-200 px-3" style={{ height: 42 }}>
            <Ionicons name="search" size={16} color="#64748B" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search recipes, meals and ingredients"
              placeholderTextColor="#94A3B8"
              accessibilityLabel="Search"
              className="ml-2 flex-1 text-base text-slate-900"
            />
          </View>
          {!foods ? (
            <ActivityIndicator className="my-6" color="#2563EB" />
          ) : (
            <ScrollView className="mt-2" keyboardShouldPersistTaps="handled">
              {rows.map((food) => (
                <Pressable key={food.key} onPress={() => onPick(food)} accessibilityLabel={`Choose ${food.name}`} className="rounded-xl px-2 py-2.5 active:bg-blue-50">
                  <Text numberOfLines={1} className="text-base font-semibold text-slate-900">
                    {food.name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-500">{food.kind}</Text>
                </Pressable>
              ))}
              {!rows.length && <Text className="px-2 py-3 text-sm text-slate-500">Nothing by that name.</Text>}
            </ScrollView>
          )}
          <Pressable onPress={onClose} className="mt-3 items-center rounded-xl bg-slate-100 py-2.5 active:bg-slate-200">
            <Text className="font-semibold text-slate-700">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
