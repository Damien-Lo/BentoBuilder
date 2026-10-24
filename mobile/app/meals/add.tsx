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

import { addIngredientTo, CreatableMultiTagDropdown, FieldLabel, FormCard, FormInput } from "@/src/components/forms";
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
  MealNutritionFigures,
  type CourseFormEntry,
} from "@/src/components/meals/MealCoursesEditor";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { useWideForm } from "@/src/components/forms/wideForm";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

const MEAL_TYPE_OPTIONS: { value: MealType; label: string; icon: string; available: boolean }[] = [
  { value: "course", label: "Course-based", icon: "list-outline", available: true },
  { value: "bento", label: "Bento Box", icon: "grid-outline", available: false },
];

// A new saved meal (Kitchen): in Orbit's look, in the Kitchen's colours —
// in a desktop browser too, in two columns.
export default function AddMealScreen() {
  return (
    <OrbitSection section="kitchen">
      <AddMealPage />
    </OrbitSection>
  );
}

function AddMealPage() {
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
  const layout = useWideForm();
  const { colors: o } = useOrbitTheme();

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

  // Nutrition summary
  const nutritionCard = (
    <FormCard icon="flame-outline" title="Nutrition" description="Totalled from each course's recipe or ingredient." zIndex={40}>
      {/* (The calories large, the rest beside each other.) */}
      <View style={{ marginTop: 14 }}>
        <MealNutritionFigures totals={totalNutrition} />
      </View>
    </FormCard>
  );

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={{ backgroundColor: o.canvas }}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        className="flex-1"
        style={layout.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header: a round way out and Save over a large title, on the page
            itself */}
        <View style={{ paddingHorizontal: 16, paddingTop: layout.wide ? 16 : 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4, minHeight: 40 }}>
            <Tap onPress={() => router.back()} disabled={saving} accessibilityLabel="Cancel" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
              <Ionicons name="close" size={21} color={o.text} />
            </Tap>
            <View style={{ flex: 1 }} />
            <Tap disabled={saving} onPress={() => void handleSave()} style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: 20, backgroundColor: o.ink, opacity: saving ? 0.5 : 1 }} pressedStyle={{ opacity: 0.8 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: o.onInk }}>{saving ? "Saving..." : "Save"}</Text>
            </Tap>
          </View>
          <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>New Meal</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          {/* (In a desktop browser: two columns.) */}
          <View style={layout.columns}>
          <View style={[layout.column, { zIndex: 2 }]}>
          <FormCard icon="restaurant-outline" title="Meal details" description="Give your meal a name and pick what it's made of." zIndex={60}>

          {/* Meal type dropdown */}
          <FieldLabel text="Meal type" required />
          <View className="relative" style={{ zIndex: 10 }}>
            <Pressable
              className="h-14 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4"
              style={{ backgroundColor: o.surface, borderColor: o.border }}
              onPress={() => setShowTypePicker(v => !v)}
            >
              <Ionicons
                name={MEAL_TYPE_OPTIONS.find(o => o.value === mealType)?.icon as any ?? "list-outline"}
                size={20}
                color={o.ink}
              />
              <Text className="ml-3 flex-1 text-base text-slate-950" style={{ color: o.text }}>
                {MEAL_TYPE_OPTIONS.find(o => o.value === mealType)?.label ?? "Select type"}
              </Text>
              <Ionicons
                name={showTypePicker ? "chevron-up" : "chevron-down"}
                size={18}
                color={o.muted}
              />
            </Pressable>

            {showTypePicker && (
              <View
                className="absolute left-0 right-0 top-16 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                style={[{ elevation: 20 }, { backgroundColor: o.surface, borderColor: o.border }]}
              >
                {MEAL_TYPE_OPTIONS.filter((option) => option.available).map((option, i, visible) => (
                  <Tap
                    key={option.value}
                    className={`flex-row items-center px-4 py-3.5 ${
                      i < visible.length - 1 ? "border-b border-slate-100" : ""
                    } active:bg-slate-50`}
                    style={{ borderBottomColor: o.border }}
                    pressedStyle={{ backgroundColor: o.pill }}
                    onPress={() => {
                      setMealType(option.value);
                      setShowTypePicker(false);
                    }}
                  >
                    <Ionicons name={option.icon as any} size={18} color={o.muted} />
                    <Text className="ml-3 flex-1 text-base text-slate-800" style={{ color: o.text }}>{option.label}</Text>
                    {option.value === mealType && (
                      <Ionicons name="checkmark" size={18} color={o.ink} />
                    )}
                  </Tap>
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
          />
          </View>

          {/* Tags */}
          <FieldLabel text="Tags (optional)" />
          <View {...tagsSection.wrapperProps}>
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
          </FormCard>
          {/* (In a desktop browser the totals sit under the details, beside the courses.) */}
          {layout.wide ? nutritionCard : null}
          </View>
          <View style={[layout.column, { zIndex: 1 }]}>

          {/* Courses */}
          <FormCard icon="list-outline" title="Courses" description={`${courses.length} ${courses.length === 1 ? "course" : "courses"} in this meal.`} zIndex={50}>
          <View className="h-3" />

          <View {...coursesSection.wrapperProps}>
            <MealCoursesEditor
              courses={courses}
              onChange={setCourses}
              recipes={recipes}
              ingredients={ingredients}
              onIngredientAdded={(ingredient) => setIngredients(addIngredientTo(ingredient))}
              onFieldFocus={coursesSection.trigger}
            />
          </View>
          </FormCard>

          {/* Nutrition summary */}
          {layout.wide ? null : nutritionCard}
          </View>
          </View>

          <View style={layout.actions}>
          <Tap
            disabled={saving}
            onPress={() => void handleSave()}
            className={`mt-2 items-center rounded-2xl py-4 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            style={{ height: 52, paddingVertical: 0, justifyContent: "center", borderRadius: 16, backgroundColor: o.ink, opacity: saving ? 0.5 : 1 }}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text className="text-base font-semibold text-white" style={{ color: o.onInk }}>{saving ? "Saving..." : "Save meal"}</Text>
          </Tap>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </SafeAreaView>
    </OrbitPage>
  );
}
