import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CreatableMultiTagDropdown, FieldLabel, FormInput, SectionTitle } from "@/src/components/forms";
import {
  getMealById,
  updateMeal,
  type MealRecipeRef,
  type MealType,
} from "@/src/services/mealApi";
import { createTag, getTags, type SelectOption } from "@/src/services/optionsApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";

const MEAL_TYPE_OPTIONS: {
  value: MealType;
  label: string;
  icon: string;
  available: boolean;
}[] = [
  { value: "course", label: "Course-based", icon: "list-outline", available: true },
  { value: "bento", label: "Bento Box", icon: "grid-outline", available: false },
];

interface CourseFormEntry {
  id: string;
  recipeId: string | null;
  recipeName: string | null;
  servings: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function makeCourse(): CourseFormEntry {
  return { id: uid(), recipeId: null, recipeName: null, servings: "1" };
}

function resolveRecipeId(recipe: MealRecipeRef | string | null | undefined): string | null {
  if (!recipe) return null;
  if (typeof recipe === "string") return recipe;
  return recipe._id;
}

function resolveRecipeName(recipe: MealRecipeRef | string | null | undefined): string | null {
  if (!recipe || typeof recipe === "string") return null;
  return recipe.name;
}

export default function EditMealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mealType, setMealType] = useState<MealType>("course");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [courses, setCourses] = useState<CourseFormEntry[]>([]);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pickerCourseId, setPickerCourseId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const [meal, loadedRecipes, loadedTags] = await Promise.all([
          getMealById(id),
          getRecipes(),
          getTags(),
        ]);

        if (cancelled) return;

        setMealType(meal.type);
        setName(meal.name);
        setNotes(meal.notes ?? "");
        setCourses(
          (meal.courses ?? []).map(c => ({
            id: c._id,
            recipeId: resolveRecipeId(c.recipe),
            recipeName: resolveRecipeName(c.recipe),
            servings: String(c.servings),
          })),
        );
        setRecipes(loadedRecipes);
        setAllTags(loadedTags);
        setSelectedTags(meal.tags ?? []);
      } catch (err) {
        if (!cancelled) {
          Alert.alert(
            "Could not load",
            err instanceof Error ? err.message : "Failed to load meal.",
            [{ text: "OK", onPress: () => router.back() }],
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [id]);

  const filteredPickerRecipes = useMemo(
    () =>
      recipes.filter(r =>
        r.name.toLowerCase().includes(pickerSearch.toLowerCase()),
      ),
    [recipes, pickerSearch],
  );

  const totalNutrition = useMemo(() => {
    let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0, sodium = 0;
    for (const course of courses) {
      if (!course.recipeId) continue;
      const recipe = recipes.find(r => r._id === course.recipeId);
      if (!recipe?.nutrition) continue;
      const servings = Number(course.servings) || 1;
      const n = recipe.nutrition;
      if (n.calories != null) calories += n.calories * servings;
      if (n.protein  != null) protein  += n.protein  * servings;
      if (n.carbs    != null) carbs    += n.carbs    * servings;
      if (n.fats     != null) fats     += n.fats     * servings;
      if (n.fiber    != null) fiber    += n.fiber    * servings;
      if (n.sodium   != null) sodium   += n.sodium   * servings;
    }
    return { calories, protein, carbs, fats, fiber, sodium };
  }, [courses, recipes]);

  function updateCourse(courseId: string, patch: Partial<CourseFormEntry>) {
    setCourses(prev =>
      prev.map(c => (c.id === courseId ? { ...c, ...patch } : c)),
    );
  }

  function removeCourse(courseId: string) {
    setCourses(prev => prev.filter(c => c.id !== courseId));
  }

  async function handleCreateTag(tagName: string): Promise<SelectOption> {
    const tag = await createTag(tagName);
    setAllTags(prev => (prev.some(t => t._id === tag._id) ? prev : [...prev, tag]));
    return tag;
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Give your meal a name.");
      return;
    }
    if (courses.length === 0) {
      Alert.alert("Add a course", "Add at least one course to your meal.");
      return;
    }

    try {
      setSaving(true);

      // Tags typed but not yet matched to a real record (pending, no _id
      // yet) get created here — no separate "create" tap was needed for them.
      const resolvedTags = await Promise.all(
        selectedTags.map((tag) =>
          tag._id
            ? tag
            : resolveOrCreateOption(allTags, "", tag.name, handleCreateTag),
        ),
      );

      await updateMeal(id, {
        name: trimmedName,
        type: mealType,
        tags: resolvedTags.filter((t): t is SelectOption => t != null).map(t => t._id),
        notes: notes.trim() || undefined,
        courses: courses.map((c, i) => ({
          label: `Course ${i + 1}`,
          recipe: c.recipeId,
          servings: Number(c.servings) || 1,
        })),
      });
      router.back();
    } catch (err) {
      Alert.alert(
        "Could not save",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading meal...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 items-center justify-center px-1 active:opacity-60"
            onPress={() => router.back()}
            disabled={saving}
          >
            <Text className="text-base font-medium text-slate-500">Cancel</Text>
          </Pressable>
          <Text className="ml-3 flex-1 text-xl font-bold text-slate-950">
            Edit Meal
          </Text>
          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${
              saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
            }`}
            onPress={() => void handleSave()}
          >
            <Text className="font-semibold text-white">
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 20,
            paddingBottom: 80,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <SectionTitle
            first
            icon="restaurant-outline"
            title="Meal details"
            description="Give your meal a name and pick what it's made of."
          />

          {/* Meal type dropdown */}
          <FieldLabel text="Meal type" required />
          <View className="relative mb-5">
            <Pressable
              className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
              onPress={() => setShowTypePicker(v => !v)}
            >
              <Ionicons
                name={
                  (MEAL_TYPE_OPTIONS.find(o => o.value === mealType)
                    ?.icon as any) ?? "list-outline"
                }
                size={20}
                color="#2563EB"
              />
              <Text className="ml-3 flex-1 text-base text-slate-950">
                {MEAL_TYPE_OPTIONS.find(o => o.value === mealType)?.label ??
                  "Select type"}
              </Text>
              <Ionicons
                name={showTypePicker ? "chevron-up" : "chevron-down"}
                size={18}
                color="#64748B"
              />
            </Pressable>

            {showTypePicker && (
              <View
                className="absolute left-0 right-0 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                style={{ elevation: 20 }}
              >
                {MEAL_TYPE_OPTIONS.filter((option) => option.available).map((option, i, visible) => (
                  <Pressable
                    key={option.value}
                    className={`flex-row items-center px-4 py-3.5 ${
                      i < visible.length - 1
                        ? "border-b border-slate-100"
                        : ""
                    } active:bg-slate-50`}
                    onPress={() => {
                      setMealType(option.value);
                      setShowTypePicker(false);
                    }}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={18}
                      color="#64748B"
                    />
                    <Text className="ml-3 flex-1 text-base text-slate-800">
                      {option.label}
                    </Text>
                    {option.value === mealType && (
                      <Ionicons name="checkmark" size={18} color="#2563EB" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Meal name */}
          <FieldLabel text="Meal name" required />
          <FormInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Sunday Dinner"
            className="mb-5"
          />

          {/* Notes */}
          <FieldLabel text="Notes (optional)" />
          <FormInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes about this meal"
            multiline
            className="mb-6"
          />

          {/* Tags */}
          <FieldLabel text="Tags (optional)" />
          <View className="mb-5">
            <CreatableMultiTagDropdown
              options={allTags}
              selectedItems={selectedTags}
              placeholder="Add a tag…"
              onAdd={(option: SelectOption) => {
                const isDuplicate = option._id
                  ? selectedTags.some(t => t._id === option._id)
                  : selectedTags.some(
                      t => t.name.trim().toLowerCase() === option.name.trim().toLowerCase(),
                    );

                if (!isDuplicate) {
                  setSelectedTags(prev => [...prev, option]);
                }
              }}
              onRemove={(id: string) =>
                setSelectedTags(prev => prev.filter(t => t._id !== id))
              }
            />
          </View>

          {/* Nutrition summary */}
          <SectionTitle
            icon="flame-outline"
            title="Nutrition"
            description="Totalled automatically from each course's recipe and servings."
          />
          <View className="mb-6">
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
          </View>

          {/* Courses */}
          <SectionTitle
            icon="list-outline"
            title="Courses"
            description={`${courses.length} ${courses.length === 1 ? "course" : "courses"} in this meal.`}
          />

          {courses.map((course, index) => (
            <View
              key={course.id}
              className="mb-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-slate-700">
                  Course {index + 1}
                </Text>
                <Pressable
                  onPress={() => removeCourse(course.id)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 active:bg-red-100"
                >
                  <Ionicons name="close" size={16} color="#64748B" />
                </Pressable>
              </View>

              {/* Recipe */}
              <Text className="mb-1.5 text-xs font-semibold text-slate-500">
                Recipe
              </Text>
              <Pressable
                className="mb-3 h-11 flex-row items-center rounded-xl border border-slate-200 bg-slate-50 px-3 active:bg-slate-100"
                onPress={() => {
                  setPickerCourseId(course.id);
                  setPickerSearch("");
                }}
              >
                <Ionicons name="book-outline" size={16} color="#64748B" />
                <Text
                  className={`ml-2 flex-1 text-sm ${
                    course.recipeName ? "text-slate-900" : "text-slate-400"
                  }`}
                  numberOfLines={1}
                >
                  {course.recipeName ?? "Select a recipe"}
                </Text>
                {course.recipeId ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      updateCourse(course.id, {
                        recipeId: null,
                        recipeName: null,
                      })
                    }
                  >
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </Pressable>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                )}
              </Pressable>

              {/* Servings */}
              <Text className="mb-1.5 text-xs font-semibold text-slate-500">
                Servings
              </Text>
              <TextInput
                value={course.servings}
                onChangeText={v => updateCourse(course.id, { servings: v })}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor="#94A3B8"
                className="h-11 w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-950"
              />
            </View>
          ))}

          <Pressable
            className="mt-1 flex-row items-center justify-center rounded-3xl border border-dashed border-blue-400 bg-blue-50 py-4 active:bg-blue-100"
            onPress={() => setCourses(prev => [...prev, makeCourse()])}
          >
            <Ionicons name="add-circle-outline" size={20} color="#2563EB" />
            <Text className="ml-2 font-semibold text-blue-600">Add course</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Recipe picker modal */}
      <Modal
        visible={pickerCourseId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerCourseId(null)}
      >
        <SafeAreaView
          className="flex-1 bg-slate-50"
          edges={["top", "left", "right"]}
        >
          <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
            <Text className="flex-1 text-lg font-bold text-slate-950">
              Select recipe
            </Text>
            <Pressable onPress={() => setPickerCourseId(null)}>
              <Text className="font-semibold text-blue-600">Cancel</Text>
            </Pressable>
          </View>

          <View className="px-4 py-3">
            <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
              <Ionicons name="search-outline" size={19} color="#64748B" />
              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="Search recipes"
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

          <FlatList
            data={filteredPickerRecipes}
            keyExtractor={r => r._id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            renderItem={({ item: recipe }) => (
              <Pressable
                className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                onPress={() => {
                  if (pickerCourseId) {
                    updateCourse(pickerCourseId, {
                      recipeId: recipe._id,
                      recipeName: recipe.name,
                    });
                  }
                  setPickerCourseId(null);
                }}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-50">
                  <Ionicons name="book-outline" size={18} color="#2563EB" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-900">
                    {recipe.name}
                  </Text>
                  {recipe.nutrition?.calories != null && (
                    <Text className="mt-0.5 text-sm text-slate-500">
                      {Math.round(recipe.nutrition.calories)} kcal / serving
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </Pressable>
            )}
            ListEmptyComponent={
              <View className="items-center py-16">
                <Ionicons name="book-outline" size={42} color="#94A3B8" />
                <Text className="mt-4 text-lg font-bold text-slate-900">
                  No recipes found
                </Text>
                <Text className="mt-2 text-center text-slate-500">
                  Try a different search term.
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
