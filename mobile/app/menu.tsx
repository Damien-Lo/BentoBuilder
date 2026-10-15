import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getMeals, type Meal } from "@/src/services/mealApi";
import { addToMenu, getMenu, menuName, removeFromMenu, updateMenuItem, type MenuItem } from "@/src/services/menuApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { getMealKcal, getRecipeKcal } from "@/src/utils/mealPlan";

// The menu on the phone (Kitchen → Planner → Menu): what you'd like to have
// soon, not yet on a day (see services/menuApi.ts). Added here; put on a day
// from the planner's Add, where it's at the top.
export default function MenuScreen() {
  const router = useRouter();
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [query, setQuery] = useState("");
  const [showSomeday, setShowSomeday] = useState(false);

  const reload = useCallback(() => {
    getMenu().then(setMenu).catch(() => setMenu([]));
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      getRecipes().then(setRecipes).catch(() => {});
      getMeals().then(setMeals).catch(() => {});
    }, [reload]),
  );

  const fail = (error: unknown) => Alert.alert("Couldn't change the menu", error instanceof Error ? error.message : "Something went wrong.");
  const run = (job: Promise<unknown>) => void job.then(reload, fail);

  const on = (menu ?? []).filter((m) => m.state === "menu");
  const someday = (menu ?? []).filter((m) => m.state === "someday");
  const kcalOf = (item: MenuItem) => (item.recipe ? getRecipeKcal(item.recipe, 1) : item.meal ? getMealKcal(item.meal) : null);

  // Recipes and saved meals by name, not already on the menu.
  const q = query.trim().toLowerCase();
  const already = new Set(on.map((m) => m.recipe?._id ?? m.meal?._id));
  const found = q
    ? [
        ...recipes.filter((r) => !r.isArchived && !already.has(r._id) && r.name.toLowerCase().includes(q)).map((r) => ({ key: `r:${r._id}`, name: r.name, kind: "Recipe", add: () => addToMenu({ recipe: r._id }) })),
        ...meals.filter((m) => !m.isArchived && !already.has(m._id) && m.name.toLowerCase().includes(q)).map((m) => ({ key: `m:${m._id}`, name: m.name, kind: "Meal", add: () => addToMenu({ meal: m._id }) })),
      ].slice(0, 12)
    : [];

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="border-b border-slate-200 bg-white px-4 py-3">
        <View className="flex-row items-center">
          <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <View className="ml-2 flex-1">
            <Text className="text-xl font-bold text-slate-950">Menu</Text>
            <Text className="text-xs text-slate-500">{on.length ? `${on.length} on the menu` : "What you'd like to have soon"}</Text>
          </View>
        </View>
        <View className="mt-3 h-11 flex-row items-center rounded-2xl bg-slate-100 px-4">
          <Ionicons name="add" size={18} color="#64748B" />
          <TextInput value={query} onChangeText={setQuery} placeholder="Add a recipe or meal…" placeholderTextColor="#94A3B8" className="ml-3 flex-1 text-base text-slate-900" />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {!!q && (
          <View className="mb-4 rounded-2xl border border-slate-200 bg-white">
            {found.map((f, i) => (
              <Pressable key={f.key} onPress={() => (run(f.add()), setQuery(""))} className={`flex-row items-center px-4 py-3 active:bg-slate-50 ${i ? "border-t border-slate-100" : ""}`}>
                <Ionicons name="add-circle-outline" size={20} color="#2563EB" />
                <Text numberOfLines={1} className="ml-3 flex-1 text-[15px] text-slate-900">
                  {f.name}
                </Text>
                <Text className="text-xs text-slate-400">{f.kind}</Text>
              </Pressable>
            ))}
            {!found.length && <Text className="px-4 py-3 text-sm text-slate-400">Nothing by that name</Text>}
          </View>
        )}

        {menu && !on.length && !q && (
          <View className="items-center rounded-2xl border border-dashed border-slate-200 px-6 py-10">
            <Ionicons name="restaurant-outline" size={36} color="#94A3B8" />
            <Text className="mt-3 text-center text-sm text-slate-500">Add recipes you&apos;d like this week: what they need goes on the grocery list, and you put them on days when you know when.</Text>
          </View>
        )}

        {on.length > 0 && (
          <View className="rounded-2xl border border-slate-200 bg-white">
            {on.map((item, i) => {
              const kcal = kcalOf(item);
              return (
                <View key={item._id} className={`px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
                  <View className="flex-row items-center">
                    <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold text-slate-900">
                      {menuName(item)}
                    </Text>
                    <Pressable onPress={() => run(removeFromMenu(item._id))} hitSlop={10} accessibilityLabel={`Take ${menuName(item)} off the menu`}>
                      <Ionicons name="close" size={18} color="#94A3B8" />
                    </Pressable>
                  </View>
                  <View className="mt-1 flex-row items-center">
                    <Text className="flex-1 text-xs text-slate-500">
                      {item.servings} serving{item.servings === 1 ? "" : "s"}{kcal != null ? ` · ${Math.round(kcal)} kcal each` : ""}
                    </Text>
                    <Pressable onPress={() => run(updateMenuItem(item._id, { state: "someday" }))} hitSlop={8} className="rounded-lg bg-slate-100 px-2.5 py-1 active:bg-slate-200">
                      <Text className="text-xs font-semibold text-slate-600">Someday</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {on.length > 0 && <Text className="mt-3 px-1 text-xs text-slate-400">To put one on a day, tap Add on a meal in the planner: the menu&apos;s at the top. Once it&apos;s on a day, it moves to Someday.</Text>}

        {someday.length > 0 && (
          <View className="mt-5">
            <Pressable onPress={() => setShowSomeday((s) => !s)} className="flex-row items-center px-1 py-2">
              <Ionicons name={showSomeday ? "chevron-down" : "chevron-forward"} size={16} color="#64748B" />
              <Text className="ml-1.5 text-sm font-semibold text-slate-600">Someday · {someday.length}</Text>
            </Pressable>
            {showSomeday && (
              <View className="rounded-2xl border border-slate-200 bg-white">
                {someday.map((item, i) => (
                  <View key={item._id} className={`flex-row items-center px-4 py-3 ${i ? "border-t border-slate-100" : ""}`}>
                    <Text numberOfLines={1} className="flex-1 text-sm text-slate-800">
                      {menuName(item)}
                    </Text>
                    <Pressable onPress={() => run(addToMenu(item.recipe ? { recipe: item.recipe._id } : { meal: item.meal!._id }))} hitSlop={8}>
                      <Text className="text-xs font-semibold text-blue-600">On the menu</Text>
                    </Pressable>
                    <Pressable onPress={() => run(removeFromMenu(item._id))} hitSlop={10} className="ml-3" accessibilityLabel={`Remove ${menuName(item)}`}>
                      <Ionicons name="close" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
