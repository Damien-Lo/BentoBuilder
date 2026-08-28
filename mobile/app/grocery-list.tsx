import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import {
  createStorageLocation,
  createStore,
  getStorageLocations,
  getStores,
  getUnitSuggestions,
  type SelectOption,
} from "@/src/services/optionsApi";
import {
  addIngredientToPantry,
  deletePantryItem,
  getPantryItems,
} from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import {
  CreatableStringDropdown,
  DateTextInput,
  DurationExpiryInput,
  FieldLabel,
  PriceInput,
  SearchableObjectDropdown,
  SegmentedToggle,
  UnitFamilyDropdown,
} from "@/src/components/forms";
import {
  clearCompletedGroceryItems,
  createGroceryItem,
  deleteGroceryItem,
  getGroceryItems,
  updateGroceryItem,
  type GroceryItem,
  type GroceryItemIngredientRef,
  type GroceryItemStatus,
} from "@/src/services/groceryListApi";
import { loadSettings } from "@/src/services/settingsService";
import {
  convertAmountForUnitChange,
  getIngredientConversions,
  getRelatedUnits,
  type CustomUnitConversion,
} from "@/src/utils/unitConversion";
import { addDurationToDate, todayDateInputString } from "@/src/utils/date";
import { resolveOrCreateOption } from "@/src/utils/resolveOrCreateOption";
import {
  recentPantryEntries,
  referenceId,
  referenceName,
  suggestExpiryDuration,
  suggestStorageLocation,
  suggestStore,
} from "@/src/utils/pantryDefaults";
import { groupGroceryItemsByStore } from "@/src/utils/groceryGrouping";
import { ReceiptScannerModal } from "@/src/components/ReceiptScannerModal";
import { parseReceipt } from "@/src/services/receiptApi";
import { clearReviewDraft, setPendingReceipt } from "@/src/utils/receiptReviewStore";

// A pendingLog item can be logged to pantry (directly, or via a quick
// choice for generics) as long as it's linked to a catalog ingredient —
// free-text items have nothing to log against.
function isLinkedToIngredient(item: GroceryItem): boolean {
  return typeof item.ingredient === "object" && item.ingredient !== null;
}

