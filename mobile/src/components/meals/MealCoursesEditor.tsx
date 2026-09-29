import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CreatableStringDropdown, SegmentedToggle } from "@/src/components/forms";
import type { Ingredient } from "@/src/services/ingredientApi";
import type { CourseEntry, CourseInput } from "@/src/services/mealApi";
import type { Recipe } from "@/src/services/recipeApi";
import { scaleIngredientNutrition } from "@/src/utils/mealPlan";
import { getIngredientConversions, getRelatedUnits } from "@/src/utils/unitConversion";

// The course list shared by the add- and edit-meal forms. A course is either
// a recipe (eaten in servings) or a single ingredient (eaten as an amount in
// a unit, e.g. 150 g of Greek yogurt next to a curry).

export type CourseKind = "recipe" | "ingredient";

export interface CourseFormEntry {
  id: string;
  kind: CourseKind;
  recipeId: string | null;
  recipeName: string | null;
  servings: string;
  ingredientId: string | null;
  ingredientName: string | null;
  quantity: string;
  unit: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export function makeCourse(): CourseFormEntry {
  return {
    id: uid(),
    kind: "recipe",
    recipeId: null,
    recipeName: null,
    servings: "1",
    ingredientId: null,
    ingredientName: null,
    quantity: "",
    unit: "",
  };
}

// A saved course -> its form entry.
export function courseFormFromMeal(course: CourseEntry): CourseFormEntry {
  const ingredient = course.ingredient;
  if (ingredient) {
    return {
      ...makeCourse(),
      id: course._id,
      kind: "ingredient",
      ingredientId: typeof ingredient === "string" ? ingredient : ingredient._id,
      ingredientName: typeof ingredient === "string" ? null : ingredient.name,
      quantity: course.quantity != null ? String(course.quantity) : "",
      unit: course.unit ?? "",
    };
  }
  const recipe = course.recipe;
  return {
    ...makeCourse(),
    id: course._id,
    recipeId: recipe ? (typeof recipe === "string" ? recipe : recipe._id) : null,
    recipeName: recipe && typeof recipe !== "string" ? recipe.name : null,
    servings: String(course.servings),
  };
}

// A form entry -> what the API saves (only the chosen kind's fields set).
export function courseFormToInput(course: CourseFormEntry, index: number): CourseInput {
  const label = `Course ${index + 1}`;
  if (course.kind === "ingredient") {
    return {
      label,
      recipe: null,
      ingredient: course.ingredientId,
      quantity: Number(course.quantity) || 0,
      unit: course.unit.trim(),
    };
  }
  return {
    label,
    recipe: course.recipeId,
    servings: Number(course.servings) || 1,
    ingredient: null,
    quantity: null,
    unit: "",
  };
}

// The first course that's missing its recipe/ingredient or amount, as a
// message for the save alert — null when every course is complete.
export function incompleteCourseMessage(courses: CourseFormEntry[]): string | null {
  for (const [index, course] of courses.entries()) {
    if (course.kind === "ingredient") {
      if (!course.ingredientId) return `Course ${index + 1} needs an ingredient.`;
      if (!(Number(course.quantity) > 0)) return `Course ${index + 1} needs an amount.`;
      if (!course.unit.trim()) return `Course ${index + 1} needs a unit.`;
    }
  }
  return null;
}

export interface MealFormTotals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  sodium: number;
}

// Live totals for the form's nutrition summary.
export function courseFormTotals(
  courses: CourseFormEntry[],
  recipes: Recipe[],
  ingredients: Ingredient[],
): MealFormTotals {
  const totals: MealFormTotals = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0 };
  const add = (n: Partial<Record<keyof MealFormTotals, number | null | undefined>> | null | undefined, scale = 1) => {
    if (!n) return;
    for (const key of Object.keys(totals) as (keyof MealFormTotals)[]) {
      const value = n[key];
      if (value != null) totals[key] += value * scale;
    }
  };

  for (const course of courses) {
    if (course.kind === "ingredient") {
      const ingredient = ingredients.find((i) => i._id === course.ingredientId);
      const quantity = Number(course.quantity);
      if (!ingredient || !(quantity > 0)) continue;
      add(
        scaleIngredientNutrition(
          ingredient,
          quantity,
          course.unit || ingredient.defaultPortionUnit || "",
          getIngredientConversions(ingredient, [], ingredients),
        ),
      );
    } else {
      const recipe = recipes.find((r) => r._id === course.recipeId);
      add(recipe?.nutrition, Number(course.servings) || 1);
    }
  }
  return totals;
}

