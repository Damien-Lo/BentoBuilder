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
  FormCard,
  FormInput,
  NutritionFieldsEditor,
  PriceInput,
} from "@/src/components/forms";
import {
  nutritionFormToInput,
  nutritionToForm,
  type NutritionFormValues,
} from "@/src/utils/nutritionForm";

import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { useWideForm } from "@/src/components/forms/wideForm";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
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
  // (In the page's colours: always an Orbit page.)
  const { colors: o } = useOrbitTheme();

  return (
    <View className="mb-3 rounded-2xl bg-slate-50 p-3" style={{ backgroundColor: o.canvas, borderWidth: 1, borderColor: o.border, borderRadius: 16 }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-slate-700" style={{ color: o.text }}>Dish {index + 1}</Text>
        <Pressable hitSlop={8} onPress={() => removeDish(dish.key)}>
          <Ionicons name="close-circle-outline" size={20} color={o.faint} />
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
          multiline
        />
      </View>

      <View style={{ width: 160 }}>
        <View {...priceSection.wrapperProps}>
          <FieldLabel text="Price" />
          <PriceInput
          value={dish.price}
          onChangeText={(text) => updateDish(dish.key, { price: text })}
          onFocus={priceSection.trigger}
        />
        </View>
      </View>

      <View {...nutritionSection.wrapperProps}>
        <FieldLabel text="Nutrition (optional estimate)" />
        <NutritionFieldsEditor
          grid
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

// Editing a restaurant (Kitchen → Eating Out): in Orbit's look, in the
// Kitchen's colours — in a desktop browser too, in two columns.
export default function EditRestaurantMealPage() {
  return (
    <OrbitSection section="kitchen">
      <EditRestaurantMeal />
    </OrbitSection>
  );
}

function EditRestaurantMeal() {
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
  const layout = useWideForm();
  const { colors: o } = useOrbitTheme();

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
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={{ backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o.muted} />
      </SafeAreaView>
    );
  }

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={{ backgroundColor: o.canvas }}>
      <KeyboardAvoidingView className="flex-1" style={layout.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Nav bar: the way back and Save, round, over a large title on the
            page itself */}
        <View style={{ paddingHorizontal: 16, paddingTop: layout.wide ? 16 : 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4, minHeight: 40 }}>
            <Tap disabled={saving} onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
              <Ionicons name="chevron-back" size={22} color={o.text} />
            </Tap>
            <View style={{ flex: 1 }} />
            <Tap disabled={saving} onPress={() => void handleSave()} style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: 20, backgroundColor: o.ink, opacity: saving ? 0.5 : 1 }} pressedStyle={{ opacity: 0.8 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: o.onInk }}>{saving ? "Saving..." : "Save"}</Text>
            </Tap>
          </View>
          <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>Edit Restaurant</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          {/* (In a desktop browser: two columns.) */}
          <View style={layout.columns}>
          <View style={[layout.column, { zIndex: 2 }]}>
          <FormCard icon="storefront-outline" title="Restaurant" description="The place — log visits to it anytime from the planner." zIndex={60}>

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

          </FormCard>
          </View>
          <View style={[layout.column, { zIndex: 1 }]}>

          {/* ── Dishes ── */}
          <FormCard icon="fast-food-outline" title="Menu (optional)" description="Dishes on this restaurant's menu. Nutrition is optional and can be a rough estimate." zIndex={50}>
          <View className="h-3" />

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

          <Tap
            className="flex-row items-center justify-center rounded-2xl border border-dashed border-blue-300 bg-blue-50 py-3.5 active:bg-blue-100"
            style={{ backgroundColor: o.pill, borderColor: o.faint, borderRadius: 16 }}
            pressedStyle={{ opacity: 0.75 }}
            onPress={() => setDishes((prev) => [...prev, newDishRow()])}
          >
            <Ionicons name="add" size={20} color={o.ink} />
            <Text className="ml-2 font-semibold text-blue-700" style={{ color: o.onPill }}>Add dish</Text>
          </Tap>
        </FormCard>
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
            <Text className="text-base font-semibold text-white" style={{ color: o.onInk }}>{saving ? "Saving..." : "Save changes"}</Text>
          </Tap>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </OrbitPage>
  );
}
