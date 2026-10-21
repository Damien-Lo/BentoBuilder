import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deleteIngredientPermanently,
  getArchivedIngredients,
  restoreIngredient,
} from "@/src/services/ingredientApi";
import {
  deleteRecipePermanently,
  getArchivedRecipes,
  restoreRecipe,
} from "@/src/services/recipeApi";
import {
  deleteMealPermanently,
  getArchivedMeals,
  restoreMeal,
} from "@/src/services/mealApi";
import {
  deleteRestaurantMealPermanently,
  getArchivedRestaurantMeals,
  restoreRestaurantMeal,
} from "@/src/services/restaurantMealApi";
import { useWideForm } from "@/src/components/forms/wideForm";
import { dangerSoft, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

type ArchiveKind = "ingredients" | "recipes" | "meals" | "restaurantMeals";

type ArchiveItem = { _id: string; name: string; subtitle?: string };

interface ArchiveConfig {
  label: string;
  singular: string;
  get: () => Promise<ArchiveItem[]>;
  restore: (id: string) => Promise<unknown>;
  removePermanently: (id: string) => Promise<void>;
}

const ARCHIVE_CONFIG: Record<ArchiveKind, ArchiveConfig> = {
  ingredients: {
    label: "Ingredients",
    singular: "ingredient",
    get: async () => {
      const items = await getArchivedIngredients();
      return items.map((i) => ({ _id: i._id, name: i.name }));
    },
    restore: restoreIngredient,
    removePermanently: deleteIngredientPermanently,
  },
  recipes: {
    label: "Recipes",
    singular: "recipe",
    get: async () => {
      const items = await getArchivedRecipes();
      return items.map((r) => ({ _id: r._id, name: r.name }));
    },
    restore: restoreRecipe,
    removePermanently: deleteRecipePermanently,
  },
  meals: {
    label: "Meals",
    singular: "meal",
    get: async () => {
      const items = await getArchivedMeals();
      return items.map((m) => ({ _id: m._id, name: m.name }));
    },
    restore: restoreMeal,
    removePermanently: deleteMealPermanently,
  },
  restaurantMeals: {
    label: "Eating Out",
    singular: "restaurant meal",
    get: async () => {
      const items = await getArchivedRestaurantMeals();
      return items.map((r) => ({ _id: r._id, name: r.restaurantName }));
    },
    restore: restoreRestaurantMeal,
    removePermanently: deleteRestaurantMealPermanently,
  },
};

const KIND_ORDER: ArchiveKind[] = ["ingredients", "recipes", "meals", "restaurantMeals"];

// The Kitchen's archive (from Settings → Kitchen): archived ingredients,
// recipes, meals and eating-out visits — restored or deleted for good here.
// On the phone in the Kitchen's Orbit look, light or dark (`o`: its
// colours); a desktop browser keeps the older look.
export default function ArchiveScreen() {
  return (
    <OrbitSection section="kitchen">
      <ArchivePage />
    </OrbitSection>
  );
}

function ArchivePage() {
  const back = useGoBack("/settings-section/kitchen");
  const [activeKind, setActiveKind] = useState<ArchiveKind>("ingredients");
  const [itemsByKind, setItemsByKind] = useState<Partial<Record<ArchiveKind, ArchiveItem[]>>>({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const layout = useWideForm();
  const { colors, dark } = useOrbitTheme();
  const o = layout.wide ? null : colors;
  const card = o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  // (Restoring, in a soft green.)
  const restoreBg = dark ? "rgba(52,211,153,0.14)" : "#ECFDF5";

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        const entries = await Promise.all(
          KIND_ORDER.map(async (kind) => [kind, await ARCHIVE_CONFIG[kind].get()] as const),
        );
        if (!cancelled) {
          setItemsByKind(Object.fromEntries(entries) as Record<ArchiveKind, ArchiveItem[]>);
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert("Couldn't load archive", err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, []);

  const config = ARCHIVE_CONFIG[activeKind];

  const items = useMemo(() => {
    const list = itemsByKind[activeKind] ?? [];
    const query = searchText.trim().toLowerCase();
    const filtered = query ? list.filter((i) => i.name.toLowerCase().includes(query)) : list;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [itemsByKind, activeKind, searchText]);

  // In a desktop browser the list reads down two columns; on a phone, one.
  const half = Math.ceil(items.length / 2);
  const itemColumns = layout.wide && items.length > 1 ? [items.slice(0, half), items.slice(half)] : [items];

  function updateKindItems(kind: ArchiveKind, updater: (current: ArchiveItem[]) => ArchiveItem[]) {
    setItemsByKind((prev) => ({ ...prev, [kind]: updater(prev[kind] ?? []) }));
  }

  async function handleRestore(item: ArchiveItem) {
    setBusyId(item._id);
    try {
      await config.restore(item._id);
      updateKindItems(activeKind, (current) => current.filter((i) => i._id !== item._id));
    } catch (err) {
      Alert.alert("Couldn't restore", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  function handleDeletePermanently(item: ArchiveItem) {
    Alert.alert(
      `Delete "${item.name}" permanently?`,
      "This can't be undone — it won't be recoverable from the archive anymore.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            setBusyId(item._id);
            try {
              await config.removePermanently(item._id);
              updateKindItems(activeKind, (current) => current.filter((i) => i._id !== item._id));
            } catch (err) {
              Alert.alert("Couldn't delete", err instanceof Error ? err.message : "Something went wrong.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <OrbitPage on={!layout.wide}>
    <SafeAreaView className="flex-1 bg-slate-50" style={[layout.page, o && { backgroundColor: o.canvas }]} edges={["top", "left", "right"]}>
      {o ? (
        <PageHeader title="Archive" subtitle="Restore what you archived, or delete it for good" onBack={back} style={{ paddingHorizontal: 16, paddingTop: 4 }} />
      ) : (
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={back}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Archive</Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
        className="border-b border-slate-200 bg-white"
        // (On the web a sideways scroller grows to fill the page unless told not to.)
        style={[{ flexGrow: 0 }, o && { backgroundColor: "transparent", borderBottomWidth: 0, marginTop: 4 }]}
      >
        {KIND_ORDER.map((kind) => {
          const isActive = kind === activeKind;
          const count = itemsByKind[kind]?.length ?? 0;
          return (
            <Pressable
              key={kind}
              className={`rounded-full px-4 py-2 ${isActive ? "bg-blue-600" : "bg-slate-100"}`}
              style={o && { backgroundColor: isActive ? o.ink : o.pill }}
              onPress={() => setActiveKind(kind)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-600"}`} style={o && { color: isActive ? o.onInk : o.onPill }}>
                {ARCHIVE_CONFIG[kind].label}
                {!loading ? ` · ${count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="px-5 pt-4" style={o && { paddingHorizontal: 16, paddingTop: 4 }}>
        <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4" style={o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 16 }}>
          <Ionicons name="search-outline" size={19} color={o?.muted ?? "#64748B"} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search archived ${config.label.toLowerCase()}`}
            placeholderTextColor={o?.faint ?? "#94A3B8"}
            className="ml-3 flex-1 text-base text-slate-950"
            style={o && { color: o.text }}
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={o?.fill ?? "#2563EB"} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }, o && { paddingHorizontal: 16 }]}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16" style={card}>
              <Ionicons name="archive-outline" size={38} color={o?.faint ?? "#94A3B8"} />
              <Text className="mt-3 text-center text-slate-500" style={o && { color: o.muted }}>
                {searchText ? "No matches." : `No archived ${config.label.toLowerCase()}.`}
              </Text>
            </View>
          ) : (
            <View style={layout.columns}>
            {itemColumns.map((columnItems, columnIndex) => (
            <View key={columnIndex} style={layout.column}>
            <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
              {columnItems.map((item, index) => {
                const isBusy = busyId === item._id;
                return (
                  <View
                    key={item._id}
                    className={`flex-row items-center px-4 py-3.5 ${
                      index < columnItems.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                    style={o && { borderBottomColor: o.border }}
                  >
                    <Text className="flex-1 text-base text-slate-900" style={o && { color: o.text }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {o ? (
                      <>
                        <Tap
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Restore ${item.name}`}
                          style={{ marginRight: 4, flexDirection: "row", alignItems: "center", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: restoreBg, opacity: isBusy ? 0.5 : 1 }}
                          pressedStyle={{ opacity: 0.7 }}
                          onPress={() => void handleRestore(item)}
                        >
                          <Ionicons name="arrow-undo-outline" size={15} color={o.success} />
                          <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "600", color: o.success }}>Restore</Text>
                        </Tap>
                        <Tap
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${item.name} for good`}
                          style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}
                          pressedStyle={{ backgroundColor: dangerSoft(dark) }}
                          onPress={() => handleDeletePermanently(item)}
                        >
                          <Ionicons name="trash-outline" size={18} color={o.danger} />
                        </Tap>
                      </>
                    ) : (
                    <>
                    <Pressable
                      disabled={isBusy}
                      className="mr-1 flex-row items-center rounded-full bg-emerald-50 px-3 py-1.5 active:bg-emerald-100"
                      onPress={() => void handleRestore(item)}
                    >
                      <Ionicons name="arrow-undo-outline" size={15} color="#059669" />
                      <Text className="ml-1 text-xs font-semibold text-emerald-700">Restore</Text>
                    </Pressable>
                    <Pressable
                      disabled={isBusy}
                      className="h-9 w-9 items-center justify-center rounded-full active:bg-red-50"
                      onPress={() => handleDeletePermanently(item)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </Pressable>
                    </>
                    )}
                  </View>
                );
              })}
            </View>
            </View>
            ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
    </OrbitPage>
  );
}