export function MealCoursesEditor({
  courses,
  onChange,
  recipes,
  ingredients,
  onFieldFocus,
}: {
  courses: CourseFormEntry[];
  onChange: (courses: CourseFormEntry[]) => void;
  recipes: Recipe[];
  ingredients: Ingredient[];
  onFieldFocus?: () => void;
}) {
  const [pickerCourseId, setPickerCourseId] = useState<string | null>(null);
  const [pickerKind, setPickerKind] = useState<CourseKind>("recipe");
  const [pickerSearch, setPickerSearch] = useState("");

  const search = pickerSearch.trim().toLowerCase();
  const pickerRecipes = useMemo(
    () => recipes.filter((r) => r.name.toLowerCase().includes(search)),
    [recipes, search],
  );
  const pickerIngredients = useMemo(
    () => ingredients.filter((i) => i.name.toLowerCase().includes(search)),
    [ingredients, search],
  );

  function updateCourse(courseId: string, patch: Partial<CourseFormEntry>) {
    onChange(courses.map((c) => (c.id === courseId ? { ...c, ...patch } : c)));
  }

  function openPicker(course: CourseFormEntry) {
    setPickerCourseId(course.id);
    setPickerKind(course.kind);
    setPickerSearch("");
  }

  function pickRecipe(recipe: Recipe) {
    if (pickerCourseId) {
      updateCourse(pickerCourseId, { kind: "recipe", recipeId: recipe._id, recipeName: recipe.name });
    }
    setPickerCourseId(null);
  }

  function pickIngredient(ingredient: Ingredient) {
    if (pickerCourseId) {
      updateCourse(pickerCourseId, {
        kind: "ingredient",
        ingredientId: ingredient._id,
        ingredientName: ingredient.name,
        // Starts at one of its own portions; the amount is editable.
        quantity: String(ingredient.defaultPortionAmount ?? 1),
        unit: ingredient.defaultPortionUnit ?? "",
      });
    }
    setPickerCourseId(null);
  }

  return (
    <>
      {courses.map((course, index) => {
        const isIngredient = course.kind === "ingredient";
        const chosenName = isIngredient ? course.ingredientName : course.recipeName;
        const chosenId = isIngredient ? course.ingredientId : course.recipeId;
        const ingredient = isIngredient ? ingredients.find((i) => i._id === course.ingredientId) : undefined;
        const unitOptions = ingredient?.defaultPortionUnit
          ? getRelatedUnits(ingredient.defaultPortionUnit, getIngredientConversions(ingredient, [], ingredients))
          : [];

        return (
          <View key={course.id} className="mb-3 rounded-2xl bg-slate-50 p-3">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-slate-700">Course {index + 1}</Text>
              <Pressable
                onPress={() => onChange(courses.filter((c) => c.id !== course.id))}
                className="h-8 w-8 items-center justify-center rounded-full bg-white active:bg-red-100"
              >
                <Ionicons name="close" size={16} color="#64748B" />
              </Pressable>
            </View>

            <Text className="mb-1.5 text-xs font-semibold text-slate-500">
              {isIngredient ? "Ingredient" : "Recipe"}
            </Text>
            <Pressable
              className="mb-3 h-11 flex-row items-center rounded-xl border border-slate-200 bg-white px-3 active:bg-slate-100"
              onPress={() => openPicker(course)}
            >
              <Ionicons name={isIngredient ? "nutrition-outline" : "book-outline"} size={16} color="#64748B" />
              <Text
                className={`ml-2 flex-1 text-sm ${chosenName ? "text-slate-900" : "text-slate-400"}`}
                numberOfLines={1}
              >
                {chosenName ?? "Select a recipe or ingredient"}
              </Text>
              {chosenId ? (
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    updateCourse(
                      course.id,
                      isIngredient
                        ? { ingredientId: null, ingredientName: null, quantity: "", unit: "" }
                        : { recipeId: null, recipeName: null },
                    )
                  }
                >
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </Pressable>
              ) : (
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              )}
            </Pressable>

            {isIngredient ? (
              <>
                <Text className="mb-1.5 text-xs font-semibold text-slate-500">Amount</Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={course.quantity}
                    onChangeText={(v) => updateCourse(course.id, { quantity: v })}
                    onFocus={onFieldFocus}
                    keyboardType="decimal-pad"
                    placeholder="Amount"
                    placeholderTextColor="#94A3B8"
                    className="h-11 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950"
                  />
                  <View className="flex-1">
                    <CreatableStringDropdown
                      compact
                      height={44}
                      options={unitOptions}
                      selectedValue={course.unit}
                      placeholder="Unit"
                      onSelect={(unit) => updateCourse(course.id, { unit })}
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text className="mb-1.5 text-xs font-semibold text-slate-500">Servings</Text>
                <TextInput
                  value={course.servings}
                  onChangeText={(v) => updateCourse(course.id, { servings: v })}
                  onFocus={onFieldFocus}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor="#94A3B8"
                  className="h-11 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950"
                />
              </>
            )}
          </View>
        );
      })}

      <Pressable
        className="flex-row items-center justify-center rounded-2xl border border-dashed border-blue-300 bg-blue-50 py-3.5 active:bg-blue-100"
        onPress={() => onChange([...courses, makeCourse()])}
      >
        <Ionicons name="add-circle-outline" size={20} color="#2563EB" />
        <Text className="ml-2 font-semibold text-blue-600">Add course</Text>
      </Pressable>

      {/* Recipe / ingredient picker */}
      <Modal
        visible={pickerCourseId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerCourseId(null)}
      >
        <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
          <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
            <Text className="flex-1 text-lg font-bold text-slate-950">
              {pickerKind === "recipe" ? "Select recipe" : "Select ingredient"}
            </Text>
            <Pressable onPress={() => setPickerCourseId(null)}>
              <Text className="font-semibold text-blue-600">Cancel</Text>
            </Pressable>
          </View>

          <View className="gap-3 px-4 py-3">
            <SegmentedToggle<CourseKind>
              compact
              value={pickerKind}
              options={[
                { value: "recipe", label: "Recipes" },
                { value: "ingredient", label: "Ingredients" },
              ] as const}
              onChange={setPickerKind}
            />
            <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
              <Ionicons name="search-outline" size={19} color="#64748B" />
              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder={pickerKind === "recipe" ? "Search recipes" : "Search ingredients"}
                placeholderTextColor="#94A3B8"
                autoFocus
                className="ml-3 flex-1 text-base text-slate-900"
              />
              {pickerSearch.length > 0 && (
                <Pressable onPress={() => setPickerSearch("")}>
                  <Ionicons name="close-circle" size={19} color="#94A3B8" />
                </Pressable>
              )}
            </View>
          </View>

          {pickerKind === "recipe" ? (
            <FlatList
              data={pickerRecipes}
              keyExtractor={(r) => r._id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              renderItem={({ item: recipe }) => (
                <PickerRow
                  icon="book-outline"
                  name={recipe.name}
                  detail={
                    recipe.nutrition?.calories != null
                      ? `${Math.round(recipe.nutrition.calories)} kcal / serving`
                      : undefined
                  }
                  onPress={() => pickRecipe(recipe)}
                />
              )}
              ListEmptyComponent={<PickerEmpty text="No recipes found" />}
            />
          ) : (
            <FlatList
              data={pickerIngredients}
              keyExtractor={(i) => i._id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              renderItem={({ item: ingredient }) => (
                <PickerRow
                  icon="nutrition-outline"
                  name={ingredient.name}
                  detail={
                    ingredient.nutrition?.calories != null
                      ? `${Math.round(ingredient.nutrition.calories)} kcal / ${ingredient.defaultPortionAmount ?? 1} ${ingredient.defaultPortionUnit ?? ""}`.trim()
                      : undefined
                  }
                  onPress={() => pickIngredient(ingredient)}
                />
              )}
              ListEmptyComponent={<PickerEmpty text="No ingredients found" />}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function PickerRow({
  icon,
  name,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
      onPress={onPress}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
        <Ionicons name={icon} size={18} color="#2563EB" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="font-semibold text-slate-900">{name}</Text>
        {!!detail && <Text className="mt-0.5 text-sm text-slate-500">{detail}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </Pressable>
  );
}

function PickerEmpty({ text }: { text: string }) {
  return (
    <View className="items-center py-16">
      <Ionicons name="search-outline" size={42} color="#94A3B8" />
      <Text className="mt-4 text-lg font-bold text-slate-900">{text}</Text>
      <Text className="mt-2 text-center text-slate-500">Try a different search term.</Text>
    </View>
  );
}

export default MealCoursesEditor;
