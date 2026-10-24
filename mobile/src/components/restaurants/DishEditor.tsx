import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, View } from "react-native";

import { FieldLabel, FormInput, NutritionFieldsEditor } from "@/src/components/forms";
import { useDebouncedSearch } from "@/src/components/forms/useDebouncedSearch";
import { PhotoCaptureModal } from "@/src/components/PhotoCaptureModal";
import { Tap } from "@/src/components/ui/Tap";
import {
  addDish,
  estimateDishesFromPhoto,
  getLibraryDish,
  libraryDishNutrition,
  searchLibraryDishes,
  updateDish,
  isSuggested,
  type ChangeRequest,
  type DishInput,
  type LibraryDish,
  type Restaurant,
  type RestaurantDish,
} from "@/src/services/restaurantApi";
import type { NutritionField } from "@/src/types/nutrition";
import { OrbitPage, OrbitSection, SECTION_PALETTE, useOrbitTheme } from "@/src/theme/orbit";
import { hasAnyNutrition, nutritionFormToInput, nutritionToForm, type NutritionFormValues } from "@/src/utils/nutritionForm";
import { useWideWeb } from "@/src/utils/useWideWeb";

import { errorText, Macros, Sheet, SheetButton, showSuggested, StatusChip, useIsReviewer } from "./parts";

// Adding a dish to a restaurant's menu, or correcting one (wiki: anyone can,
// and the change is kept in its history). Its nutrition comes one of three
// ways:
// - from the dish library (USDA's restaurant-style dishes), found by typing
//   its name, at a size — the typical restaurant serving to begin with,
//   re-sized with an amount and one of the dish's own measures (or grams);
// - from an AI estimate of a photo of it (on the phone);
// - or typed in.
// Changing the numbers by hand after a library pick makes them typed.
//
// Used by the restaurant page, and meant for the planner's Eating Out flow
// too, so it only needs:
//   <DishEditor restaurant={r} dish={existing?} onSaved={(dish) => …} onCancel={() => …} />
// Mount it while it's wanted (or pass `visible`); `onSaved` gets the dish as
// the server has it, with your own side (`mine`) kept from the one edited.
// Dishes are reviewed: a member's new dish comes back "pending" (theirs to
// use at once, and to fix while it waits), and a member's correction to one
// that's in is only suggested — `onSuggested` gets the suggestion, after the
// person's been told (the dish itself is unchanged; without it, the form
// just closes).
export interface DishEditorProps {
  // The restaurant whose menu it's on (a chain location's goes on its chain's).
  restaurant: Pick<Restaurant, "_id" | "name">;
  // The dish being corrected; none to add a new one.
  dish?: RestaurantDish | null;
  // A new dish's name to start with (e.g. what was typed in a search).
  initialName?: string;
  // Sections already on the menu, offered as chips ("Mains", "Sides").
  sections?: string[];
  visible?: boolean;
  onSaved: (dish: RestaurantDish) => void;
  // Whether one reviews (a restaurant page's `canReview`; else one's account says).
  canReview?: boolean;
  // A correction sent as a suggestion rather than made.
  onSuggested?: (request: ChangeRequest) => void;
  onCancel: () => void;
}

type Source = RestaurantDish["source"];
type Way = "library" | "photo" | "typed";

const PHOTO_WORKS = Platform.OS !== "web";

// "1.5", not "1.5000001"; "" for nothing.
const amountText = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "");

// A library dish's measures to choose from: its own, then grams.
const unitsOf = (dish: LibraryDish) => [...new Set([...(dish.units ?? []).map((u) => u.unit), "g"])];

// Its typical restaurant serving, as an amount of one of its measures.
function servingOf(dish: LibraryDish): { amount: number; unit: string } {
  const serving = dish.serving;
  if (serving && serving.unit !== "g" && dish.units?.some((u) => u.unit === serving.unit)) return { amount: serving.amount, unit: serving.unit };
  return { amount: Math.round(serving?.grams ?? 100), unit: "g" };
}

