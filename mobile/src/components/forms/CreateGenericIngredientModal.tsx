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

import { CreatableStringDropdown } from "./CreatableStringDropdown";
import { FieldLabel } from "./FieldLabel";
import { FormInput } from "./FormInput";
import { SearchableObjectDropdown } from "./SearchableObjectDropdown";

import { createIngredient, type Ingredient } from "@/src/services/ingredientApi";
import {
  createCategory,
  getCategories,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setCategoryId("");
    setCategoryName("");
    setCategoryDraft("");
    setUnit("");
    getCategories()
      .then((loaded) => setCategories(Array.isArray(loaded) ? loaded : []))
      .catch(() => setCategories([]));
    getUnitSuggestions()
      .then((loaded) => setUnits(Array.isArray(loaded) ? loaded : []))
      .catch(() => setUnits([]));
  }, [visible, initialName]);

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

      const ingredient = await createIngredient({
        name: trimmedName,
        isGeneric: true,
        category: category._id,
        defaultPortionUnit: unit.trim() || undefined,
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