function getReferenceName(value: unknown): string {
  if (typeof value === "object" && value !== null && "name" in value) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

export default function GroceryListScreen() {
  const router = useRouter();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [customUnitConversions, setCustomUnitConversions] = useState<CustomUnitConversion[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [stores, setStores] = useState<SelectOption[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Shopping Mode — a store-grouped view of the same list/data, for
  // efficient in-store use, plus a way straight into the receipt scanner
  // once shopping's done.
  const [viewMode, setViewMode] = useState<"list" | "shopping">("list");
  const [receiptScannerVisible, setReceiptScannerVisible] = useState(false);
  const [parsingReceipt, setParsingReceipt] = useState(false);

  const [nameInput, setNameInput] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [adding, setAdding] = useState(false);

  // Log-to-pantry modal state — logTargetIngredientId is explicit (not just
  // derived from loggingItem.ingredient) so this same modal can log against
  // a different ingredient than the grocery item's own link — e.g. a
  // specific variant chosen from the generic-resolve modal below.
  const [loggingItem, setLoggingItem] = useState<GroceryItem | null>(null);
  const [logTargetIngredientId, setLogTargetIngredientId] = useState<string | null>(null);
  const [logTargetIngredientName, setLogTargetIngredientName] = useState("");
  const [logLocationId, setLogLocationId] = useState("");
  const [logLocationName, setLogLocationName] = useState("");
  const [logLocationDraft, setLogLocationDraft] = useState("");
  const [logPurchaseDate, setLogPurchaseDate] = useState("");
  const [logExpiryDate, setLogExpiryDate] = useState("");
  const [logQuantity, setLogQuantity] = useState("");
  const [logUnit, setLogUnit] = useState("");
  const [logEntryCount, setLogEntryCount] = useState("1");
  const [logPrice, setLogPrice] = useState("");
  const [logStoreId, setLogStoreId] = useState("");
  const [logStoreName, setLogStoreName] = useState("");
  const [logStoreDraft, setLogStoreDraft] = useState("");
  const [logStoreTouched, setLogStoreTouched] = useState(false);
  const [logNotes, setLogNotes] = useState("");
  const [logShowMoreDetails, setLogShowMoreDetails] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [logLocationTouched, setLogLocationTouched] = useState(false);
  const [logExpiryTouched, setLogExpiryTouched] = useState(false);

  // Resolve-a-generic-linked-item modal state — offers logging the generic
  // itself, logging the one existing variant (if there's exactly one), or
  // adding/choosing a specific product.
  const [resolvingGenericItem, setResolvingGenericItem] = useState<{
    item: GroceryItem;
    generic: GroceryItemIngredientRef;
    variants: Ingredient[];
  } | null>(null);

  // Link/relink modal — lets any non-completed item be matched to a catalog
  // ingredient after the fact, whether it started unlinked or just needs a
  // different match.
  const [linkingItem, setLinkingItem] = useState<GroceryItem | null>(null);
  const [linkQuery, setLinkQuery] = useState("");

  // Refetches every time this screen regains focus — e.g. coming back from
  // resolving a grocery item via the add-ingredient screen, which updates
  // this list's data from a separate screen instance. Only the very first
  // load shows the full-screen spinner; later refetches happen quietly.
  const hasLoadedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const isFirstLoad = !hasLoadedOnceRef.current;

      async function load() {
        if (isFirstLoad) setIsLoading(true);

        try {
          const [
            loadedIngredients,
            loadedUnits,
            loadedGroceryItems,
            loadedSettings,
            loadedLocations,
            loadedStores,
            loadedPantryItems,
          ] = await Promise.all([
            getIngredients(),
            getUnitSuggestions(),
            getGroceryItems(),
            loadSettings(),
            getStorageLocations(),
            getStores(),
            getPantryItems(),
          ]);
          if (!cancelled) {
            setIngredients(Array.isArray(loadedIngredients) ? loadedIngredients : []);
            setUnitOptions(Array.isArray(loadedUnits) ? loadedUnits : []);
            setGroceryItems(loadedGroceryItems);
            setCustomUnitConversions(loadedSettings.unitConversions ?? []);
            setStorageLocations(Array.isArray(loadedLocations) ? loadedLocations : []);
            setStores(Array.isArray(loadedStores) ? loadedStores : []);
            setPantryItems(Array.isArray(loadedPantryItems) ? loadedPantryItems : []);
            hasLoadedOnceRef.current = true;
          }
        } catch (err) {
          if (!cancelled) {
            Alert.alert(
              "Could not load",
              err instanceof Error ? err.message : "Failed to load the grocery list.",
            );
          }
        } finally {
          if (!cancelled && isFirstLoad) setIsLoading(false);
        }
      }

      void load();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const grocerySuggestions = useMemo(() => {
    const q = nameInput.trim().toLowerCase();
    if (!q) return [];
    return ingredients.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 5);
  }, [ingredients, nameInput]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i._id === selectedIngredientId) ?? null,
    [ingredients, selectedIngredientId],
  );

  // Once an ingredient is picked, only units in its own family (mass,
  // volume, or a custom conversion linked to it) make sense to buy it in —
  // otherwise fall back to the full suggestion list for free-text items.
  const unitDropdownOptions = selectedIngredient?.defaultPortionUnit
    ? getRelatedUnits(selectedIngredient.defaultPortionUnit, getIngredientConversions(selectedIngredient, customUnitConversions))
    : unitOptions;

  const toBuyItems = useMemo(
    () => groceryItems.filter((i) => i.status === "toBuy"),
    [groceryItems],
  );
  const pendingLogItems = useMemo(
    () => groceryItems.filter((i) => i.status === "pendingLog"),
    [groceryItems],
  );
  const completedItems = useMemo(
    () => groceryItems.filter((i) => i.status === "completed"),
    [groceryItems],
  );
  const storeGroups = useMemo(
    () => groupGroceryItemsByStore([...toBuyItems, ...pendingLogItems], pantryItems),
    [toBuyItems, pendingLogItems, pantryItems],
  );

  function selectSuggestion(ingredient: Ingredient) {
    setNameInput(ingredient.name);
    setSelectedIngredientId(ingredient._id);
    setUnit(ingredient.defaultPortionUnit || unit);
  }

  async function submitAddItem(ingredientId: string | null) {
    const name = nameInput.trim();
    if (!name) return;

    try {
      setAdding(true);
      const created = await createGroceryItem({
        ingredient: ingredientId,
        name,
        quantity: quantity.trim() ? Number(quantity) : null,
        unit: unit.trim(),
      });
      // A linked ingredient can merge into an already-existing toBuy item
      // (accumulating the manual contribution) instead of creating a new
      // one — this response may be that existing item, updated, not a
      // fresh row, so upsert by id rather than always appending.
      setGroceryItems((prev) => {
        const index = prev.findIndex((item) => item._id === created._id);
        return index >= 0
          ? prev.map((item) => (item._id === created._id ? created : item))
          : [...prev, created];
      });
      setNameInput("");
      setSelectedIngredientId("");
      setQuantity("");
      setUnit("");
    } catch (err) {
      Alert.alert(
        "Could not add item",
        err instanceof Error ? err.message : "Failed to add the item.",
      );
    } finally {
      setAdding(false);
    }
  }

  // A typed name that exactly matches an existing ingredient but was never
  // tapped from the suggestions list is ambiguous — ask instead of silently
  // creating an unlinked item that shadows a real catalog entry.
  function handleAddItem() {
    const name = nameInput.trim();
    if (!name || adding) return;

    if (selectedIngredientId) {
      void submitAddItem(selectedIngredientId);
      return;
    }

    const exactMatch = ingredients.find(
      (i) => i.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (exactMatch) {
      Alert.alert(
        "Matches an existing ingredient",
        `"${exactMatch.name}" is already in your catalog. Link this item to it, or add it as a separate one-off entry?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add as one-off", onPress: () => void submitAddItem(null) },
          { text: `Use "${exactMatch.name}"`, onPress: () => void submitAddItem(exactMatch._id) },
        ],
      );
      return;
    }

    void submitAddItem(null);
  }

  // toBuy -> pendingLog is the "checked off at the store" step. pendingLog
  // can only go back to toBuy here — advancing to "completed" isn't a plain
  // tap, it happens once the pantry-logging flow (storage location, expiry,
  // etc.) is built and actually completed. Tapping a completed item reverts
  // it by one step too, in case it was logged by mistake.
  function nextStatus(current: GroceryItemStatus): GroceryItemStatus {
    switch (current) {
      case "toBuy":
        return "pendingLog";
      case "pendingLog":
        return "toBuy";
      case "completed":
        return "pendingLog";
    }
  }

  // Undoing a completed item deletes the pantry entry it created — unlike
  // every other status change, this one isn't a plain toggle. The pantry
  // delete happens before the grocery item is updated, so a failure here
  // never leaves the grocery item "completed" while pointing at a pantry
  // entry that's already gone.
  async function handleUncheckItem(item: GroceryItem) {
    try {
      if (item.pantryItem) {
        await deletePantryItem(item.pantryItem);
      }
      const updated = await updateGroceryItem(item._id, {
        status: "pendingLog",
        pantryItem: null,
      });
      setGroceryItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
    } catch (err) {
      Alert.alert(
        "Could not undo",
        err instanceof Error ? err.message : "Failed to remove the pantry entry.",
      );
    }
  }

  async function handleAdvanceItem(item: GroceryItem) {
    if (item.status === "completed") {
      return handleUncheckItem(item);
    }

    const previousStatus = item.status;
    const status = nextStatus(previousStatus);
    setGroceryItems((prev) =>
      prev.map((i) => (i._id === item._id ? { ...i, status } : i)),
    );
    try {
      await updateGroceryItem(item._id, { status });
    } catch (err) {
      setGroceryItems((prev) =>
        prev.map((i) => (i._id === item._id ? { ...i, status: previousStatus } : i)),
      );
      Alert.alert(
        "Could not update item",
        err instanceof Error ? err.message : "Failed to update the item.",
      );
    }
  }

  async function handleDeleteItem(id: string) {
    const previous = groceryItems;
    setGroceryItems((prev) => prev.filter((i) => i._id !== id));
    try {
      await deleteGroceryItem(id);
    } catch (err) {
      setGroceryItems(previous);
      Alert.alert(
        "Could not delete item",
        err instanceof Error ? err.message : "Failed to delete the item.",
      );
    }
  }

  async function handleClearCompleted() {
    const previous = groceryItems;
    setGroceryItems((prev) => prev.filter((i) => i.status !== "completed"));
    try {
      await clearCompletedGroceryItems();
    } catch (err) {
      setGroceryItems(previous);
      Alert.alert(
        "Could not clear items",
        err instanceof Error ? err.message : "Failed to clear completed items.",
      );
    }
  }

  // Opens the lightweight log-to-pantry modal targeting a specific
  // ingredient — either the grocery item's own link (the common case) or an
  // alternate chosen from the generic-resolve modal (a specific variant, or
  // the generic itself).
  function openLogModal(item: GroceryItem, targetIngredientId: string, targetIngredientName: string) {
    const targetIngredient = ingredients.find((i) => i._id === targetIngredientId);

    setLoggingItem(item);
    setLogTargetIngredientId(targetIngredientId);
    setLogTargetIngredientName(targetIngredientName);
    setLogLocationId("");
    setLogLocationName("");
    setLogLocationDraft("");
    setLogLocationTouched(false);
    setLogPurchaseDate(todayDateInputString());
    setLogExpiryDate("");
    setLogExpiryTouched(false);
    setLogQuantity(item.quantity != null ? String(item.quantity) : "");
    setLogUnit(item.unit || targetIngredient?.defaultPortionUnit || "");
    setLogEntryCount("1");
    setLogPrice("");
    setLogStoreId("");
    setLogStoreName("");
    setLogStoreDraft("");
    setLogStoreTouched(false);
    setLogNotes("");
    setLogShowMoreDetails(false);
  }

  function handleTapPendingItem(item: GroceryItem) {
    const linkedIngredient =
      typeof item.ingredient === "object" ? item.ingredient : null;

    if (!linkedIngredient) {
      Alert.alert(
        "Not linked to an ingredient",
        `"${item.name}" isn't linked to a catalog ingredient yet. Link it to an existing one, or add it as new so you can log it to your pantry.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Link existing", onPress: () => openLinkModal(item) },
          {
            text: "Add new",
            onPress: () =>
              router.push({
                pathname: "/ingredients/add_manual",
                params: { groceryItemId: item._id, prefillName: item.name },
              }),
          },
        ],
      );
      return;
    }

    if (!linkedIngredient.isGeneric) {
      openLogModal(item, linkedIngredient._id, linkedIngredient.name);
      return;
    }

    // Generic (e.g. "Garlic") — could be logged directly, against an
    // existing specific variant, or resolved by adding a new one. Always
    // ask, since a past purchase being generic doesn't mean this one is.
    const existingVariants = ingredients.filter(
      (candidate) => !candidate.isGeneric && referenceId(candidate.genericParent) === linkedIngredient._id,
    );

    setResolvingGenericItem({ item, generic: linkedIngredient, variants: existingVariants });
  }

  function closeLogModal() {
    setLoggingItem(null);
    setLogTargetIngredientId(null);
    setLogTargetIngredientName("");
  }

  function openLinkModal(item: GroceryItem) {
    setLinkingItem(item);
    setLinkQuery("");
  }

  function closeLinkModal() {
    setLinkingItem(null);
    setLinkQuery("");
  }

  async function handleLinkIngredient(ingredientId: string) {
    if (!linkingItem) return;
    try {
      const updated = await updateGroceryItem(linkingItem._id, { ingredient: ingredientId });
      setGroceryItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      closeLinkModal();
    } catch (err) {
      Alert.alert(
        "Could not link ingredient",
        err instanceof Error ? err.message : "Failed to link the ingredient.",
      );
    }
  }

  async function handleUnlinkIngredient() {
    if (!linkingItem) return;
    try {
      const updated = await updateGroceryItem(linkingItem._id, { ingredient: null });
      setGroceryItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      closeLinkModal();
    } catch (err) {
      Alert.alert(
        "Could not unlink ingredient",
        err instanceof Error ? err.message : "Failed to unlink the ingredient.",
      );
    }
  }

  const linkingItemIngredientId = linkingItem ? referenceId(linkingItem.ingredient) : "";

  const linkModalOptions = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    if (!q) return ingredients.slice(0, 30);
    return ingredients.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 30);
  }, [ingredients, linkQuery]);

  // The grocery item's populated ingredient is a thin projection — look up
  // the full record (with defaultStorageLocation/defaultExpiryDuration...)
  // from the ingredient catalog already loaded on this page.
  const loggingFullIngredient = useMemo(
    () =>
      logTargetIngredientId
        ? ingredients.find((i) => i._id === logTargetIngredientId) ?? null
        : null,
    [ingredients, logTargetIngredientId],
  );

  const logUnitOptions = loggingFullIngredient?.defaultPortionUnit
    ? getRelatedUnits(
        loggingFullIngredient.defaultPortionUnit,
        getIngredientConversions(loggingFullIngredient, customUnitConversions),
      )
    : unitOptions;

  const recentLoggingHistory = useMemo(() => {
    if (!logTargetIngredientId) return [];
    return recentPantryEntries(
      pantryItems.filter((item) => referenceId(item.ingredient) === logTargetIngredientId),
    );
  }, [pantryItems, logTargetIngredientId]);

  const suggestedLogLocation = useMemo(
    () => suggestStorageLocation(recentLoggingHistory),
    [recentLoggingHistory],
  );

  const suggestedLogExpiryDuration = useMemo(
    () => suggestExpiryDuration(recentLoggingHistory),
    [recentLoggingHistory],
  );

  // What actually drives the auto-fills below: the ingredient's own saved
  // default if it has one, otherwise the live suggestion from history.
  const effectiveLogLocation = useMemo(() => {
    const savedId = referenceId(loggingFullIngredient?.defaultStorageLocation);
    if (savedId) {
      const name =
        referenceName(loggingFullIngredient?.defaultStorageLocation) ||
        storageLocations.find((location) => location._id === savedId)?.name ||
        "";
      return { id: savedId, name };
    }
    return suggestedLogLocation;
  }, [loggingFullIngredient, suggestedLogLocation, storageLocations]);

  const effectiveLogExpiryDuration = useMemo(() => {
    if (
      loggingFullIngredient?.defaultExpiryDurationAmount != null &&
      loggingFullIngredient.defaultExpiryDurationUnit
    ) {
      return {
        amount: loggingFullIngredient.defaultExpiryDurationAmount,
        unit: loggingFullIngredient.defaultExpiryDurationUnit,
      };
    }
    return suggestedLogExpiryDuration;
  }, [loggingFullIngredient, suggestedLogExpiryDuration]);

  useEffect(() => {
    if (!loggingItem || logLocationTouched || !effectiveLogLocation) return;
    setLogLocationId(effectiveLogLocation.id);
    setLogLocationName(effectiveLogLocation.name);
    setLogLocationDraft(effectiveLogLocation.name);
  }, [loggingItem, effectiveLogLocation, logLocationTouched]);

  useEffect(() => {
    if (!loggingItem || logExpiryTouched || !effectiveLogExpiryDuration) return;
    setLogExpiryDate(
      addDurationToDate(logPurchaseDate, effectiveLogExpiryDuration.amount, effectiveLogExpiryDuration.unit),
    );
  }, [loggingItem, logPurchaseDate, effectiveLogExpiryDuration, logExpiryTouched]);

  // The most frequently bought-from store across this ingredient's recent
  // history — no per-ingredient "default store" to check first, since store
  // is purely a per-purchase attribute.
  const suggestedLogStore = useMemo(
    () => suggestStore(recentLoggingHistory),
    [recentLoggingHistory],
  );

  useEffect(() => {
    if (!loggingItem || logStoreTouched || !suggestedLogStore) return;
    setLogStoreId(suggestedLogStore.id);
    setLogStoreName(suggestedLogStore.name);
    setLogStoreDraft(suggestedLogStore.name);
  }, [loggingItem, suggestedLogStore, logStoreTouched]);

  async function handleCreatePantryEntry() {
    if (!loggingItem || !logTargetIngredientId) return;

    const qty = Number(logQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Invalid quantity", "Enter a quantity greater than 0.");
      return;
    }
    if (!logUnit.trim()) {
      Alert.alert("Unit required", "Select or enter a unit.");
      return;
    }
    if (logPrice.trim()) {
      const parsedPrice = Number(logPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        Alert.alert("Invalid price", "Enter a valid price of 0 or more.");
        return;
      }
    }

    try {
      setLogSaving(true);

      const storageLocation = await resolveOrCreateOption(
        storageLocations,
        logLocationId,
        logLocationDraft,
        createStorageLocation,
      );
      if (!storageLocation) {
        Alert.alert("Storage location required", "Search or type a storage location.");
        return;
      }
      if (!storageLocations.some((l) => l._id === storageLocation._id)) {
        setStorageLocations((prev) => [...prev, storageLocation]);
      }

      const store = await resolveOrCreateOption(stores, logStoreId, logStoreDraft, createStore);
      if (store && !stores.some((s) => s._id === store._id)) {
        setStores((prev) => [...prev, store]);
      }

      const entryCount = Math.max(1, Math.round(Number(logEntryCount)) || 1);
      let newPantryItem: PantryItem | undefined;
      for (let i = 0; i < entryCount; i++) {
        newPantryItem = await addIngredientToPantry({
          ingredient: logTargetIngredientId,
          storageLocation: storageLocation._id,
          quantityAvailable: qty,
          quantityUnit: logUnit.trim(),
          purchaseDate: logPurchaseDate || undefined,
          expiryDate: logExpiryDate || undefined,
          purchasePrice: logPrice.trim() ? Number(logPrice) : undefined,
          store: store ? store._id : null,
          notes: logNotes.trim() || undefined,
        });
      }

      const updated = await updateGroceryItem(loggingItem._id, {
        status: "completed",
        pantryItem: newPantryItem!._id,
      });
      setGroceryItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      closeLogModal();
    } catch (err) {
      Alert.alert(
        "Could not log to pantry",
        err instanceof Error ? err.message : "Failed to create the pantry entry.",
      );
    } finally {
      setLogSaving(false);
    }
  }

  function renderGroceryRow(item: GroceryItem) {
    const isPending = item.status === "pendingLog";
    const isCompleted = item.status === "completed";

    const circleClassName = isCompleted
      ? "border-emerald-500 bg-emerald-500"
      : isPending
        ? "border-amber-500 bg-amber-500"
        : "border-slate-300";

    return (
      <ReanimatedSwipeable
        key={item._id}
        friction={2}
        rightThreshold={40}
        leftThreshold={40}
        renderLeftActions={() => (
          <Pressable
            className="mb-2.5 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
            onPress={() => void handleDeleteItem(item._id)}
          >
            <Ionicons name="trash-outline" size={22} color="white" />
          </Pressable>
        )}
        renderRightActions={
          isPending
            ? () => (
                <Pressable
                  className="mb-2.5 w-24 items-center justify-center rounded-2xl bg-slate-400 active:bg-slate-500"
                  onPress={() => void handleAdvanceItem(item)}
                >
                  <Ionicons name="arrow-undo-outline" size={22} color="white" />
                  <Text className="mt-1 text-xs font-medium text-white">Undo</Text>
                </Pressable>
              )
            : undefined
        }
      >
        <View className="mb-2.5 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4">
          <Pressable
            onPress={() =>
              isPending ? handleTapPendingItem(item) : void handleAdvanceItem(item)
            }
            className="flex-1 flex-row items-center active:opacity-70"
          >
            <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${circleClassName}`}>
              {isCompleted && <Ionicons name="checkmark" size={14} color="white" />}
              {isPending && <Ionicons name="time-outline" size={13} color="white" />}
            </View>
            <View className="ml-4 flex-1">
              <Text
                className={`text-base ${
                  isCompleted ? "text-slate-400 line-through" : "font-medium text-slate-900"
                }`}
              >
                {item.name}
              </Text>
              {isPending ? (
                <Text className="mt-0.5 text-xs text-amber-600">
                  {isLinkedToIngredient(item) ? "Tap to log to pantry" : "Tap for more info"}
                </Text>
              ) : (
                !isCompleted &&
                typeof item.ingredient === "object" &&
                item.ingredient && (
                  <Text className="mt-0.5 text-xs text-blue-500">
                    {item.ingredient.isGeneric ? "Generic ingredient" : "Linked ingredient"}
                  </Text>
                )
              )}
            </View>
            {(item.quantity != null || item.unit) && (
              <Text className="ml-2 text-sm text-slate-400">
                {item.quantity ?? ""} {item.unit ?? ""}
              </Text>
            )}
          </Pressable>
          {!isCompleted && (
            <Pressable
              hitSlop={10}
              onPress={() => openLinkModal(item)}
              className="ml-2 h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
            >
              <Ionicons
                name={isLinkedToIngredient(item) ? "link" : "link-outline"}
                size={18}
                color={isLinkedToIngredient(item) ? "#2563EB" : "#94A3B8"}
              />
            </Pressable>
          )}
        </View>
      </ReanimatedSwipeable>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-3 text-slate-500">Loading grocery list...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="border-b border-slate-200 bg-white px-4 py-3">
          <View className="flex-row items-center">
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={26} color="#0F172A" />
            </Pressable>
            <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Grocery List</Text>
            {viewMode === "shopping" && (
              <Pressable
                className="mr-2 h-11 w-11 items-center justify-center rounded-full bg-blue-50 active:bg-blue-100"
                onPress={() => setReceiptScannerVisible(true)}
              >
                <Ionicons name="camera-outline" size={20} color="#2563EB" />
              </Pressable>
            )}
          </View>
          <View className="mt-3">
            <SegmentedToggle<"list" | "shopping">
              value={viewMode}
              options={[
                { value: "list", label: "List" },
                { value: "shopping", label: "Shopping Mode" },
              ]}
              onChange={setViewMode}
            />
          </View>
        </View>

        {/* Add item row */}
        <View className="mx-5 mt-5 flex-row items-center gap-3">
          <View className="h-12 flex-1 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
            <TextInput
              value={nameInput}
              onChangeText={(value) => {
                setNameInput(value);
                if (selectedIngredientId) {
                  const selected = ingredients.find((i) => i._id === selectedIngredientId);
                  if (selected?.name !== value) setSelectedIngredientId("");
                }
              }}
              onSubmitEditing={() => void handleAddItem()}
              returnKeyType="done"
              placeholder="Search ingredients or add any item…"
              placeholderTextColor="#94A3B8"
              className="flex-1 text-base text-slate-900"
            />
            {nameInput.length > 0 && (
              <Pressable
                onPress={() => {
                  setNameInput("");
                  setSelectedIngredientId("");
                }}
              >
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </Pressable>
            )}
          </View>
          <Pressable
            disabled={adding}
            onPress={() => void handleAddItem()}
            className={`h-12 w-12 items-center justify-center rounded-2xl ${
              adding ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
            }`}
          >
            <Ionicons name="add" size={26} color="white" />
          </Pressable>
        </View>

        {/* Quantity + unit — optional, applies to the item about to be added */}
        <View className="mx-5 mt-3 flex-row items-center gap-3">
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="Qty"
            placeholderTextColor="#94A3B8"
            className="h-12 w-20 rounded-2xl border border-slate-200 bg-white px-3 text-center text-base text-slate-900"
          />
          <View className="flex-1">
            <CreatableStringDropdown
              options={unitDropdownOptions}
              selectedValue={unit}
              placeholder="Unit (optional)"
              onSelect={setUnit}
            />
          </View>
        </View>

        {/* Ingredient suggestions */}
        {grocerySuggestions.length > 0 && (
          <View className="mx-5 mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {grocerySuggestions.map((ing, idx) => {
              const categoryName = getReferenceName(ing.category);
              return (
                <Pressable
                  key={ing._id}
                  onPress={() => selectSuggestion(ing)}
                  className={`flex-row items-center px-4 py-3 active:bg-slate-50 ${
                    idx > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                    <Ionicons name="nutrition-outline" size={16} color="#2563EB" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-medium text-slate-900">{ing.name}</Text>
                    <Text className="text-xs text-slate-400">
                      {[ing.isGeneric ? "Generic" : null, categoryName || null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  {selectedIngredientId === ing._id && (
                    <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                  )}
                </Pressable>
              );
            })}
            {!grocerySuggestions.some(
              (i) => i.name.toLowerCase() === nameInput.trim().toLowerCase(),
            ) && (
              <Pressable
                onPress={() => void handleAddItem()}
                className="flex-row items-center border-t border-slate-100 px-4 py-3 active:bg-slate-50"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                  <Ionicons name="add" size={16} color="#475569" />
                </View>
                <Text className="ml-3 flex-1 font-medium text-slate-700">
                  Add &quot;{nameInput.trim()}&quot; as a one-off item
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {groceryItems.length === 0 ? (
            <View className="mt-8 items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
              <Ionicons name="cart-outline" size={42} color="#94A3B8" />
              <Text className="mt-4 text-lg font-bold text-slate-900">List is empty</Text>
              <Text className="mt-2 text-center text-slate-500">
                Add items above to start your grocery list.
              </Text>
            </View>
          ) : viewMode === "shopping" ? (
            storeGroups.length === 0 ? (
              <View className="mt-8 items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
                <Ionicons name="checkmark-circle-outline" size={42} color="#94A3B8" />
                <Text className="mt-4 text-lg font-bold text-slate-900">Nothing left to shop for</Text>
                <Text className="mt-2 text-center text-slate-500">
                  Everything&apos;s either logged or completed. Scan your receipts above to finish up.
                </Text>
              </View>
            ) : (
              <>
                {storeGroups.map((group) => (
                  <View key={group.storeId || "unknown"} className="mb-5">
                    <Text className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                      {group.storeName}{" "}
                      <Text className="font-semibold text-slate-300">· {group.items.length}</Text>
                    </Text>
                    {group.items.map(renderGroceryRow)}
                  </View>
                ))}
              </>
            )
          ) : (
            <>
              {toBuyItems.length > 0 && (
                <View className="mb-5">
                  <Text className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                    To buy <Text className="font-semibold text-slate-300">· {toBuyItems.length}</Text>
                  </Text>
                  {toBuyItems.map(renderGroceryRow)}
                </View>
              )}

              {pendingLogItems.length > 0 && (
                <View className="mb-5">
                  <Text className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                    Pending pantry log{" "}
                    <Text className="font-semibold text-slate-300">· {pendingLogItems.length}</Text>
                  </Text>
                  {pendingLogItems.map(renderGroceryRow)}
                </View>
              )}

              {completedItems.length > 0 && (
                <View className="mb-5">
                  <Text className="mb-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                    Completed <Text className="font-semibold text-slate-300">· {completedItems.length}</Text>
                  </Text>
                  {completedItems.map(renderGroceryRow)}

                  <Pressable
                    onPress={() => void handleClearCompleted()}
                    className="mt-2 items-center rounded-2xl bg-slate-100 py-3 active:bg-slate-200"
                  >
                    <Text className="text-sm font-semibold text-slate-500">
                      Clear completed items
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Log to pantry — small overlay card, not a full sheet */}
      <Modal visible={!!loggingItem} transparent animationType="fade" onRequestClose={closeLogModal}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-6">
            <Pressable className="absolute inset-0" onPress={closeLogModal} />

            <View className="w-full rounded-3xl bg-white p-5">
              <Text className="text-lg font-bold text-slate-950">{logTargetIngredientName}</Text>
              <Text className="mt-0.5 mb-4 text-sm text-slate-400">
                {logTargetIngredientName === loggingItem?.name
                  ? "Log to pantry"
                  : `Log to pantry — for "${loggingItem?.name}"`}
              </Text>

              <FieldLabel text="Storage location" required />
              <SearchableObjectDropdown<SelectOption>
                options={storageLocations}
                selectedId={logLocationId}
                selectedName={logLocationName}
                placeholder="Search or type a new location"
                onTextChange={(value) => {
                  if (value !== logLocationName) setLogLocationId("");
                  setLogLocationDraft(value);
                  setLogLocationTouched(true);
                }}
                onSelect={(option) => {
                  setLogLocationId(option._id);
                  setLogLocationName(option.name);
                  setLogLocationDraft(option.name);
                  setLogLocationTouched(true);
                }}
              />
              {effectiveLogLocation && !logLocationTouched ? (
                <Text className="mt-1.5 text-xs leading-4 text-slate-400">
                  Auto-filled from{" "}
                  {loggingFullIngredient?.defaultStorageLocation
                    ? "this ingredient's default"
                    : "recent purchase history"}
                  .
                </Text>
              ) : null}

              <View className="mt-3 flex-row">
                <View className="mr-3 flex-1">
                  <FieldLabel text="Purchase date" />
                  <DateTextInput
                    value={logPurchaseDate}
                    onChangeText={setLogPurchaseDate}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel text="Expiry date" />
                  <DateTextInput
                    value={logExpiryDate}
                    onChangeText={(value) => {
                      setLogExpiryDate(value);
                      setLogExpiryTouched(true);
                    }}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950"
                  />
                </View>
              </View>

              {effectiveLogExpiryDuration && !logExpiryTouched ? (
                <Text className="mt-1.5 text-xs leading-4 text-slate-400">
                  Expiry auto-filled from{" "}
                  {loggingFullIngredient?.defaultExpiryDurationAmount != null
                    ? "this ingredient's default"
                    : "recent purchase history"}{" "}
                  ({effectiveLogExpiryDuration.amount} {effectiveLogExpiryDuration.unit}
                  {effectiveLogExpiryDuration.amount > 1 ? "s" : ""}).
                </Text>
              ) : null}

              <View className="mt-2">
                <DurationExpiryInput
                  purchaseDate={logPurchaseDate}
                  initialAmount={
                    effectiveLogExpiryDuration ? String(effectiveLogExpiryDuration.amount) : undefined
                  }
                  initialUnit={effectiveLogExpiryDuration?.unit}
                  onApply={(value) => {
                    setLogExpiryDate(value);
                    setLogExpiryTouched(true);
                  }}
                />
              </View>

              <View className="mt-3 flex-row items-center gap-3">
                <TextInput
                  value={logQuantity}
                  onChangeText={setLogQuantity}
                  keyboardType="decimal-pad"
                  placeholder="Qty"
                  placeholderTextColor="#94A3B8"
                  className="h-12 w-20 rounded-2xl border border-slate-200 bg-white px-3 text-center text-base text-slate-900"
                />
                <View className="flex-1">
                  {loggingFullIngredient?.defaultPortionUnit ? (
                    <UnitFamilyDropdown
                      unit={logUnit || loggingFullIngredient.defaultPortionUnit}
                      options={logUnitOptions}
                      onSelect={(unit) => {
                        const converted = convertAmountForUnitChange(
                          Number(logQuantity),
                          logUnit,
                          unit,
                          getIngredientConversions(loggingFullIngredient, customUnitConversions),
                        );
                        if (converted != null) setLogQuantity(String(converted));
                        setLogUnit(unit);
                      }}
                    />
                  ) : (
                    <CreatableStringDropdown
                      options={logUnitOptions}
                      selectedValue={logUnit}
                      placeholder="Unit"
                      onSelect={(unit) => {
                        const converted = convertAmountForUnitChange(
                          Number(logQuantity),
                          logUnit,
                          unit,
                          getIngredientConversions(loggingFullIngredient, customUnitConversions),
                        );
                        if (converted != null) setLogQuantity(String(converted));
                        setLogUnit(unit);
                      }}
                    />
                  )}
                </View>
              </View>

              <View className="mt-3">
                <Text className="mb-1.5 text-xs font-semibold text-slate-500">Number of entries</Text>
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() =>
                      setLogEntryCount((current) => String(Math.max(1, (Number(current) || 1) - 1)))
                    }
                    className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white active:bg-slate-50"
                  >
                    <Ionicons name="remove" size={18} color="#475569" />
                  </Pressable>
                  <TextInput
                    value={logEntryCount}
                    onChangeText={setLogEntryCount}
                    keyboardType="number-pad"
                    className="mx-2 h-11 w-16 rounded-2xl border border-slate-200 bg-white text-center text-base text-slate-900"
                  />
                  <Pressable
                    onPress={() =>
                      setLogEntryCount((current) => String((Number(current) || 1) + 1))
                    }
                    className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white active:bg-slate-50"
                  >
                    <Ionicons name="add" size={18} color="#475569" />
                  </Pressable>
                </View>
                {Math.max(1, Math.round(Number(logEntryCount)) || 1) > 1 && (
                  <Text className="mt-1.5 text-xs text-slate-400">
                    Creates {Math.max(1, Math.round(Number(logEntryCount)) || 1)} separate pantry
                    entries of {logQuantity || "0"} {logUnit} each.
                  </Text>
                )}
              </View>

              {logShowMoreDetails || logStoreId || logStoreDraft.trim() || logPrice.trim() ? (
                <>
                  <Text className="mb-1.5 mt-3 text-xs font-semibold text-slate-500">
                    Store (optional)
                  </Text>
                  <SearchableObjectDropdown<SelectOption>
                    options={stores}
                    selectedId={logStoreId}
                    selectedName={logStoreName}
                    placeholder="Search or type a new store"
                    onTextChange={(value) => {
                      if (value !== logStoreName) setLogStoreId("");
                      setLogStoreDraft(value);
                      setLogStoreTouched(true);
                    }}
                    onSelect={(option) => {
                      setLogStoreId(option._id);
                      setLogStoreName(option.name);
                      setLogStoreDraft(option.name);
                      setLogStoreTouched(true);
                    }}
                  />
                  {suggestedLogStore && !logStoreTouched ? (
                    <Text className="mt-1.5 text-xs leading-4 text-slate-400">
                      Auto-filled from recent purchase history.
                    </Text>
                  ) : null}

                  <Text className="mb-1.5 mt-3 text-xs font-semibold text-slate-500">
                    Price paid (optional)
                  </Text>
                  <PriceInput value={logPrice} onChangeText={setLogPrice} />
                </>
              ) : (
                <Pressable
                  className="mt-3 flex-row items-center self-start active:opacity-60"
                  onPress={() => setLogShowMoreDetails(true)}
                >
                  <Ionicons name="add-circle-outline" size={16} color="#2563EB" />
                  <Text className="ml-1.5 text-sm font-semibold text-blue-600">
                    Add store or price
                  </Text>
                </Pressable>
              )}

              <Text className="mb-1.5 mt-3 text-xs font-semibold text-slate-500">
                Notes (optional)
              </Text>
              <TextInput
                value={logNotes}
                onChangeText={setLogNotes}
                placeholder="e.g. Half-used, keep away from the window"
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
                className="min-h-20 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950"
              />

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  disabled={logSaving}
                  onPress={closeLogModal}
                  className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
                >
                  <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={logSaving}
                  onPress={() => void handleCreatePantryEntry()}
                  className={`flex-1 items-center rounded-2xl py-3.5 ${
                    logSaving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
                  }`}
                >
                  <Text className="text-sm font-semibold text-white">
                    {logSaving ? "Adding..." : "Add"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Link/relink to a catalog ingredient — the recovery path for any
          non-completed item, whether it started unlinked or just needs a
          different match. */}
      <Modal visible={!!linkingItem} transparent animationType="fade" onRequestClose={closeLinkModal}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-6">
            <Pressable className="absolute inset-0" onPress={closeLinkModal} />

            <View className="max-h-[80%] w-full rounded-3xl bg-white p-5">
              <Text className="text-lg font-bold text-slate-950">Link ingredient</Text>
              <Text className="mt-0.5 mb-4 text-sm text-slate-400">
                Match &quot;{linkingItem?.name}&quot; to a catalog ingredient so it can be logged to
                your pantry.
              </Text>

              <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  value={linkQuery}
                  onChangeText={setLinkQuery}
                  placeholder="Search ingredients…"
                  placeholderTextColor="#94A3B8"
                  className="ml-3 flex-1 text-base text-slate-900"
                  autoFocus
                />
              </View>

              <ScrollView
                className="mt-3"
                style={{ maxHeight: 320 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {linkModalOptions.map((ing) => (
                  <Pressable
                    key={ing._id}
                    onPress={() => void handleLinkIngredient(ing._id)}
                    className="flex-row items-center border-b border-slate-100 px-1 py-3 active:bg-slate-50"
                  >
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                      <Ionicons name="nutrition-outline" size={16} color="#2563EB" />
                    </View>
                    <Text className="ml-3 flex-1 font-medium text-slate-900">{ing.name}</Text>
                    {linkingItemIngredientId === ing._id && (
                      <Ionicons name="checkmark-circle" size={18} color="#2563EB" />
                    )}
                  </Pressable>
                ))}
                {linkModalOptions.length === 0 && (
                  <Text className="py-6 text-center text-sm text-slate-400">No matches</Text>
                )}
              </ScrollView>

              <View className="mt-4 flex-row gap-3">
                {linkingItemIngredientId ? (
                  <Pressable
                    onPress={() => void handleUnlinkIngredient()}
                    className="flex-1 items-center rounded-2xl bg-red-50 py-3.5 active:bg-red-100"
                  >
                    <Text className="text-sm font-semibold text-red-600">Unlink</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={closeLinkModal}
                  className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
                >
                  <Text className="text-sm font-semibold text-slate-600">Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Resolve a generic-linked item — could be logged directly, against
          an existing variant, or resolved by adding/choosing a specific
          product. Always asked, never auto-picked. */}
      <Modal
        visible={!!resolvingGenericItem}
        transparent
        animationType="fade"
        onRequestClose={() => setResolvingGenericItem(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <Pressable
            className="absolute inset-0"
            onPress={() => setResolvingGenericItem(null)}
          />

          <View className="w-full rounded-3xl bg-white p-5">
            <Text className="text-lg font-bold text-slate-950">
              {resolvingGenericItem?.item.name}
            </Text>
            <Text className="mt-0.5 mb-4 text-sm text-slate-400">
              Linked to the generic ingredient &quot;{resolvingGenericItem?.generic.name}&quot;
            </Text>

            <Pressable
              className="mb-2 flex-row items-center rounded-2xl border border-slate-200 px-4 py-3.5 active:bg-slate-50"
              onPress={() => {
                if (!resolvingGenericItem) return;
                const { item, generic } = resolvingGenericItem;
                setResolvingGenericItem(null);
                openLogModal(item, generic._id, generic.name);
              }}
            >
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                <Ionicons name="pricetag-outline" size={16} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-slate-900">
                  Log &quot;{resolvingGenericItem?.generic.name}&quot; directly
                </Text>
                <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                  No specific brand — logs straight to the generic.
                </Text>
              </View>
            </Pressable>

            {resolvingGenericItem?.variants.length === 1 && (
              <Pressable
                className="mb-2 flex-row items-center rounded-2xl border border-slate-200 px-4 py-3.5 active:bg-slate-50"
                onPress={() => {
                  if (!resolvingGenericItem) return;
                  const { item, variants } = resolvingGenericItem;
                  const existing = variants[0];
                  setResolvingGenericItem(null);
                  openLogModal(item, existing._id, existing.name);
                }}
              >
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
                  <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-slate-900">
                    Log &quot;{resolvingGenericItem.variants[0].name}&quot;
                  </Text>
                  <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                    The specific product you already have cataloged.
                  </Text>
                </View>
              </Pressable>
            )}

            <Pressable
              className="mb-2 flex-row items-center rounded-2xl border border-slate-200 px-4 py-3.5 active:bg-slate-50"
              onPress={() => {
                if (!resolvingGenericItem) return;
                const { item, generic } = resolvingGenericItem;
                setResolvingGenericItem(null);
                router.push({
                  pathname: "/ingredients/add_manual",
                  params: {
                    groceryItemId: item._id,
                    prefillName: item.name,
                    genericParentId: generic._id,
                    genericParentName: generic.name,
                  },
                });
              }}
            >
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-violet-50">
                <Ionicons name="add-circle-outline" size={16} color="#7C3AED" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-slate-900">
                  {resolvingGenericItem && resolvingGenericItem.variants.length > 0
                    ? "Choose or add a specific product"
                    : "Add a specific product"}
                </Text>
                <Text className="mt-0.5 text-xs leading-4 text-slate-500">
                  {resolvingGenericItem && resolvingGenericItem.variants.length > 1
                    ? `Search ${resolvingGenericItem.variants.length} existing products, or create a new one.`
                    : "Create a new branded ingredient under this generic."}
                </Text>
              </View>
            </Pressable>

            <Pressable
              className="mt-1 items-center rounded-2xl bg-slate-100 py-3"
              onPress={() => setResolvingGenericItem(null)}
            >
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ReceiptScannerModal
        visible={receiptScannerVisible}
        onClose={() => setReceiptScannerVisible(false)}
        onCaptured={(photoUri) => {
          setReceiptScannerVisible(false);
          setParsingReceipt(true);

          parseReceipt(photoUri)
            .then((result) => {
              // A fresh scan supersedes any unfinished review still saved on
              // disk — otherwise the review screen would ignore this new
              // result and resume the stale draft instead.
              void clearReviewDraft();
              setPendingReceipt(result);
              router.push("/receipts/review");
            })
            .catch((error) => {
              Alert.alert(
                "Couldn't read receipt",
                error instanceof Error ? error.message : "Something went wrong parsing the receipt.",
              );
            })
            .finally(() => setParsingReceipt(false));
        }}
      />

      <Modal visible={parsingReceipt} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50">
          <View className="items-center rounded-3xl bg-white px-8 py-6">
            <ActivityIndicator size="large" />
            <Text className="mt-3 text-base font-semibold text-slate-700">
              Reading receipt...
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
