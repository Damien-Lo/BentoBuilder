import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  deletePantryItem,
  getPantryItems,
  updatePantryItem,
} from "@/src/services/pantryApi";
import { getStorageLocations, type SelectOption } from "@/src/services/optionsApi";
import { PantryItemCard } from "@/src/components/pantry/PantryItemCard";
import { SplitPantryItemModal } from "@/src/components/pantry/SplitPantryItemModal";
import type { PantryItem } from "@/src/types/pantry";
import { daysUntil, formatDateDisplay } from "@/src/utils/date";
import { useWideForm } from "@/src/components/forms/wideForm";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

function getIngredientName(item: PantryItem): string {
  const ing = item.ingredient as unknown;
  if (typeof ing === "object" && ing !== null && "name" in ing) {
    return String((ing as Record<string, unknown>).name ?? "Unknown ingredient");
  }
  return "Unknown ingredient";
}

function getStoreName(store: PantryItem["store"]): string | null {
  if (!store) return null;
  if (typeof store === "string") return null;
  return store.name;
}

function itemMatchesLocation(item: PantryItem, locationId: string): boolean {
  const loc = item.storageLocation as unknown;
  if (typeof loc === "string") return loc === locationId;
  if (typeof loc === "object" && loc !== null && "_id" in loc) {
    return String((loc as Record<string, unknown>)._id) === locationId;
  }
  return false;
}

function formatExpiryDate(date: string | null): string | null {
  return formatDateDisplay(date, { day: "numeric", month: "short", year: "numeric" }, "en-AU");
}

function isExpired(date: string | null): boolean {
  const days = daysUntil(date);
  return days != null && days < 0;
}

function isExpiringSoon(date: string | null): boolean {
  const days = daysUntil(date);
  return days != null && days >= 0 && days < 7;
}

export default function LocationDetailScreen() {
  return (
    <OrbitSection section="kitchen">
      <LocationDetail />
    </OrbitSection>
  );
}

