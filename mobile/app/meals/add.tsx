import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CreatableMultiTagDropdown, FieldLabel, FormInput, SectionTitle } from "@/src/components/forms";
import { createMeal, type MealType } from "@/src/services/mealApi";
import { createTag, getTags, type SelectOption } from "@/src/services/optionsApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import {
  courseFormToInput,
  courseFormTotals,
  incompleteCourseMessage,
  makeCourse,
  MealCoursesEditor,
  type CourseFormEntry,
} from "@/src/components/meals/MealCoursesEditor";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";

const MEAL_TYPE_OPTIONS: { value: MealType; label: string; icon: string; available: boolean }[] = [
  { value: "course", label: "Course-based", icon: "list-outline", available: true },
  { value: "bento", label: "Bento Box", icon: "grid-outline", available: false },
];

export default function AddMealScreen() {
  const router = useRouter();

  const [mealType, setMealType] = useState<MealType>("course");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [courses, setCourses] = useState<CourseFormEntry[]>([makeCourse()]);
  const [saving, setSaving] = useState(false);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);

  // Scrolls whichever field was just focused/opened into view — see
  // useScrollFocusSection for why zIndex has to descend in on-screen order
  // (only the fields that can show a dropdown need one; plain text fields
  // default to 0 and don't need to be listed here). Tags is the only
  // dropdown-capable field on this page.
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const nameSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const notesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const tagsSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 20);
  const coursesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getRecipes(), getIngredients(), getTags()])
      .then(([r, i, t]) => {
        if (!cancelled) {
          setRecipes(r);
          setIngredients(i);
          setAllTags(t);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const totalNutrition = useMemo(
    () => courseFormTotals(courses, recipes, ingredients),
    [courses, recipes, ingredients],
  );

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
    const incomplete = incompleteCourseMessage(courses);
    if (incomplete) {
      Alert.alert("Finish your courses", incomplete);
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

      await createMeal({
        name: trimmedName,
        type: mealType,
        tags: resolvedTags.filter((t): t is SelectOption => t != null).map(t => t._id),
        notes: notes.trim() || undefined,
        courses: courses.map(courseFormToInput),
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
          <Text className="ml-3 flex-1 text-xl font-bold text-slate-950">New Meal</Text>
          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => void handleSave()}
          >
            <Text className="font-semibold text-white">
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
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
                name={MEAL_TYPE_OPTIONS.find(o => o.value === mealType)?.icon as any ?? "list-outline"}
                size={20}
                color="#2563EB"
              />
              <Text className="ml-3 flex-1 text-base text-slate-950">
                {MEAL_TYPE_OPTIONS.find(o => o.value === mealType)?.label ?? "Select type"}
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
                      i < visible.length - 1 ? "border-b border-slate-100" : ""
                    } active:bg-slate-50`}
                    onPress={() => {
                      setMealType(option.value);
                      setShowTypePicker(false);
                    }}
                  >
                    <Ionicons name={option.icon as any} size={18} color="#64748B" />
                    <Text className="ml-3 flex-1 text-base text-slate-800">{option.label}</Text>
                    {option.value === mealType && (
                      <Ionicons name="checkmark" size={18} color="#2563EB" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Meal name */}
          <View {...nameSection.wrapperProps}>
          <FieldLabel text="Meal name" required />
          <FormInput
            value={name}
            onChangeText={setName}
            onFocus={nameSection.trigger}
            placeholder="e.g. Sunday Dinner"
            className="mb-5"
          />
          </View>

          {/* Notes */}
          <View {...notesSection.wrapperProps}>
          <FieldLabel text="Notes (optional)" />
          <FormInput
            value={notes}
            onChangeText={setNotes}
            onFocus={notesSection.trigger}
            placeholder="Any notes about this meal"
            multiline
            className="mb-6"
          />
          </View>

          {/* Tags */}
          <FieldLabel text="Tags (optional)" />
          <View className="mb-5" {...tagsSection.wrapperProps}>
            <CreatableMultiTagDropdown
              options={allTags}
              selectedItems={selectedTags}
              placeholder="Add a tag…"
              onOpen={tagsSection.trigger}
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
            description="Totalled automatically from each course's recipe or ingredient."
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

          <View {...coursesSection.wrapperProps}>
            <MealCoursesEditor
              courses={courses}
              onChange={setCourses}
              recipes={recipes}
              ingredients={ingredients}
              onFieldFocus={coursesSection.trigger}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}
