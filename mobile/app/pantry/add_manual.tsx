import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { createPantryItem } from "@/src/services/pantryApi";
import {
  createBrand,
  createCategory,
  createStorageLocation,
  getBrands,
  getCategories,
  getStorageLocations,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";

interface FormState {
  name: string;
  description: string;
  brandId: string;
  brandName: string;

  categoryId: string;
  categoryName: string;

  storageLocationId: string;
  storageLocationName: string;

  quantityAvailable: string;
  quantityUnit: string;
  purchaseDate: string;
  expiryDate: string;
  lowStockThreshold: string;

  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  fiber: string;
  sodium: string;
}

const initialForm: FormState = {
  name: "",
  description: "",
  brandId: "",
  brandName: "",

  categoryId: "",
  categoryName: "",

  storageLocationId: "",
  storageLocationName: "",

  quantityAvailable: "",
  quantityUnit: "",
  purchaseDate: "",
  expiryDate: "",
  lowStockThreshold: "0",

  calories: "",
  protein: "",
  carbs: "",
  fats: "",
  fiber: "",
  sodium: "",
};

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function isValidDateString(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);

  return !Number.isNaN(date.getTime());
}

export default function AddManualIngredientScreen() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [brands, setBrands] = useState<SelectOption[]>([]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [
          loadedCategories,
          loadedStorageLocations,
          loadedBrands,
          loadedUnits,
        ] = await Promise.all([
          getCategories(),
          getStorageLocations(),
          getBrands(),
          getUnitSuggestions(),
        ]);

        setCategories(Array.isArray(loadedCategories) ? loadedCategories : []);
        setStorageLocations(
          Array.isArray(loadedStorageLocations) ? loadedStorageLocations : [],
        );
        setBrands(Array.isArray(loadedBrands) ? loadedBrands : []);
        setUnits(Array.isArray(loadedUnits) ? loadedUnits : []);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load form options.";

        Alert.alert("Unable to load options", message);
      } finally {
        setLoadingOptions(false);
      }
    }

    void loadOptions();
  }, []);

  function updateForm<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCreateCategory(name: string): Promise<SelectOption> {
    const category = await createCategory(name);

    setCategories((current) => {
      const exists = current.some((item) => item._id === category._id);

      return exists
        ? current
        : [...current, category].sort((a, b) => a.name.localeCompare(b.name));
    });

    return category;
  }

  async function handleCreateStorageLocation(
    name: string,
  ): Promise<SelectOption> {
    const location = await createStorageLocation(name);

    setStorageLocations((current) => {
      const exists = current.some((item) => item._id === location._id);

      return exists
        ? current
        : [...current, location].sort((a, b) => a.name.localeCompare(b.name));
    });

    return location;
  }

  async function handleCreateBrand(name: string): Promise<SelectOption> {
    const brand = await createBrand(name);

    setBrands((current) => {
      const exists = current.some((item) => item._id === brand._id);

      return exists
        ? current
        : [...current, brand].sort((a, b) => a.name.localeCompare(b.name));
    });

    return brand;
  }

  function handleAddUnit(unit: string) {
    const trimmedUnit = unit.trim();

    if (!trimmedUnit) {
      return;
    }

    setUnits((current) => {
      const exists = current.some(
        (item) => item.toLowerCase() === trimmedUnit.toLowerCase(),
      );

      return exists
        ? current
        : [...current, trimmedUnit].sort((a, b) => a.localeCompare(b));
    });

    updateForm("quantityUnit", trimmedUnit);
  }

  async function handleSave() {
    const quantityAvailable = Number(form.quantityAvailable);
    const lowStockThreshold = Number(form.lowStockThreshold);

    if (!form.name.trim()) {
      Alert.alert("Ingredient name required", "Enter the ingredient name.");
      return;
    }

    if (!form.categoryId) {
      Alert.alert("Category required", "Select or create a category.");
      return;
    }

    if (!form.storageLocationId) {
      Alert.alert(
        "Storage location required",
        "Select or create a storage location.",
      );
      return;
    }

    if (!Number.isFinite(quantityAvailable) || quantityAvailable < 0) {
      Alert.alert("Invalid quantity", "Enter a quantity of zero or greater.");
      return;
    }

    if (!form.quantityUnit.trim()) {
      Alert.alert("Quantity unit required", "Select or enter a quantity unit.");
      return;
    }

    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      Alert.alert(
        "Invalid low-stock threshold",
        "Enter a threshold of zero or greater.",
      );
      return;
    }

    if (!isValidDateString(form.purchaseDate)) {
      Alert.alert(
        "Invalid purchase date",
        "Enter the date in YYYY-MM-DD format.",
      );
      return;
    }

    if (!isValidDateString(form.expiryDate)) {
      Alert.alert(
        "Invalid expiry date",
        "Enter the date in YYYY-MM-DD format.",
      );
      return;
    }

    try {
      setSaving(true);

      await createPantryItem({
        name: form.name.trim(),
        description: form.description.trim(),
        brand: form.brandId || undefined,

        // These are MongoDB IDs, not display names.
        category: form.categoryId,
        storageLocation: form.storageLocationId,

        quantityAvailable,
        quantityUnit: form.quantityUnit.trim(),
        purchaseDate: form.purchaseDate.trim() || undefined,
        expiryDate: form.expiryDate.trim() || undefined,
        lowStockThreshold,

        nutrition: {
          calories: optionalNumber(form.calories),
          protein: optionalNumber(form.protein),
          carbs: optionalNumber(form.carbs),
          fats: optionalNumber(form.fats),
          fiber: optionalNumber(form.fiber),
          sodium: optionalNumber(form.sodium),
        },

        nutritionBasis: "per-serving",
      });

      router.back();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The ingredient could not be saved.";

      Alert.alert("Unable to save ingredient", message);
    } finally {
      setSaving(false);
    }
  }

  if (loadingOptions) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />

        <Text className="mt-3 text-slate-500">Loading form options...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50"
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            disabled={saving}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>

          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">
            Add ingredient
          </Text>

          <Pressable
            disabled={saving}
            className={`rounded-xl px-4 py-2 ${
              saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
            }`}
            onPress={handleSave}
          >
            <Text className="font-semibold text-white">
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-16 pt-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
        >
          <SectionTitle
            title="Ingredient details"
            description="Information that describes the food or product."
            first
          />

          <FieldLabel text="Ingredient name" required />

          <FormInput
            value={form.name}
            placeholder="Example: Atlantic salmon"
            autoCapitalize="words"
            onChangeText={(value) => updateForm("name", value)}
          />

          <FieldLabel text="Brand" />

          <CreatableObjectDropdown
            options={brands}
            selectedId={form.brandId}
            selectedName={form.brandName}
            placeholder="Search or create a brand"
            createLabel="Create brand"
            onSelect={(option) => {
              updateForm("brandId", option._id);
              updateForm("brandName", option.name);
            }}
            onCreate={handleCreateBrand}
          />

          <FieldLabel text="Description" />

          <FormInput
            value={form.description}
            placeholder="Optional description"
            multiline
            onChangeText={(value) => updateForm("description", value)}
          />

          <FieldLabel text="Category" required />

          <CreatableObjectDropdown
            options={categories}
            selectedId={form.categoryId}
            selectedName={form.categoryName}
            placeholder="Search or create a category"
            createLabel="Create category"
            onSelect={(option) => {
              updateForm("categoryId", option._id);
              updateForm("categoryName", option.name);
            }}
            onCreate={handleCreateCategory}
          />

          <SectionTitle
            title="Pantry inventory"
            description="Where the item is stored and how much you currently have."
          />

          <FieldLabel text="Storage location" required />

          <CreatableObjectDropdown
            options={storageLocations}
            selectedId={form.storageLocationId}
            selectedName={form.storageLocationName}
            placeholder="Search or create a storage location"
            createLabel="Create location"
            onSelect={(option) => {
              updateForm("storageLocationId", option._id);
              updateForm("storageLocationName", option.name);
            }}
            onCreate={handleCreateStorageLocation}
          />

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Quantity" required />

              <FormInput
                value={form.quantityAvailable}
                placeholder="12"
                keyboardType="decimal-pad"
                onChangeText={(value) => updateForm("quantityAvailable", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Unit" required />

              <CreatableStringDropdown
                options={units}
                selectedValue={form.quantityUnit}
                placeholder="Search or create a unit"
                createLabel="Use unit"
                onSelect={(unit) => updateForm("quantityUnit", unit)}
                onCreate={handleAddUnit}
              />
            </View>
          </View>

          <FieldLabel text="Purchase date" />

          <FormInput
            value={form.purchaseDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            onChangeText={(value) => updateForm("purchaseDate", value)}
          />

          <FieldLabel text="Expiry date" />

          <FormInput
            value={form.expiryDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            onChangeText={(value) => updateForm("expiryDate", value)}
          />

          <FieldLabel text="Low-stock threshold" />

          <FormInput
            value={form.lowStockThreshold}
            placeholder="0"
            keyboardType="decimal-pad"
            onChangeText={(value) => updateForm("lowStockThreshold", value)}
          />

          <Text className="mt-2 text-sm leading-5 text-slate-500">
            The item is considered low stock when its quantity reaches this
            value.
          </Text>

          <SectionTitle
            title="Nutrition per serving"
            description="Optional nutrition values for one serving."
          />

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Calories" />

              <FormInput
                value={form.calories}
                keyboardType="decimal-pad"
                placeholder="0"
                onChangeText={(value) => updateForm("calories", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Protein (g)" />

              <FormInput
                value={form.protein}
                keyboardType="decimal-pad"
                placeholder="0"
                onChangeText={(value) => updateForm("protein", value)}
              />
            </View>
          </View>

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Carbs (g)" />

              <FormInput
                value={form.carbs}
                keyboardType="decimal-pad"
                placeholder="0"
                onChangeText={(value) => updateForm("carbs", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Fats (g)" />

              <FormInput
                value={form.fats}
                keyboardType="decimal-pad"
                placeholder="0"
                onChangeText={(value) => updateForm("fats", value)}
              />
            </View>
          </View>

          <View className="flex-row">
            <View className="mr-3 flex-1">
              <FieldLabel text="Fiber (g)" />

              <FormInput
                value={form.fiber}
                keyboardType="decimal-pad"
                placeholder="0"
                onChangeText={(value) => updateForm("fiber", value)}
              />
            </View>

            <View className="flex-1">
              <FieldLabel text="Sodium (mg)" />

              <FormInput
                value={form.sodium}
                keyboardType="decimal-pad"
                placeholder="0"
                onChangeText={(value) => updateForm("sodium", value)}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionTitle({
  title,
  description,
  first = false,
}: {
  title: string;
  description: string;
  first?: boolean;
}) {
  return (
    <View className={`mb-1 ${first ? "mt-0" : "mt-8"}`}>
      <Text className="text-xl font-bold text-slate-950">{title}</Text>

      <Text className="mt-1 text-sm leading-5 text-slate-500">
        {description}
      </Text>
    </View>
  );
}

function FieldLabel({
  text,
  required = false,
}: {
  text: string;
  required?: boolean;
}) {
  return (
    <Text className="mb-2 mt-4 text-sm font-semibold text-slate-700">
      {text}
      {required ? " *" : ""}
    </Text>
  );
}

function FormInput({
  multiline = false,
  ...props
}: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      placeholderTextColor="#94A3B8"
      className={`rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950 ${
        multiline ? "min-h-24 py-3" : "h-[52px]"
      }`}
    />
  );
}

interface CreatableObjectDropdownProps {
  options: SelectOption[];
  selectedId: string;
  selectedName: string;
  placeholder: string;
  createLabel: string;
  onSelect: (option: SelectOption) => void;
  onCreate: (name: string) => Promise<SelectOption>;
}

function CreatableObjectDropdown({
  options,
  selectedId,
  selectedName,
  placeholder,
  createLabel,
  onSelect,
  onCreate,
}: CreatableObjectDropdownProps) {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

  const safeSelectedName = typeof selectedName === "string" ? selectedName : "";

  const anchorRef = useRef<View>(null);
  const modalInputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState(safeSelectedName);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [menuLayout, setMenuLayout] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  useEffect(() => {
    if (!open) {
      setQuery(safeSelectedName);
    }
  }, [safeSelectedName, open]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return safeOptions;
    }

    return safeOptions.filter((option) =>
      option.name.toLowerCase().includes(normalizedQuery),
    );
  }, [safeOptions, query]);

  const exactMatch = safeOptions.some(
    (option) => option.name.trim().toLowerCase() === query.trim().toLowerCase(),
  );

  function openMenu() {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuLayout({
        left: x,
        top: y,
        width,
      });

      setQuery(safeSelectedName);
      setOpen(true);

      setTimeout(() => {
        modalInputRef.current?.focus();
      }, 100);
    });
  }

  function closeMenu() {
    setOpen(false);
    setQuery(safeSelectedName);
  }

  async function createNewOption() {
    const name = query.trim();

    if (!name || creating) {
      return;
    }

    try {
      setCreating(true);
      const option = await onCreate(name);

      onSelect(option);
      setQuery(option.name);
      setOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The option could not be created.";

      Alert.alert("Unable to create option", message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        className={`flex-row items-center rounded-2xl border bg-white px-4 ${
          open ? "border-blue-500" : "border-slate-200"
        }`}
        onPress={openMenu}
      >
        <Ionicons name="search-outline" size={19} color="#64748B" />

        <Text
          numberOfLines={1}
          className={`h-[52px] flex-1 px-3 text-base leading-[52px] ${
            safeSelectedName ? "text-slate-950" : "text-slate-400"
          }`}
        >
          {safeSelectedName || placeholder}
        </Text>

        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color="#64748B"
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <View className="flex-1">
          <Pressable className="absolute inset-0" onPress={closeMenu} />

          <View
            className="max-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            style={{
              position: "absolute",
              top: menuLayout.top,
              left: menuLayout.left,
              width: menuLayout.width,
              zIndex: 1001,
              elevation: 20,
            }}
          >
            <View className="flex-row items-center border-b border-slate-200 px-4">
              <Ionicons name="search-outline" size={19} color="#64748B" />

              <TextInput
                ref={modalInputRef}
                value={query}
                placeholder={placeholder}
                placeholderTextColor="#94A3B8"
                className="h-[52px] flex-1 px-3 text-base text-slate-950"
                onChangeText={setQuery}
              />

              {!!query && (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    setQuery("");
                    modalInputRef.current?.focus();
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#94A3B8" />
                </Pressable>
              )}
            </View>

            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredOptions.map((option) => {
                const selected = option._id === selectedId;

                return (
                  <Pressable
                    key={option._id}
                    className="flex-row items-center border-b border-slate-100 px-4 py-3 active:bg-slate-50"
                    onPress={() => {
                      onSelect(option);
                      setQuery(option.name);
                      setOpen(false);
                    }}
                  >
                    <Text className="flex-1 text-base text-slate-900">
                      {option.name}
                    </Text>

                    {selected && (
                      <Ionicons name="checkmark" size={20} color="#2563EB" />
                    )}
                  </Pressable>
                );
              })}

              {!!query.trim() && !exactMatch && (
                <Pressable
                  className="flex-row items-center bg-blue-50 px-4 py-3 active:bg-blue-100"
                  disabled={creating}
                  onPress={createNewOption}
                >
                  <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                    {creating ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Ionicons name="add" size={20} color="#2563EB" />
                    )}
                  </View>

                  <Text className="flex-1 text-base font-semibold text-blue-700">
                    {creating
                      ? "Creating..."
                      : `${createLabel} "${query.trim()}"`}
                  </Text>
                </Pressable>
              )}

              {filteredOptions.length === 0 &&
                (!query.trim() || exactMatch) && (
                  <Text className="px-4 py-4 text-center text-slate-500">
                    No matching options
                  </Text>
                )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface CreatableStringDropdownProps {
  options: string[];
  selectedValue: string;
  placeholder: string;
  createLabel: string;
  onSelect: (value: string) => void;
  onCreate: (value: string) => void;
}

function CreatableStringDropdown({
  options,
  selectedValue,
  placeholder,
  createLabel,
  onSelect,
  onCreate,
}: CreatableStringDropdownProps) {
  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

  const safeSelectedValue =
    typeof selectedValue === "string" ? selectedValue : "";

  const anchorRef = useRef<View>(null);
  const modalInputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState(safeSelectedValue);
  const [open, setOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  useEffect(() => {
    if (!open) {
      setQuery(safeSelectedValue);
    }
  }, [safeSelectedValue, open]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return safeOptions;
    }

    return safeOptions.filter((option) =>
      option.toLowerCase().includes(normalizedQuery),
    );
  }, [safeOptions, query]);

  const exactMatch = safeOptions.some(
    (option) => option.trim().toLowerCase() === query.trim().toLowerCase(),
  );

  function openMenu() {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuLayout({
        left: x,
        top: y + height + 8,
        width,
      });

      setQuery(safeSelectedValue);
      setOpen(true);

      setTimeout(() => {
        modalInputRef.current?.focus();
      }, 100);
    });
  }

  function closeMenu() {
    setOpen(false);
    setQuery(safeSelectedValue);
  }

  function useNewValue() {
    const value = query.trim();

    if (!value) {
      return;
    }

    onCreate(value);
    onSelect(value);
    setQuery(value);
    setOpen(false);
  }

  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        className={`flex-row items-center rounded-2xl border bg-white px-3 ${
          open ? "border-blue-500" : "border-slate-200"
        }`}
        onPress={openMenu}
      >
        <Text
          numberOfLines={1}
          className={`h-[52px] flex-1 text-base leading-[52px] ${
            safeSelectedValue ? "text-slate-950" : "text-slate-400"
          }`}
        >
          {safeSelectedValue || placeholder}
        </Text>

        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#64748B"
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <View className="flex-1">
          <Pressable className="absolute inset-0" onPress={closeMenu} />

          <View
            className="max-h-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            style={{
              position: "absolute",
              top: menuLayout.top,
              left: menuLayout.left,
              width: menuLayout.width,
              zIndex: 1001,
              elevation: 20,
            }}
          >
            <View className="flex-row items-center border-b border-slate-200 px-4">
              <Ionicons name="search-outline" size={19} color="#64748B" />

              <TextInput
                ref={modalInputRef}
                value={query}
                placeholder={placeholder}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                className="h-[52px] flex-1 px-3 text-base text-slate-950"
                onChangeText={setQuery}
              />

              {!!query && (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    setQuery("");
                    modalInputRef.current?.focus();
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#94A3B8" />
                </Pressable>
              )}
            </View>

            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredOptions.map((option) => {
                const selected =
                  option.trim().toLowerCase() ===
                  safeSelectedValue.trim().toLowerCase();

                return (
                  <Pressable
                    key={option}
                    className="flex-row items-center border-b border-slate-100 px-4 py-3 active:bg-slate-50"
                    onPress={() => {
                      onSelect(option);
                      setQuery(option);
                      setOpen(false);
                    }}
                  >
                    <Text className="flex-1 text-base text-slate-900">
                      {option}
                    </Text>

                    {selected && (
                      <Ionicons name="checkmark" size={19} color="#2563EB" />
                    )}
                  </Pressable>
                );
              })}

              {!!query.trim() && !exactMatch && (
                <Pressable
                  className="flex-row items-center bg-blue-50 px-4 py-3 active:bg-blue-100"
                  onPress={useNewValue}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={21}
                    color="#2563EB"
                  />

                  <Text className="ml-3 flex-1 text-base font-semibold text-blue-700">
                    {createLabel} &quot;{query.trim()}&quot;
                  </Text>
                </Pressable>
              )}

              {filteredOptions.length === 0 &&
                (!query.trim() || exactMatch) && (
                  <Text className="px-4 py-4 text-center text-slate-500">
                    No matching options
                  </Text>
                )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