function LocationDetail() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const [items, setItems] = useState<PantryItem[]>([]);
  const [storageLocations, setStorageLocations] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [splittingItem, setSplittingItem] = useState<PantryItem | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const layout = useWideForm();
  // On a phone, in Orbit's look, light or dark (`o`: its colours); a
  // desktop browser keeps the desktop's for now. The item cards and the
  // split sheet follow by themselves (OrbitPage).
  const { colors, dark } = useOrbitTheme();
  const o = layout.wide ? null : colors;
  // Soft tints behind a badge, in either theme.
  const tint = (light: string, darkTint: string) => (dark ? darkTint : light);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setIsLoading(true);
        try {
          const [all, loadedLocations] = await Promise.all([
            getPantryItems(),
            getStorageLocations(),
          ]);
          if (!cancelled) {
            setItems(
              (Array.isArray(all) ? all : []).filter((item) =>
                itemMatchesLocation(item, id),
              ),
            );
            setStorageLocations(Array.isArray(loadedLocations) ? loadedLocations : []);
          }
        } catch (err) {
          if (!cancelled) {
            Alert.alert(
              "Error",
              err instanceof Error ? err.message : "Could not load pantry items.",
            );
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      }

      void load();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const handleDelete = (itemId: string, ingredientName: string) => {
    Alert.alert(
      "Remove from pantry",
      `Remove "${ingredientName}" from your pantry?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void deletePantryItem(itemId)
              .then(() =>
                setItems((prev) => prev.filter((i) => i._id !== itemId)),
              )
              .catch((err: unknown) => {
                Alert.alert(
                  "Error",
                  err instanceof Error ? err.message : "Could not remove item.",
                );
              });
          },
        },
      ],
    );
  };

  async function handleQuantityDelta(item: PantryItem, delta: number) {
    const nextQuantity = Math.max(0, Number(item.quantityAvailable ?? 0) + delta);
    if (nextQuantity === item.quantityAvailable) return;

    setBusyItemId(item._id);
    try {
      const updated = await updatePantryItem(item._id, { quantityAvailable: nextQuantity });
      setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not update the pantry entry.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  function handleSplitComplete(updatedOriginal: PantryItem, newEntry: PantryItem | null) {
    setItems((prev) => {
      const withoutOriginal = prev.filter((i) => i._id !== updatedOriginal._id);
      const withOriginal = itemMatchesLocation(updatedOriginal, id)
        ? [...withoutOriginal, updatedOriginal]
        : withoutOriginal;
      return newEntry && itemMatchesLocation(newEntry, id)
        ? [...withOriginal, newEntry]
        : withOriginal;
    });
  }

  return (
    <OrbitPage on={!!o}>
    <SafeAreaView className="flex-1 bg-slate-50" style={[layout.page, o && { backgroundColor: o.canvas }]} edges={o ? ["top", "left", "right"] : undefined}>
      {/* Header (phone): the way back and the add button over a large
          title, on the page itself */}
      {o ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
            <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
              <Ionicons name="chevron-back" size={22} color={o.text} />
            </Tap>
            <View style={{ flex: 1 }} />
            <Tap
              onPress={() =>
                router.push({
                  pathname: "/pantry/add_by_ingredient",
                  params: { locationId: id, locationName: name },
                })
              }
              accessibilityLabel="Add an item"
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.ink }}
              pressedStyle={{ opacity: 0.8 }}
            >
              <Ionicons name="add" size={24} color={o.onInk} />
            </Tap>
          </View>
          <Text numberOfLines={1} style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>
            {name ?? "Location"}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: o.muted }}>
            {items.length} {items.length === 1 ? "item" : "items"}
          </Text>
        </View>
      ) : (
        // Nav bar
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>

          <View className="ml-2 flex-1">
            <Text className="text-xl font-bold text-slate-950" numberOfLines={1}>
              {name ?? "Location"}
            </Text>
            <Text className="text-sm text-slate-500">
              {items.length} {items.length === 1 ? "item" : "items"}
            </Text>
          </View>

          <Pressable
            className="h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 active:bg-blue-700"
            onPress={() =>
              router.push({
                pathname: "/pantry/add_by_ingredient",
                params: { locationId: id, locationName: name },
              })
            }
          >
            <Ionicons name="add" size={26} color="white" />
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={o?.muted ?? "#2563EB"} />
          <Text className="mt-3 text-slate-500" style={o && { color: o.muted }}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          // (In a desktop browser: a grid of cards, two across.)
          key={layout.wide ? "grid" : "list"}
          numColumns={layout.wide ? 2 : 1}
          columnWrapperStyle={layout.wide ? { gap: 12, alignItems: "flex-start" } : undefined}
          data={items}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: o ? 16 : 20,
            paddingTop: o ? 16 : 20,
            paddingBottom: 60,
          }}
          ListEmptyComponent={
            <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16" style={o && { backgroundColor: "transparent", borderColor: o.border, borderStyle: "dashed", borderRadius: 18, paddingVertical: 40 }}>
              <Ionicons
                name="file-tray-stacked-outline"
                size={42}
                color={o?.faint ?? "#94A3B8"}
              />
              <Text className="mt-4 text-lg font-bold text-slate-900" style={o && { color: o.text }}>
                Nothing here yet
              </Text>
              <Text className="mt-2 text-center text-slate-500" style={o && { color: o.muted }}>
                Tap + to add your first item to {name ?? "this location"}.
              </Text>
              {o ? (
                <Tap
                  onPress={() =>
                    router.push({
                      pathname: "/pantry/add_by_ingredient",
                      params: { locationId: id, locationName: name },
                    })
                  }
                  style={{ marginTop: 24, height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, borderRadius: 16, backgroundColor: o.ink }}
                  pressedStyle={{ opacity: 0.85 }}
                >
                  <Ionicons name="add" size={20} color={o.onInk} />
                  <Text style={{ marginLeft: 4, fontSize: 15, fontWeight: "600", color: o.onInk }}>Add item</Text>
                </Tap>
              ) : (
                <Pressable
                  className="mt-6 flex-row items-center rounded-2xl bg-blue-600 px-5 py-3 active:bg-blue-700"
                  onPress={() =>
                    router.push({
                      pathname: "/pantry/add_by_ingredient",
                      params: { locationId: id, locationName: name },
                    })
                  }
                >
                  <Ionicons name="add" size={20} color="white" />
                  <Text className="ml-1 font-semibold text-white">Add item</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            // (An odd one out at the end keeps to its own half of the grid.)
            const alone = layout.wide && index === items.length - 1 && items.length % 2 === 1;

            const ingredientName = getIngredientName(item);
            const expiryStr = formatExpiryDate(item.expiryDate);
            const expired = isExpired(item.expiryDate);
            const expiringSoon = !expired && isExpiringSoon(item.expiryDate);

            return (
              <View style={alone ? [layout.column, { maxWidth: "50%", paddingRight: 6 }] : layout.column}>
              <PantryItemCard
                pantryItemId={item._id}
                ingredientName={ingredientName}
                quantityAvailable={item.quantityAvailable}
                quantityUnit={item.quantityUnit}
                storageLocationName={name}
                purchaseDate={item.purchaseDate}
                expiryDate={item.expiryDate}
                purchasePrice={item.purchasePrice}
                storeName={getStoreName(item.store)}
                notes={item.notes}
                busy={busyItemId === item._id}
                rightBadge={
                  expiryStr ? (
                    <View
                      className={`mr-2 rounded-full px-3 py-1 ${
                        expired
                          ? "bg-red-100"
                          : expiringSoon
                            ? "bg-amber-100"
                            : "bg-slate-100"
                      }`}
                      style={o && { backgroundColor: expired ? tint("#FEE2E2", "rgba(248,113,113,0.16)") : expiringSoon ? tint("#FEF3C7", "rgba(251,191,36,0.16)") : o.pill }}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          expired
                            ? "text-red-600"
                            : expiringSoon
                              ? "text-amber-600"
                              : "text-slate-500"
                        }`}
                        style={o && { color: expired ? o.danger : expiringSoon ? o.warning : o.muted }}
                      >
                        {expired ? "Expired " : "Exp "}
                        {expiryStr}
                      </Text>
                    </View>
                  ) : undefined
                }
                onEdit={() =>
                  router.push({
                    pathname: "/pantry/edit/[id]",
                    params: { id: item._id },
                  })
                }
                onDelete={() => handleDelete(item._id, ingredientName)}
                onSubtract={() => void handleQuantityDelta(item, -1)}
                onAdd={() => void handleQuantityDelta(item, 1)}
                onSplit={() => setSplittingItem(item)}
              />
              </View>
            );
          }}
        />
      )}

      <SplitPantryItemModal
        visible={!!splittingItem}
        item={splittingItem}
        ingredientName={splittingItem ? getIngredientName(splittingItem) : ""}
        storageLocations={storageLocations}
        onClose={() => setSplittingItem(null)}
        onSplit={handleSplitComplete}
      />
    </SafeAreaView>
    </OrbitPage>
  );
}
