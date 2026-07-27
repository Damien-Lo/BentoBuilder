import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getMealById, type Meal, type MealRecipeRef } from "@/src/services/mealApi";

const MEAL_TYPE_LABEL: Record<string, string> = {
  course: "Course-based",
  bento: "Bento Box",
};

function getRecipeId(recipe: MealRecipeRef | string | null | undefined): string | null {
  if (!recipe) return null;
  if (typeof recipe === "string") return recipe;
  return recipe._id;
}

function getRecipeName(recipe: MealRecipeRef | string | null | undefined): string {
  if (!recipe) return "No recipe selected";
  if (typeof recipe === "string") return recipe;
  return recipe.name;
}

function getRecipeNutrition(recipe: MealRecipeRef | string | null | undefined) {
  if (!recipe || typeof recipe === "string") return null;
  return recipe.nutrition ?? null;
}

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [meal, setMeal] = useState<Meal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const loaded = await getMealById(id);
        if (!cancelled) setMeal(loaded);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load meal");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [id]);

  const totalNutrition = useMemo(() => {
    let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0, sodium = 0;
    for (const course of meal?.courses ?? []) {
      const n = getRecipeNutrition(course.recipe);
      if (!n) continue;
      const s = course.servings;
      if (n.calories != null) calories += n.calories * s;
      if (n.protein  != null) protein  += n.protein  * s;
      if (n.carbs    != null) carbs    += n.carbs    * s;
      if (n.fats     != null) fats     += n.fats     * s;
      if (n.fiber    != null) fiber    += n.fiber    * s;
      if (n.sodium   != null) sodium   += n.sodium   * s;
    }
    return { calories, protein, carbs, fats, fiber, sodium };
  }, [meal]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading meal...</Text>
      </SafeAreaView>
    );
  }

  if (error || !meal) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <Ionicons name="alert-circle-outline" size={42} color="#94A3B8" />
        <Text className="mt-4 text-lg font-bold text-slate-900">Could not load meal</Text>
        <Pressable
          className="mt-6 rounded-2xl bg-slate-200 px-6 py-3"
          onPress={() => router.back()}
        >
          <Text className="font-semibold text-slate-700">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const courseCount = meal.courses?.length ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <Stack.Screen options={{ headerShown: false }} />
      {/* Nav bar */}
      <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text
          className="ml-2 flex-1 text-xl font-bold text-slate-950"
          numberOfLines={1}
        >
          {meal.name}
        </Text>
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() =>
            router.push({ pathname: "/meals/edit/[id]", params: { id } })
          }
        >
          <Ionicons name="create-outline" size={24} color="#2563EB" />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 60,
        }}
      >
        {/* Header card */}
        <View className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <Ionicons name="restaurant-outline" size={26} color="#2563EB" />
          </View>
          <Text className="mt-4 text-2xl font-bold text-slate-900">{meal.name}</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <View className="rounded-full bg-blue-100 px-3 py-1">
              <Text className="text-xs font-semibold text-blue-700">
                {MEAL_TYPE_LABEL[meal.type] ?? meal.type}
              </Text>
            </View>
            <View className="rounded-full bg-slate-100 px-3 py-1">
              <Text className="text-xs font-semibold text-slate-600">
                {courseCount} {courseCount === 1 ? "course" : "courses"}
              </Text>
            </View>
            {(meal.tags ?? []).map(tag => (
              <View key={tag._id} className="rounded-full bg-emerald-100 px-3 py-1">
                <Text className="text-xs font-semibold text-emerald-700">
                  {tag.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Courses */}
        {courseCount > 0 && (
          <>
            <Text className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
              Courses
            </Text>
            <View className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {meal.courses!.map((course, index) => {
                const recipeId = getRecipeId(course.recipe);
                const recipeName = getRecipeName(course.recipe);
                const n = getRecipeNutrition(course.recipe);
                const cal =
                  n?.calories != null
                    ? Math.round(n.calories * course.servings)
                    : null;

                return (
                  <Pressable
                    key={course._id}
                    className={`flex-row items-center px-4 py-3.5 ${
                      index < meal.courses!.length - 1
                        ? "border-b border-slate-100"
                        : ""
                    } ${recipeId ? "active:bg-slate-50" : ""}`}
                    onPress={() => {
                      if (recipeId)
                        router.push({
                          pathname: "/recipes/[id]",
                          params: { id: recipeId },
                        });
                    }}
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                      <Text className="text-xs font-bold text-blue-700">
                        {index + 1}
                      </Text>
                    </View>

                    <View className="ml-3 flex-1">
                      <Text className="font-semibold text-slate-900">
                        {recipeName}
                      </Text>
                      <Text className="mt-0.5 text-sm text-slate-500">
                        {course.servings}{" "}
                        {course.servings === 1 ? "serving" : "servings"}
                      </Text>
                    </View>

                    {cal != null && (
                      <Text className="mr-2 text-sm font-semibold text-slate-400">
                        {cal} kcal
                      </Text>
                    )}
                    {recipeId && (
                      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Nutrition */}
        <Text className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Meal nutrition
        </Text>
        <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {(
            [
              ["Calories", totalNutrition.calories, "kcal"],
              ["Protein",  totalNutrition.protein,  "g"],
              ["Carbs",    totalNutrition.carbs,    "g"],
              ["Fats",     totalNutrition.fats,     "g"],
              ["Fiber",    totalNutrition.fiber,    "g"],
              ["Sodium",   totalNutrition.sodium,   "mg"],
            ] as [string, number, string][]
          ).map(([label, value, unit], i, arr) => (
            <View
              key={label}
              className={`flex-row items-center justify-between px-4 py-3 ${
                i < arr.length - 1 ? "border-b border-slate-100" : ""
              }`}
            >
              <Text className="text-base text-slate-600">{label}</Text>
              <Text className="text-base font-semibold text-slate-900">
                {Math.round(value * 10) / 10} {unit}
              </Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        {meal.notes ? (
          <>
            <Text className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
              Notes
            </Text>
            <View className="rounded-2xl border border-slate-200 bg-white p-5">
              <Text className="text-base leading-6 text-slate-600">{meal.notes}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
