import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
  NutritionFieldsEditor,
  PriceInput,
  SectionTitle,
} from "@/src/components/forms";
import {
  nutritionFormToInput,
  nutritionToForm,
  type NutritionFormValues,
} from "@/src/utils/nutritionForm";

import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { createTag, getTags, type SelectOption } from "@/src/services/optionsApi";
import {
  getRestaurantMealById,
  updateRestaurantMeal,
  type Dish,
  type DishInput,
} from "@/src/services/restaurantMealApi";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";

type DishRow = {
  key: string;
  name: string;
  notes: string;
  price: string;
  // Every nutrient, core and extended — saving replaces each dish's whole
  // nutrition object, so the form must load and send back all of them.
  nutrition: NutritionFormValues;
};

function newDishRow(): DishRow {
  return {
    key: `dish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    notes: "",
    price: "",
    nutrition: nutritionToForm(),
  };
}

function numToText(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

// Manual nutrition entry is entirely optional per dish — an empty field
// means "unknown", not zero, so it's omitted rather than sent as 0.
function parseOptionalNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
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
}: {
  dish: DishRow;
  index: number;
  scrollRef: RefObject<ScrollView | null>;
  scrollAnchorRef: RefObject<View | null>;
  updateDish: (key: string, patch: Partial<DishRow>) => void;
  removeDish: (key: string) => void;
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
        <Pressable hitSlop={8} onPress={() => removeDish(dish.key)}>
          <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
        </Pressable>
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
        <NutritionFieldsEditor
          compact
          values={dish.nutrition}
          onChange={(field, value) =>
            updateDish(dish.key, { nutrition: { ...dish.nutrition, [field]: value } })
          }
          onFocus={nutritionSection.trigger}
        />
      </View>
    </View>
  );
}

export default function EditRestaurantMealPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [restaurantName, setRestaurantName] = useState("");
  const [notes, setNotes] = useState("");
  // Starts empty, not one blank required-feeling row - dishes are
  // optional, same reasoning as the add screen.
  const [dishes, setDishes] = useState<DishRow[]>([]);
  // The raw dishes as loaded, keyed by _id - preserved through save so an
  // edited dish keeps its real identity (and its scores, which this form
  // doesn't even expose) instead of every save minting a fresh id for the
  // whole menu and orphaning every past visit's restaurantDishSelections
  // that reference the old ones.
  const [originalDishesById, setOriginalDishesById] = useState<Map<string, Dish>>(new Map());

  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const [restaurantMeal, loadedTags] = await Promise.all([
          getRestaurantMealById(id),
          getTags(),
        ]);
        if (cancelled) return;

        setAllTags(Array.isArray(loadedTags) ? loadedTags : []);
        setRestaurantName(restaurantMeal.restaurantName);
        setNotes(restaurantMeal.notes ?? "");
        setSelectedTags(
          (restaurantMeal.tags ?? []).filter(
            (t): t is SelectOption => typeof t !== "string",
          ),
        );
        setOriginalDishesById(new Map(restaurantMeal.dishes.map((d) => [d._id, d])));
        setDishes(
          restaurantMeal.dishes.map((d) => ({
            key: d._id,
            name: d.name,
            notes: d.notes ?? "",
            price: numToText(d.price),
            nutrition: nutritionToForm(d.nutrition),
          })),
        );
      } catch (error) {
        if (!cancelled) {
          Alert.alert(
            "Couldn't load",
            error instanceof Error ? error.message : "Something went wrong.",
          );
          router.back();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

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

  async function handleSave() {
    if (!id) return;
    const trimmedRestaurantName = restaurantName.trim();
    if (!trimmedRestaurantName) {
      Alert.alert("Restaurant name required", "Enter the restaurant's name.");
      return;
    }

    // Dishes are optional - a menu can be edited down to nothing (or never
    // had any to begin with, if created empty from the add screen).
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

      // updateRestaurantMeal replaces the WHOLE dishes array - a row that
      // already existed (its key is the real dish _id, from
      // originalDishesById) is sent as that original dish with just the
      // edited fields overridden, preserving _id and anything this form
      // doesn't expose (like scores). A row added during this edit session
      // has no real id yet and is sent as a bare DishInput. Getting this
      // wrong would silently mint a fresh id for every dish on every save,
      // orphaning every past visit's restaurantDishSelections that
      // reference the old ones.
      const dishInputs: (DishInput | Dish)[] = trimmedDishes.map((d) => {
        const nutrition = nutritionFormToInput(d.nutrition);
        const original = originalDishesById.get(d.key);
        return original
          ? { ...original, name: d.name, notes: d.notes.trim() || undefined, price: parseOptionalNumber(d.price), nutrition }
          : { name: d.name, notes: d.notes.trim() || undefined, price: parseOptionalNumber(d.price), nutrition };
      });

      await updateRestaurantMeal(id, {
        restaurantName: trimmedRestaurantName,
        dishes: dishInputs,
        tags: tagIds,
        notes: notes.trim() || undefined,
      });

      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save restaurant meal.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
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

          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Edit Restaurant</Text>

          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => void handleSave()}
          >
            <Text className="font-semibold text-white">{saving ? "Saving..." : "Save"}</Text>
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
          <SectionTitle first title="Restaurant" description="" />

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
              onRemove={(id2) => setSelectedTags((prev) => prev.filter((t) => t._id !== id2))}
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
            description="Dishes on this restaurant's menu. Nutrition is optional and can be a rough estimate."
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
            />
          ))}

          <Pressable
            className="mb-4 flex-row items-center justify-center rounded-2xl border border-dashed border-slate-300 py-4 active:bg-slate-100"
            onPress={() => setDishes((prev) => [...prev, newDishRow()])}
          >
            <Ionicons name="add" size={20} color="#2563EB" />
            <Text className="ml-2 font-semibold text-blue-700">Add dish</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
