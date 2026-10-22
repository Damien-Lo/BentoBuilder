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

import { getMealById, type Meal } from "@/src/services/mealApi";
import {
  courseAmountLabel,
  courseIngredient,
  courseName,
  courseNutrition,
  courseRecipe,
} from "@/src/utils/mealPlan";
import { useWideForm } from "@/src/components/forms/wideForm";
import { MealNutritionFigures } from "@/src/components/meals/MealCoursesEditor";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

const MEAL_TYPE_LABEL: Record<string, string> = {
  course: "Course-based",
  bento: "Bento Box",
};

// A saved meal's page (Kitchen): in Orbit's look, in the Kitchen's colours —
// in a desktop browser too, set out in two columns.
export default function MealDetailScreen() {
  return (
    <OrbitSection section="kitchen">
      <MealDetailPage />
    </OrbitSection>
  );
}

function MealDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const layout = useWideForm();
  const { colors: o, dark } = useOrbitTheme();

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
      const n = courseNutrition(course);
      if (!n) continue;
      if (n.calories != null) calories += n.calories;
      if (n.protein  != null) protein  += n.protein;
      if (n.carbs    != null) carbs    += n.carbs;
      if (n.fats     != null) fats     += n.fats;
      if (n.fiber    != null) fiber    += n.fiber;
      if (n.sodium   != null) sodium   += n.sodium;
    }
    return { calories, protein, carbs, fats, fiber, sodium };
  }, [meal]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={{ backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o.muted} />
        <Text className="mt-3 text-slate-500" style={{ color: o.muted }}>Loading meal...</Text>
      </SafeAreaView>
    );
  }

  if (error || !meal) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={{ backgroundColor: o.canvas }}>
        <Ionicons name="alert-circle-outline" size={42} color={o.faint} />
        <Text className="mt-4 text-lg font-bold text-slate-900" style={{ color: o.text }}>Could not load meal</Text>
        <Pressable
          className="mt-6 rounded-2xl bg-slate-200 px-6 py-3"
          style={{ backgroundColor: o.pill, borderRadius: 16 }}
          onPress={() => router.back()}
        >
          <Text className="font-semibold text-slate-700" style={{ color: o.onPill }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const courseCount = meal.courses?.length ?? 0;

  // (A heading over a card, and the green of a tag.)
  const eyebrow = { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.2, color: o.faint, marginBottom: 8, marginLeft: 4 };
  const card = { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  const tagChip = { backgroundColor: dark ? "rgba(52,211,153,0.14)" : "#ECFDF5" };
  const chips = (
    <View className="mt-3 flex-row flex-wrap gap-2">
      <View className="rounded-full bg-blue-100 px-3 py-1" style={{ backgroundColor: o.pill }}>
        <Text className="text-xs font-semibold text-blue-700" style={{ color: o.onPill }}>
          {MEAL_TYPE_LABEL[meal.type] ?? meal.type}
        </Text>
      </View>
      <View className="rounded-full bg-slate-100 px-3 py-1" style={{ backgroundColor: o.pill }}>
        <Text className="text-xs font-semibold text-slate-600" style={{ color: o.onPill }}>
          {courseCount} {courseCount === 1 ? "course" : "courses"}
        </Text>
      </View>
      {(meal.tags ?? []).map(tag => (
        <View key={tag._id} className="rounded-full bg-emerald-100 px-3 py-1" style={tagChip}>
          <Text className="text-xs font-semibold text-emerald-700" style={{ color: o.success }}>
            {tag.name}
          </Text>
        </View>
      ))}
    </View>
  );

  // Header: the name as the page's large title, the chips under it
  const headerSection = (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>{meal.name}</Text>
      {chips}
    </View>
  );

  // Courses
  const coursesSection = (
    <>
      {courseCount > 0 && (
        <>
          <Text className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500" style={eyebrow}>
            Courses
          </Text>
          <View className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            {meal.courses!.map((course, index) => {
              const recipeId = courseRecipe(course)?._id ?? null;
              const ingredientId = courseIngredient(course)?._id ?? null;
              const calories = courseNutrition(course)?.calories;
              const cal = calories != null ? Math.round(calories) : null;

              return (
                <Tap
                  key={course._id}
                  className={`flex-row items-center px-4 py-3.5 ${
                    index < meal.courses!.length - 1
                      ? "border-b border-slate-100"
                      : ""
                  } ${recipeId || ingredientId ? "active:bg-slate-50" : ""}`}
                  style={{ borderBottomColor: o.border }}
                  pressedStyle={recipeId || ingredientId ? { backgroundColor: o.pill } : {}}
                  onPress={() => {
                    if (recipeId)
                      router.push({
                        pathname: "/recipes/[id]",
                        params: { id: recipeId },
                      });
                    else if (ingredientId)
                      router.push({
                        pathname: "/ingredients/edit/[id]",
                        params: { id: ingredientId },
                      });
                  }}
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-50" style={{ backgroundColor: o.pill }}>
                    <Text className="text-xs font-bold text-blue-700" style={{ color: o.ink }}>
                      {index + 1}
                    </Text>
                  </View>

                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-slate-900" style={{ color: o.text }}>
                      {courseName(course)}
                    </Text>
                    <Text className="mt-0.5 text-sm text-slate-500" style={{ color: o.muted }}>
                      {ingredientId ? "Ingredient · " : ""}
                      {courseAmountLabel(course)}
                    </Text>
                  </View>

                  {cal != null && (
                    <Text className="mr-2 text-sm font-semibold text-slate-400" style={{ color: o.muted }}>
                      {cal} kcal
                    </Text>
                  )}
                  {(recipeId || ingredientId) && (
                    <Ionicons name="chevron-forward" size={18} color={o.faint} />
                  )}
                </Tap>
              );
            })}
          </View>
        </>
      )}
    </>
  );

  // Nutrition
  const nutritionSection = (
    <>
      {/* (Level with the courses' heading beside it, in a desktop browser.) */}
      <Text style={[eyebrow, layout.wide && { lineHeight: 20 }]}>MEAL NUTRITION</Text>
      <View style={{ ...card, borderWidth: 1, padding: 16 }}>
        <MealNutritionFigures totals={totalNutrition} />
      </View>
    </>
  );

  // Notes
  const notesSection = (
    <>
      {meal.notes ? (
        <>
          <Text className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500" style={{ ...eyebrow, marginTop: 24 }}>
            Notes
          </Text>
          <View className="rounded-2xl border border-slate-200 bg-white p-5" style={{ ...card, padding: 16 }}>
            <Text className="text-base leading-6 text-slate-600" style={{ color: o.icon }}>{meal.notes}</Text>
          </View>
        </>
      ) : null}
    </>
  );

  // (A desktop browser's page sits back from the edges a little more.)
  const gutter = layout.wide ? 24 : 16;

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" style={{ backgroundColor: o.canvas }}>
    {/* (In a desktop browser, a column down the middle of the canvas.) */}
    <View style={[{ flex: 1 }, layout.wide && { width: "100%", maxWidth: 1180, alignSelf: "center" }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Nav bar: round buttons on the page itself (the title's the large
          one in the page) */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: gutter - 4, paddingTop: layout.wide ? 16 : 4 }}>
        <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
          <Ionicons name="chevron-back" size={22} color={o.text} />
        </Tap>
        <View style={{ flex: 1 }} />
        <Tap onPress={() => router.push({ pathname: "/meals/edit/[id]", params: { id } })} accessibilityLabel="Edit meal" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
          <Ionicons name="create-outline" size={20} color={o.ink} />
        </Tap>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: 12,
          paddingBottom: 60,
        }}
      >
        {/* (In a desktop browser: the name across the top, then the meal on
            the left and its nutrition beside it.) */}
        {layout.wide ? (
          <>
            {headerSection}
            <View style={layout.columns}>
              <View style={{ flex: 1.5, minWidth: 0 }}>
                {coursesSection}
                {/* (The notes' heading brings its own gap.) */}
                <View style={{ marginTop: -24 }}>{notesSection}</View>
              </View>
              <View style={layout.column}>{nutritionSection}</View>
            </View>
          </>
        ) : (
          <>
            {headerSection}
            {coursesSection}
            {nutritionSection}
            {notesSection}
          </>
        )}
      </ScrollView>
    </View>
    </SafeAreaView>
    </OrbitPage>
  );
}
