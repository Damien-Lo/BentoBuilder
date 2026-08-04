import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { CreatableMultiTagDropdown } from "./CreatableMultiTagDropdown";
import { CreatableStringDropdown } from "./CreatableStringDropdown";
import { DurationValueInput } from "./DurationValueInput";
import { FieldLabel } from "./FieldLabel";
import { FormInput } from "./FormInput";
import { SearchableObjectDropdown } from "./SearchableObjectDropdown";
import { ToggleRow } from "./ToggleRow";

import { createIngredient, type Ingredient } from "@/src/services/ingredientApi";
import {
  createCategory,
  createStorageLocation,
  createTag,
  getCategories,
  getStorageLocations,
  getTags,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";
import type { DurationUnit } from "@/src/utils/date";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";

interface CreateGenericIngredientModalProps {
  visible: boolean;
  initialName: string;
  // Overridable so callers with a more specific context (e.g. a recipe's
  // "Prepares" section, where "generic ingredient" / "brands" language
  // doesn't fit) can swap in copy that actually matches what's being made.
  title?: string;
  description?: string;
  onClose: () => void;
  onCreated: (ingredient: Ingredient) => void;
}

// Ingredient search bars across the app only let you pick from what already
// exists — typing a name with no match doesn't silently do anything. This
// modal is the "no match" prompt: create a bare generic ingredient (a
// category is the only other required field) and hand it straight back so
// the caller can select it immediately, same as picking an existing one.
export function CreateGenericIngredientModal({
  visible,
  initialName,
  title = "Create generic ingredient",
  description = "No existing ingredient matched — this creates a generic one you can add specific brands to later.",
  onClose,
  onCreated,
}: CreateGenericIngredientModalProps) {
  const [name, setName] = useState(initialName);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [units, setUnits] = useState<string[]>([]);
  const [unit, setUnit] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");

  const [allTags, setAllTags] = useState<SelectOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectOption[]>([]);

  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [wantsDefaultLocation, setWantsDefaultLocation] = useState(false);
  const [defaultLocationId, setDefaultLocationId] = useState("");
  const [defaultLocationName, setDefaultLocationName] = useState("");
  const [defaultLocationDraft, setDefaultLocationDraft] = useState("");

  const [wantsDefaultExpiry, setWantsDefaultExpiry] = useState(false);
  const [defaultExpiryAmount, setDefaultExpiryAmount] = useState("1");
  const [defaultExpiryUnit, setDefaultExpiryUnit] = useState<DurationUnit>("week");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setCategoryId("");
    setCategoryName("");
    setCategoryDraft("");
    setUnit("");
    setLowStockThreshold("");
    setSelectedTags([]);
    setWantsDefaultLocation(false);
    setDefaultLocationId("");
    setDefaultLocationName("");
    setDefaultLocationDraft("");
    setWantsDefaultExpiry(false);
    setDefaultExpiryAmount("1");
    setDefaultExpiryUnit("week");
    getCategories()
      .then((loaded) => setCategories(Array.isArray(loaded) ? loaded : []))
      .catch(() => setCategories([]));
    getUnitSuggestions()
      .then((loaded) => setUnits(Array.isArray(loaded) ? loaded : []))
      .catch(() => setUnits([]));
    getTags()
      .then((loaded) => setAllTags(Array.isArray(loaded) ? loaded : []))
      .catch(() => setAllTags([]));
    getStorageLocations()
      .then((loaded) => setStorageLocations(Array.isArray(loaded) ? loaded : []))
      .catch(() => setStorageLocations([]));
  }, [visible, initialName]);

  async function handleCreateTag(tagName: string): Promise<SelectOption> {
    const tag = await createTag(tagName);
    setAllTags((prev) => (prev.some((t) => t._id === tag._id) ? prev : [...prev, tag]));
    return tag;
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Enter a name for the ingredient.");
      return;
    }

    setSaving(true);
    try {
      const category = await resolveOrCreateOption(
        categories,
        categoryId,
        categoryDraft,
        createCategory,
      );
      if (!category) {
        Alert.alert("Category required", "Search or type a category.");
        return;
      }

      const resolvedTags = await Promise.all(
        selectedTags.map((tag) =>
          tag._id ? tag : resolveOrCreateOption(allTags, "", tag.name, handleCreateTag),
        ),
      );
      const tagIds = resolvedTags.filter((t): t is SelectOption => t != null).map((t) => t._id);

      const defaultStorageLocation = wantsDefaultLocation
        ? await resolveOrCreateOption(
            storageLocations,
            defaultLocationId,
            defaultLocationDraft,
            createStorageLocation,
          )
        : null;

      const parsedThreshold = lowStockThreshold.trim() ? Number(lowStockThreshold) : undefined;
      if (parsedThreshold !== undefined && (!Number.isFinite(parsedThreshold) || parsedThreshold < 0)) {
        Alert.alert("Invalid threshold", "Enter a low-stock threshold of zero or greater.");
        return;
      }

      const ingredient = await createIngredient({
        name: trimmedName,
        isGeneric: true,
        category: category._id,
        defaultPortionUnit: unit.trim() || undefined,
        tags: tagIds,
        lowStockThreshold: parsedThreshold,
        defaultStorageLocation: defaultStorageLocation?._id || null,
        defaultExpiryDurationAmount: wantsDefaultExpiry ? Number(defaultExpiryAmount) : null,
        defaultExpiryDurationUnit: wantsDefaultExpiry ? defaultExpiryUnit : null,
      });
      onCreated(ingredient);
    } catch (error) {
      Alert.alert(
        "Couldn't create ingredient",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <Pressable className="absolute inset-0" onPress={onClose} />

          <View className="max-h-[85%] w-full rounded-3xl bg-white">
            <ScrollView
              contentContainerStyle={{ padding: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-lg font-bold text-slate-950">{title}</Text>
              <Text className="mt-0.5 mb-5 text-sm text-slate-400">{description}</Text>

              <FieldLabel text="Name" />
              <FormInput value={name} placeholder="e.g. Soy Sauce" onChangeText={setName} />

              <FieldLabel text="Category" />
              <SearchableObjectDropdown<SelectOption>
                options={categories}
                selectedId={categoryId}
                selectedName={categoryName}
                placeholder="Search or type a new category"
                onTextChange={(value) => {
                  if (value !== categoryName) {
                    setCategoryId("");
                  }
                  setCategoryDraft(value);
                }}
                onSelect={(option) => {
                  setCategoryId(option._id);
                  setCategoryName(option.name);
                  setCategoryDraft(option.name);
                }}
              />

              <FieldLabel text="Unit" />
              <CreatableStringDropdown
                options={units}
                selectedValue={unit}
                placeholder="e.g. g, mL, cup — defaults to serving"
                onSelect={setUnit}
              />

              <FieldLabel text="Tags" />
              <CreatableMultiTagDropdown
                options={allTags}
                selectedItems={selectedTags}
                placeholder="Add a tag…"
                onAdd={(option) => setSelectedTags((prev) => [...prev, option])}
                onRemove={(id) => setSelectedTags((prev) => prev.filter((t) => t._id !== id))}
              />

              <FieldLabel text="Low-stock threshold (optional)" />
              <FormInput
                value={lowStockThreshold}
                placeholder="0"
                keyboardType="decimal-pad"
                onChangeText={setLowStockThreshold}
              />

              <View className="mt-1">
                <ToggleRow
                  label="Set a default storage location"
                  description="Prefills the location when logging a purchase of this ingredient."
                  value={wantsDefaultLocation}
                  onChange={setWantsDefaultLocation}
                />
                {wantsDefaultLocation && (
                  <SearchableObjectDropdown<SelectOption>
                    options={storageLocations}
                    selectedId={defaultLocationId}
                    selectedName={defaultLocationName}
                    placeholder="Search or type a location"
                    onTextChange={(value) => {
                      if (value !== defaultLocationName) setDefaultLocationId("");
                      setDefaultLocationDraft(value);
                    }}
                    onSelect={(option) => {
                      setDefaultLocationId(option._id);
                      setDefaultLocationName(option.name);
                      setDefaultLocationDraft(option.name);
                    }}
                  />
                )}
              </View>

              <View className="mt-1">
                <ToggleRow
                  label="Set a default expiry duration"
                  description="Prefills the expiry date when logging a purchase of this ingredient."
                  value={wantsDefaultExpiry}
                  onChange={setWantsDefaultExpiry}
                />
                {wantsDefaultExpiry && (
                  <DurationValueInput
                    amount={defaultExpiryAmount}
                    unit={defaultExpiryUnit}
                    onChangeAmount={setDefaultExpiryAmount}
                    onChangeUnit={setDefaultExpiryUnit}
                  />
                )}
              </View>

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  disabled={saving}
                  onPress={onClose}
                  className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
                >
                  <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={saving}
                  onPress={() => void handleCreate()}
                  className={`flex-1 items-center rounded-2xl py-3.5 ${
                    saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
                  }`}
                >
                  <Text className="text-sm font-semibold text-white">
                    {saving ? "Creating..." : "Create"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default CreateGenericIngredientModal;
