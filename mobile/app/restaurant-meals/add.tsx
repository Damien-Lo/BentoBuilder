import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CreatableMultiTagDropdown,
  FieldLabel,
  FormInput,
  PriceInput,
  SectionTitle,
} from "@/src/components/forms";
import { PhotoCaptureModal } from "@/src/components/PhotoCaptureModal";

import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { createTag, getTags, type SelectOption } from "@/src/services/optionsApi";
import {
  createRestaurantMeal,
  estimateDishesFromPhoto,
  type DishInput,
  type EstimatedDish,
} from "@/src/services/restaurantMealApi";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import { setPendingNewRestaurant } from "@/src/utils/pendingNewRestaurantStore";

type DishRow = {
  key: string;
  name: string;
  notes: string;
  price: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  fiber: string;
  sodium: string;
};

function newDishRow(): DishRow {
  return {
    key: `dish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    notes: "",
    price: "",
    calories: "",
    protein: "",
    carbs: "",
    fats: "",
    fiber: "",
    sodium: "",
  };
}

// Manual nutrition entry is entirely optional per dish — restaurant
// nutrition is rarely known precisely. An empty field means "unknown",
// not zero, so it's omitted rather than sent as 0.
function parseOptionalNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// "append" is the top-level "Scan a photo" button (one photo may cover
// several dishes on a table); "update" is a single dish card's own scan
// button (one photo, exactly that one card) — same capture modal and
// endpoint either way, just a different singleDish flag and what happens
// with the result.
type ScanTarget = { mode: "append" } | { mode: "update"; key: string };

function estimatedDishToRowFields(d: EstimatedDish) {
  return {
    name: d.name,
    notes: d.confidence !== "high" ? `[${d.confidence} confidence] ${d.portionNote}` : d.portionNote,
    calories: d.estimatedNutrition.calories != null ? String(d.estimatedNutrition.calories) : "",
    protein:  d.estimatedNutrition.protein  != null ? String(d.estimatedNutrition.protein)  : "",
    carbs:    d.estimatedNutrition.carbs    != null ? String(d.estimatedNutrition.carbs)    : "",
    fats:     d.estimatedNutrition.fats     != null ? String(d.estimatedNutrition.fats)     : "",
    fiber:    d.estimatedNutrition.fiber    != null ? String(d.estimatedNutrition.fiber)    : "",
    sodium:   d.estimatedNutrition.sodium   != null ? String(d.estimatedNutrition.sodium)   : "",
  };
}

// One dish card in the menu list — its own scroll-focus sections (declared
// here, per row, rather than once for the whole page) so each card's fields
// scroll themselves into view within the *shared* page-level ScrollView
// regardless of which card they're in. None of this card's fields are
// dropdown-capable, so every section omits zIndex (defaults to 0).
function DishCard({
  dish,
  index,
  scrollRef,
  scrollAnchorRef,
  updateDish,
  removeDish,
  onScanDish,
}: {
  dish: DishRow;
  index: number;
  scrollRef: RefObject<ScrollView | null>;
  scrollAnchorRef: RefObject<View | null>;
  updateDish: (key: string, patch: Partial<DishRow>) => void;
  removeDish: (key: string) => void;
  onScanDish: (key: string) => void;
}) {
  const nameSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const notesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const priceSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const nutritionSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Dish {index + 1}
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable hitSlop={8} onPress={() => onScanDish(dish.key)}>
            <Ionicons name="camera-outline" size={20} color="#2563EB" />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => removeDish(dish.key)}>
            <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
          </Pressable>
        </View>
      </View>

      <View {...nameSection.wrapperProps}>
        <FieldLabel text="Dish name" required />
        <FormInput
          value={dish.name}
          placeholder="e.g. Burrito bowl"
          onFocus={nameSection.trigger}
          onChangeText={(text) => updateDish(dish.key, { name: text })}
        />
      </View>

      <View {...notesSection.wrapperProps}>
        <FieldLabel text="Notes" />
        <FormInput
          value={dish.notes}
          placeholder="e.g. Extra hot salsa, no rice…"
          onFocus={notesSection.trigger}
          onChangeText={(text) => updateDish(dish.key, { notes: text })}
        />
      </View>

      <View {...priceSection.wrapperProps}>
        <FieldLabel text="Price" />
        <PriceInput
          value={dish.price}
          onChangeText={(text) => updateDish(dish.key, { price: text })}
          onFocus={priceSection.trigger}
        />
      </View>

      <View {...nutritionSection.wrapperProps}>
        <FieldLabel text="Nutrition (optional estimate)" />
        <View className="flex-row flex-wrap gap-x-3">
          <View style={{ width: "47%" }}>
            <Text className="mb-1 text-xs text-slate-400">Calories</Text>
            <FormInput
              value={dish.calories}
              placeholder="kcal"
              keyboardType="decimal-pad"
              onFocus={nutritionSection.trigger}
              onChangeText={(text) => updateDish(dish.key, { calories: text })}
            />
          </View>
          <View style={{ width: "47%" }}>
            <Text className="mb-1 text-xs text-slate-400">Protein (g)</Text>
            <FormInput
              value={dish.protein}
              placeholder="g"
              keyboardType="decimal-pad"
              onFocus={nutritionSection.trigger}
              onChangeText={(text) => updateDish(dish.key, { protein: text })}
            />
          </View>
          <View style={{ width: "47%" }}>
            <Text className="mb-1 text-xs text-slate-400">Carbs (g)</Text>
            <FormInput
              value={dish.carbs}
              placeholder="g"
              keyboardType="decimal-pad"
              onFocus={nutritionSection.trigger}
              onChangeText={(text) => updateDish(dish.key, { carbs: text })}
            />
          </View>
          <View style={{ width: "47%" }}>
            <Text className="mb-1 text-xs text-slate-400">Fats (g)</Text>
            <FormInput
              value={dish.fats}
              placeholder="g"
              keyboardType="decimal-pad"
              onFocus={nutritionSection.trigger}
              onChangeText={(text) => updateDish(dish.key, { fats: text })}
            />
          </View>
          <View style={{ width: "47%" }}>
            <Text className="mb-1 text-xs text-slate-400">Fiber (g)</Text>
            <FormInput
              value={dish.fiber}
              placeholder="g"
              keyboardType="decimal-pad"
              onFocus={nutritionSection.trigger}
              onChangeText={(text) => updateDish(dish.key, { fiber: text })}
            />
          </View>
          <View style={{ width: "47%" }}>
            <Text className="mb-1 text-xs text-slate-400">Sodium (mg)</Text>
            <FormInput
              value={dish.sodium}
              placeholder="mg"
              keyboardType="decimal-pad"
              onFocus={nutritionSection.trigger}
              onChangeText={(text) => updateDish(dish.key, { sodium: text })}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AddRestaurantMealPage() {
  const router = useRouter();
  // Set only when reached from the planner's add-to-plan flow (as opposed
  // to the Eating Out catalog's "+" or the Recipes tab shortcut) - in that
  // case, saving hands the new restaurant back for the planner's own
  // dish-picker to pick up, so creating it and logging today's visit is
  // one continuous action instead of two separate trips.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromPlanner = from === "planner";

  const [restaurantName, setRestaurantName] = useState("");
  const [notes, setNotes] = useState("");
  // Starts empty, not one blank required-feeling row - dishes are optional
  // now, so an empty menu is a normal starting state, not something to
  // nudge past.
  const [dishes, setDishes] = useState<DishRow[]>([]);

  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Scrolls whichever field was just focused/opened into view — see
  // useScrollFocusSection. Tags is the only dropdown-capable field on this
  // page, so it's the only section that needs a (nominal) positive zIndex;
  // everything else defaults to 0.
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const restaurantNameSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const tagsSection = useScrollFocusSection(scrollRef, scrollAnchorRef, 20);
  const notesSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  useEffect(() => {
    let cancelled = false;
    getTags()
      .then((loaded) => {
        if (!cancelled) setAllTags(Array.isArray(loaded) ? loaded : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateTag(name: string): Promise<SelectOption> {
    const tag = await createTag(name);
    setAllTags((prev) => (prev.some((t) => t._id === tag._id) ? prev : [...prev, tag]));
    return tag;
  }

  function updateDish(key: string, patch: Partial<DishRow>) {
    setDishes((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDish(key: string) {
    setDishes((prev) => prev.filter((d) => d.key !== key));
  }

  // "append" mode adds one pre-filled dish row per estimated dish; "update"
  // mode (a single card's own scan button) fills just that one card in
  // place. Either way, nothing is saved until the normal Save button is
  // pressed - the dish-row editing UI is the review/correction step, same
  // as any manually typed dish.
  function handlePhotoCaptured(photoUri: string) {
    const target = scanTarget;
    setScanTarget(null);
    if (!target) return;

    setEstimating(true);
    estimateDishesFromPhoto(photoUri, restaurantName.trim() || undefined, target.mode === "update")
      .then((estimated) => {
        if (estimated.length === 0) {
          Alert.alert(
            "No dish recognized",
            "Couldn't identify any food in that photo — try again, or add the dish manually.",
          );
          return;
        }

        if (target.mode === "update") {
          updateDish(target.key, estimatedDishToRowFields(estimated[0]));
          if (estimated.length > 1) {
            Alert.alert(
              "Spotted more than one dish",
              "This card was only updated with the first one — use the \"Scan a photo\" button below the dish list to add several from one photo instead.",
            );
          }
        } else {
          setDishes((prev) => [
            ...prev,
            ...estimated.map((d) => ({ ...newDishRow(), ...estimatedDishToRowFields(d) })),
          ]);
        }
      })
      .catch((error) => {
        Alert.alert(
          "Couldn't estimate photo",
          error instanceof Error ? error.message : "Something went wrong reading that photo.",
        );
      })
      .finally(() => setEstimating(false));
  }

  async function handleSave() {
    const trimmedRestaurantName = restaurantName.trim();
    if (!trimmedRestaurantName) {
      Alert.alert("Restaurant name required", "Enter the restaurant's name.");
      return;
    }

    // Dishes are optional here - a restaurant's menu can just as well
    // start empty and be filled in over time (from here later, from the
    // restaurant's own page, or inline while logging a visit in the
    // planner) as be fully entered up front.
    const trimmedDishes = dishes
      .map((d) => ({ ...d, name: d.name.trim() }))
      .filter((d) => d.name.length > 0);

    setSaving(true);
    try {
      const resolvedTags = await Promise.all(
        selectedTags.map((tag) =>
          tag._id ? tag : resolveOrCreateOption(allTags, "", tag.name, handleCreateTag),
        ),
      );
      const tagIds = resolvedTags.filter((t): t is SelectOption => t != null).map((t) => t._id);

      const dishInputs: DishInput[] = trimmedDishes.map((d) => ({
        name: d.name,
        notes: d.notes.trim() || undefined,
        price: parseOptionalNumber(d.price),
        nutrition: {
          calories: parseOptionalNumber(d.calories),
          protein: parseOptionalNumber(d.protein),
          carbs: parseOptionalNumber(d.carbs),
          fats: parseOptionalNumber(d.fats),
          fiber: parseOptionalNumber(d.fiber),
          sodium: parseOptionalNumber(d.sodium),
        },
      }));

      const created = await createRestaurantMeal({
        restaurantName: trimmedRestaurantName,
        dishes: dishInputs,
        tags: tagIds,
        notes: notes.trim() || undefined,
      });

      if (fromPlanner) {
        // Hand the new restaurant back to the planner's own dish-picker
        // instead of just closing - whatever was just entered as the menu
        // is almost always also what was actually ordered today, so this
        // turns "create the restaurant" + "log the visit" into one trip.
        setPendingNewRestaurant(created);
      }
      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save restaurant meal.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  }

  if (loadingOptions) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Nav bar */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            disabled={saving}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>

          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Add Restaurant</Text>

          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => void handleSave()}
          >
            <Text className="font-semibold text-white">
              {saving ? "Saving..." : fromPlanner ? "Save & Continue" : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          <SectionTitle
            first
            title="Restaurant"
            description="Add it once, then log visits to it anytime from the planner — no pantry items are used for this."
          />

          <View {...restaurantNameSection.wrapperProps}>
            <FieldLabel text="Restaurant name" required />
            <FormInput
              value={restaurantName}
              placeholder="e.g. Chipotle"
              onFocus={restaurantNameSection.trigger}
              onChangeText={setRestaurantName}
            />
          </View>

          <View {...tagsSection.wrapperProps}>
            <FieldLabel text="Tags" />
            <CreatableMultiTagDropdown
              options={allTags}
              selectedItems={selectedTags}
              placeholder="Add a tag…"
              onOpen={tagsSection.trigger}
              onAdd={(option) => setSelectedTags((prev) => [...prev, option])}
              onRemove={(id) => setSelectedTags((prev) => prev.filter((t) => t._id !== id))}
            />
          </View>

          <View {...notesSection.wrapperProps}>
            <FieldLabel text="Notes" />
            <FormInput
              value={notes}
              placeholder="e.g. The one near work, ask for extra sauce…"
              multiline
              onFocus={notesSection.trigger}
              onChangeText={setNotes}
            />
          </View>

          {/* ── Dishes ── */}
          <SectionTitle
            title="Menu (optional)"
            description="Add dishes you know about now, or skip this and add them later — from here, the restaurant's own page, or right when logging a visit. Nutrition is optional and can be a rough estimate."
          />

          {dishes.map((dish, index) => (
            <DishCard
              key={dish.key}
              dish={dish}
              index={index}
              scrollRef={scrollRef}
              scrollAnchorRef={scrollAnchorRef}
              updateDish={updateDish}
              removeDish={removeDish}
              onScanDish={(key) => setScanTarget({ mode: "update", key })}
            />
          ))}

          <View className="mb-4 flex-row gap-3">
            <Pressable
              className="flex-1 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-4 active:bg-slate-100"
              onPress={() => setDishes((prev) => [...prev, newDishRow()])}
            >
              <Ionicons name="add" size={20} color="#2563EB" />
              <Text className="ml-2 font-semibold text-blue-700">Add dish</Text>
            </Pressable>
            <Pressable
              className="flex-1 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-4 active:bg-slate-100"
              onPress={() => setScanTarget({ mode: "append" })}
            >
              <Ionicons name="camera-outline" size={20} color="#2563EB" />
              <Text className="ml-2 font-semibold text-blue-700">Scan a photo</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <PhotoCaptureModal
        visible={!!scanTarget}
        onClose={() => setScanTarget(null)}
        onCaptured={handlePhotoCaptured}
        subject="meal photo"
        instructions={
          scanTarget?.mode === "update"
            ? "Fit just this one dish in frame."
            : "Fit the dish(es) in frame — a photo of a table with several plates is fine, each one gets estimated separately."
        }
      />

      <Modal visible={estimating} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50">
          <View className="items-center rounded-3xl bg-white px-8 py-6">
            <ActivityIndicator size="large" />
            <Text className="mt-3 text-base font-semibold text-slate-700">
              Estimating nutrition...
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