export function DishEditor(props: DishEditorProps) {
  // (In the Kitchen's colours wherever it's opened, its fields in Orbit's look.)
  return (
    <OrbitSection section="kitchen">
      <OrbitPage>
        <DishEditorSheet {...props} />
      </OrbitPage>
    </OrbitSection>
  );
}

function DishEditorSheet({ restaurant, dish, initialName, sections = [], visible = true, canReview, onSaved, onSuggested, onCancel }: DishEditorProps) {
  const { colors: o } = useOrbitTheme();
  const wide = useWideWeb();
  const reviewer = useIsReviewer() || !!canReview;
  const editing = !!dish;
  // (A reviewer's change, or one's own still-waiting dish's, is made; anyone
  // else's is a suggestion.)
  const willSuggest = editing && !reviewer && dish?.status !== "pending";

  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState<Source>("typed");
  const [way, setWay] = useState<Way>("library");
  const [numbers, setNumbers] = useState<NutritionFormValues>(() => nutritionToForm());
  // The library dish picked, and its size.
  const [library, setLibrary] = useState<LibraryDish | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("g");
  // Searching the library by the name, while typing it.
  const [searchOn, setSearchOn] = useState(false);
  // A photo's estimate: its caveat.
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [estimating, setEstimating] = useState(false);
  // On the phone the numbers are a line of text until asked for.
  const [showNumbers, setShowNumbers] = useState(false);
  const [saving, setSaving] = useState(false);

  // Start afresh each time it's opened: the dish's own, or a blank one.
  // (By the dish's id: a fresh copy of the same dish doesn't start it over.)
  const dishRef = useRef(dish);
  dishRef.current = dish;
  const initialNameRef = useRef(initialName);
  initialNameRef.current = initialName;
  const dishId = dish?._id ?? null;
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const dish = dishRef.current;
    const initialName = initialNameRef.current;
    setName(dish?.name ?? initialName ?? "");
    setSection(dish?.section ?? "");
    setNote("");
    setSource(dish?.source ?? "typed");
    setWay(dish ? (dish.source === "library" ? "library" : dish.source === "photo" ? "photo" : "typed") : "library");
    setNumbers(nutritionToForm(dish?.nutrition));
    setLibrary(null);
    setAmount("");
    setUnit("g");
    setSearchOn(false);
    setPhotoNote(null);
    setShowNumbers(false);
    setLoadingLibrary(false);
    // (A library dish: fetched, so it can be re-sized.)
    const from = dish?.fromLibrary;
    if (from?.dish) {
      setLoadingLibrary(true);
      getLibraryDish(from.dish)
        .then((found) => {
          if (cancelled) return;
          setLibrary(found);
          setAmount(amountText(from.amount));
          setUnit(from.unit);
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoadingLibrary(false));
    }
    return () => {
      cancelled = true;
    };
  }, [visible, dishId]);

  const { found, searching } = useDebouncedSearch(searchLibraryDishes, name, visible && searchOn);
  const suggestions = found.slice(0, 8);

  const amountNumber = Number(amount.replace(",", "."));
  const sized = library ? libraryDishNutrition(library, amountNumber, unit) : null;
  const typedByHand = !!library && source !== "library";

  // The library's numbers at this size, put in the fields.
  function resize(dishToSize: LibraryDish, nextAmount: string, nextUnit: string) {
    setAmount(nextAmount);
    setUnit(nextUnit);
    const result = libraryDishNutrition(dishToSize, Number(nextAmount.replace(",", ".")), nextUnit);
    if (result) {
      setNumbers(nutritionToForm(result.nutrition));
      setSource("library");
    }
  }

  function pick(picked: LibraryDish) {
    setSearchOn(false);
    setLibrary(picked);
    setWay("library");
    setPhotoNote(null);
    if (!name.trim()) setName(picked.name);
    const serving = servingOf(picked);
    resize(picked, amountText(serving.amount), serving.unit);
  }

  // A new measure: the same amount of food, in it (so 1 cup → 200 g).
  function changeUnit(next: string) {
    if (!library || next === unit) return;
    const grams = sized?.grams;
    const perUnit = next === "g" ? 1 : (library.units.find((u) => u.unit === next)?.grams ?? 0);
    const nextAmount = grams && perUnit ? (next === "g" ? Math.round(grams) : Math.round((grams / perUnit) * 4) / 4 || 0.25) : next === "g" ? 100 : 1;
    resize(library, amountText(nextAmount), next);
  }

  function step(direction: 1 | -1) {
    if (!library) return;
    const by = unit === "g" ? 10 : 0.5;
    const current = Number.isFinite(amountNumber) ? amountNumber : 0;
    const next = Math.max(by, Math.round((current + direction * by) / by) * by);
    resize(library, amountText(next), unit);
  }

  function editNumber(field: NutritionField, value: string) {
    setNumbers((prev) => ({ ...prev, [field]: value }));
    // (A photo's estimate, corrected, is still the photo's.)
    if (source === "library") setSource("typed");
  }

  function chooseWay(next: Way) {
    setWay(next);
    if (next === "photo" && !photoNote) setShooting(true);
    if (next === "typed") setShowNumbers(true);
  }

  function handlePhoto(uri: string) {
    setShooting(false);
    setEstimating(true);
    estimateDishesFromPhoto(uri, restaurant.name, true)
      .then((estimated) => {
        const first = estimated[0];
        if (!first) {
          Alert.alert("No dish recognized", "Couldn't make out a dish in that photo — try again, or type the numbers in.");
          return;
        }
        setNumbers(nutritionToForm(first.estimatedNutrition));
        setSource("photo");
        setLibrary(null);
        if (!name.trim()) setName(first.name);
        setPhotoNote(first.confidence !== "high" ? `${first.portionNote} (${first.confidence} confidence)` : first.portionNote);
      })
      .catch((error) => Alert.alert("Couldn't estimate the photo", errorText(error)))
      .finally(() => setEstimating(false));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name the dish", "Type the dish's name as it's on the menu.");
      return;
    }
    // (Its library dish at this size — or, if it hasn't loaded yet, as it was.)
    const fromLibrary = source !== "library" ? null : library ? (sized ? { dish: library._id, amount: amountNumber, unit } : null) : (dish?.fromLibrary ?? null);
    const input: DishInput = {
      name: trimmed,
      section: section.trim(),
      nutrition: nutritionFormToInput(numbers),
      // (Library numbers no longer at a size it can work out: typed.)
      source: source === "library" && !fromLibrary ? "typed" : source,
      fromLibrary,
    };
    setSaving(true);
    try {
      const saved = dish ? await updateDish(dish._id, { ...input, note: note.trim() || undefined }) : await addDish(restaurant._id, input);
      if (isSuggested(saved)) {
        showSuggested(() => (onSuggested ? onSuggested(saved.request) : onCancel()));
        return;
      }
      onSaved({ ...saved, mine: saved.mine ?? dish?.mine ?? { saved: false, notes: "", price: null, scores: [] } });
    } catch (error) {
      Alert.alert("Couldn't save the dish", errorText(error));
    } finally {
      setSaving(false);
    }
  }

  const ways: { value: Way; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: "library", label: "Dish library", icon: "library-outline" },
    ...(PHOTO_WORKS ? [{ value: "photo" as const, label: "Photo", icon: "camera-outline" as const }] : []),
    { value: "typed", label: "Type it in", icon: "create-outline" as const },
  ];
  const existingSections = useMemo(() => [...new Set(sections.map((s) => s.trim()).filter(Boolean))].sort(), [sections]);

  // The choice to make, in the Kitchen's colour on a desktop (what's
  // decided stands out from the fixed numbers beside it).
  const choiceBox = wide ? { backgroundColor: SECTION_PALETTE.kitchen.tint, borderColor: o.fill } : { backgroundColor: o.surface, borderColor: o.border };

  const nameField = (
    <View>
      <FieldLabel text="Dish name" required />
      <FormInput
        value={name}
        placeholder="As it's on the menu, e.g. Chicken burrito bowl"
        onChangeText={(text) => {
          setName(text);
          setSearchOn(true);
        }}
        autoCorrect={false}
      />
      {searchOn && name.trim().length >= 2 && (
        <View style={{ marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
            <Ionicons name="library-outline" size={13} color={o.faint} />
            <Text style={{ flex: 1, marginLeft: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: o.faint }}>DISH LIBRARY · FOR ITS NUTRITION</Text>
            {searching && <ActivityIndicator size="small" color={o.faint} />}
            <Tap onPress={() => setSearchOn(false)} hitSlop={8} accessibilityLabel="Hide the library" style={{ marginLeft: 8 }}>
              <Ionicons name="close" size={16} color={o.faint} />
            </Tap>
          </View>
          {!searching && suggestions.length === 0 && <Text style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4, fontSize: 13, color: o.muted }}>Nothing like it in the library — try fewer words, or type the numbers in.</Text>}
          {suggestions.map((s, i) => {
            const serving = servingOf(s);
            const at = libraryDishNutrition(s, serving.amount, serving.unit);
            return (
              <Tap
                key={s._id}
                onPress={() => pick(s)}
                accessibilityRole="button"
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: o.border }}
                pressedStyle={{ backgroundColor: o.pill }}
              >
                <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "600", color: o.text }}>
                  {s.name}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: o.muted }}>
                  {[s.category, `${amountText(serving.amount)} ${serving.unit}`, at?.nutrition.calories != null ? `${Math.round(at.nutrition.calories)} kcal` : ""].filter(Boolean).join(" · ")}
                </Text>
              </Tap>
            );
          })}
        </View>
      )}
    </View>
  );

  const sectionField = (
    <View>
      <FieldLabel text="Section (optional)" />
      <FormInput value={section} placeholder="e.g. Mains, Sides, Drinks" onChangeText={setSection} />
      {existingSections.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
          {existingSections.map((s) => (
            <Chip key={s} label={s} on={s.toLowerCase() === section.trim().toLowerCase()} onPress={() => setSection(s)} />
          ))}
        </ScrollView>
      )}
    </View>
  );

  // Where its numbers come from: one row of three.
  const wayPicker = (
    <View>
      <FieldLabel text="Its nutrition, from" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {ways.map((w) => {
          const on = way === w.value;
          return (
            <Tap
              key={w.value}
              onPress={() => chooseWay(w.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: on ? o.ink : o.border, backgroundColor: on ? o.ink : o.surface }}
              pressedStyle={{ opacity: 0.8 }}
            >
              <Ionicons name={w.icon} size={16} color={on ? o.onInk : o.icon} />
              <Text numberOfLines={1} style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: on ? o.onInk : o.text }}>
                {w.label}
              </Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );

  // The library dish, and the size it's had at.
  const libraryPanel = (
    <View style={{ marginTop: 12 }}>
      {loadingLibrary ? (
        <ActivityIndicator color={o.muted} style={{ marginVertical: 16 }} />
      ) : !library ? (
        <Text style={{ fontSize: 13, lineHeight: 19, color: o.muted }}>Type the dish&apos;s name above and pick the closest dish in the library — its numbers are filled in at a typical restaurant serving, which you can change.</Text>
      ) : (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: o.text }}>{library.name}</Text>
              <Text style={{ marginTop: 1, fontSize: 12, color: o.muted }}>{["Dish library", library.category].filter(Boolean).join(" · ")}</Text>
            </View>
            <Tap
              onPress={() => {
                setLibrary(null);
                if (source === "library") setSource("typed");
                setSearchOn(true);
              }}
              hitSlop={8}
              accessibilityLabel="Use another library dish"
              style={{ marginLeft: 8 }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: o.accent }}>Change</Text>
            </Tap>
          </View>

          {/* The size: an amount, and one of its measures. */}
          <Text style={{ marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: "700", color: wide ? o.ink : o.icon }}>{wide ? "Size · choose" : "Size"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Stepper icon="remove" label="Less" onPress={() => step(-1)} />
            <TextInput
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                const result = libraryDishNutrition(library, Number(text.replace(",", ".")), unit);
                if (result) {
                  setNumbers(nutritionToForm(result.nutrition));
                  setSource("library");
                }
              }}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={[{ width: 76, height: 40, borderRadius: 12, borderWidth: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: o.text }, choiceBox, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
            />
            <Stepper icon="add" label="More" onPress={() => step(1)} />
            {sized && <Text style={{ marginLeft: 4, fontSize: 13, color: o.muted }}>{Math.round(sized.grams)} g</Text>}
          </View>
          <ScrollView horizontal={!wide} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[{ gap: 8, paddingTop: 10 }, wide && { flexDirection: "row", flexWrap: "wrap" }]}>
            {unitsOf(library).map((u) => (
              <Chip key={u} label={u} on={u === unit} onPress={() => changeUnit(u)} highlight={wide} />
            ))}
          </ScrollView>
          {library.serving && (
            <Text style={{ marginTop: 8, fontSize: 12, color: o.faint }}>
              A typical restaurant serving: {amountText(servingOf(library).amount)} {servingOf(library).unit}
            </Text>
          )}
          {typedByHand ? (
            <Text style={{ marginTop: 8, fontSize: 12, lineHeight: 17, color: o.warning }}>The numbers were changed by hand, so they&apos;re kept as typed. Change the size to use the library&apos;s again.</Text>
          ) : sized ? (
            <Macros nutrition={sized.nutrition} size={13} style={{ marginTop: 10 }} />
          ) : (
            <Text style={{ marginTop: 8, fontSize: 12, color: o.danger }}>Give it an amount above 0.</Text>
          )}
          {!!name.trim() && name.trim().toLowerCase() !== library.name.toLowerCase() && (
            <Tap onPress={() => setName(library.name)} hitSlop={6} style={{ marginTop: 10, alignSelf: "flex-start" }}>
              <Text style={{ fontSize: 12, color: o.accent }}>Call it “{library.name}” instead</Text>
            </Tap>
          )}
        </View>
      )}
    </View>
  );

  const photoPanel = (
    <View style={{ marginTop: 12 }}>
      {estimating ? (
        <View style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface }}>
          <ActivityIndicator color={o.muted} />
          <Text style={{ marginLeft: 10, fontSize: 14, color: o.text }}>Estimating its nutrition…</Text>
        </View>
      ) : (
        <>
          {!!photoNote && (
            <View style={{ padding: 14, borderRadius: 16, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface, marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: o.icon }}>From the photo — an estimate</Text>
              <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: o.muted }}>{photoNote}</Text>
              {source === "photo" && <Macros nutrition={nutritionFormToInput(numbers)} size={13} style={{ marginTop: 8 }} />}
            </View>
          )}
          <SheetButton kind="secondary" icon="camera-outline" label={photoNote ? "Take another photo" : "Take a photo of it"} onPress={() => setShooting(true)} />
        </>
      )}
    </View>
  );

  const numbersEditor = <NutritionFieldsEditor grid values={numbers} onChange={editNumber} />;

  // On the phone: the numbers as a line, until asked for.
  const phoneNumbers = (
    <View style={{ marginTop: 16 }}>
      <Tap onPress={() => setShowNumbers((v) => !v)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }} pressedStyle={{ opacity: 0.6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: o.icon }}>{way === "typed" ? "The numbers" : "Edit the numbers"}</Text>
          {!showNumbers && <Macros nutrition={nutritionFormToInput(numbers)} size={12} style={{ marginTop: 2 }} />}
        </View>
        <Ionicons name={showNumbers ? "chevron-up" : "chevron-down"} size={18} color={o.muted} />
      </Tap>
      {showNumbers && numbersEditor}
    </View>
  );

  const noteField = editing ? (
    <View>
      <FieldLabel text="What changed (optional)" />
      <FormInput value={note} placeholder="e.g. New portion size on their menu" onChangeText={setNote} maxLength={200} />
      <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: willSuggest ? o.warning : o.faint }}>
        {willSuggest
          ? "Dishes are shared by everyone in Orbit, so your change is sent as a suggestion: a reviewer looks at it before it changes for everyone."
          : dish?.status === "pending"
            ? "It's still waiting for review, so your change is made straight away."
            : "Dishes are shared by everyone in Orbit; your change is made now and kept in its history."}
      </Text>
    </View>
  ) : null;

  const left = (
    <>
      {!!dish && <StatusChip status={dish.status} reviewNote={dish.reviewNote} withNote style={{ marginTop: 4 }} />}
      {!editing && !reviewer && (
        <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 17, color: o.faint }}>A reviewer checks new dishes before everyone sees them — you can log it straight away.</Text>
      )}
      {nameField}
      {sectionField}
      {wayPicker}
      {way === "library" && libraryPanel}
      {way === "photo" && photoPanel}
    </>
  );

  return (
    <Sheet
      visible={visible}
      title={editing ? "Edit dish" : "Add a dish"}
      subtitle={restaurant.name}
      onClose={onCancel}
      width={wide ? 960 : 640}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SheetButton kind="secondary" label="Cancel" onPress={onCancel} disabled={saving} />
          <SheetButton label={saving ? "Saving…" : willSuggest ? "Suggest the change" : editing ? "Save changes" : "Add to the menu"} onPress={() => void save()} disabled={saving || estimating} />
        </View>
      }
    >
      {wide ? (
        // (A desktop: the choices on the left, every number on the right.)
        <View style={{ flexDirection: "row", gap: 20, alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {left}
            {noteField}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel text={source === "library" ? "Nutrition · from the library, at this size" : source === "photo" ? "Nutrition · estimated from the photo" : "Nutrition · one serving as it's served"} />
            {numbersEditor}
            {!hasAnyNutrition(numbers) && <Text style={{ marginTop: 4, fontSize: 12, color: o.faint }}>Blank is unknown, not zero.</Text>}
          </View>
        </View>
      ) : (
        <>
          {left}
          {phoneNumbers}
          {noteField}
        </>
      )}

      {PHOTO_WORKS && <PhotoCaptureModal visible={shooting} onClose={() => setShooting(false)} onCaptured={handlePhoto} subject="dish photo" instructions="Fit just this one dish in frame." />}
    </Sheet>
  );
}

function Chip({ label, on, onPress, highlight }: { label: string; on: boolean; onPress: () => void; highlight?: boolean }) {
  const { colors: o } = useOrbitTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        paddingHorizontal: 12,
        height: 32,
        justifyContent: "center",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? o.ink : highlight ? o.fill : o.border,
        backgroundColor: on ? o.ink : highlight ? SECTION_PALETTE.kitchen.tint : o.surface,
      }}
      pressedStyle={{ opacity: 0.75 }}
    >
      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: on ? o.onInk : highlight ? o.ink : o.text }}>
        {label}
      </Text>
    </Tap>
  );
}

function Stepper({ icon, label, onPress }: { icon: "add" | "remove"; label: string; onPress: () => void }) {
  const { colors: o } = useOrbitTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.pill }} pressedStyle={{ opacity: 0.7 }}>
      <Ionicons name={icon} size={20} color={o.text} />
    </Tap>
  );
}
