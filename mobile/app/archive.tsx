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
import { useWideForm } from "@/src/components/forms/wideForm";
import { dangerSoft, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

// (Not restaurants: they're shared by everyone now, and taking one off one's
// own list is all that's done to it — see app/restaurants.)
type ArchiveKind = "ingredients" | "recipes" | "meals";

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
};

const KIND_ORDER: ArchiveKind[] = ["ingredients", "recipes", "meals"];

// The Kitchen's archive (from Settings → Kitchen): archived ingredients,
// recipes and meals — restored or deleted for good here.
// In the Kitchen's Orbit look, light or dark (`o`: its colours) — in a
// desktop browser too, the list down two columns.
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
  const { colors: o, dark } = useOrbitTheme();
  // (A desktop browser's page sits back from the edges a little more.)
  const gutter = layout.wide ? 24 : 16;
  const card = { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
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
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" style={{ backgroundColor: o.canvas }} edges={["top", "left", "right"]}>
    {/* (In a desktop browser, a column down the middle of the canvas.) */}
    <View style={[{ flex: 1 }, layout.page]}>
      <PageHeader title="Archive" subtitle="Restore what you archived, or delete it for good" onBack={back} style={{ paddingHorizontal: gutter, paddingTop: layout.wide ? 16 : 4 }} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: 12, gap: 8 }}
        className="border-b border-slate-200 bg-white"
        // (On the web a sideways scroller grows to fill the page unless told not to.)
        style={{ flexGrow: 0, backgroundColor: "transparent", borderBottomWidth: 0, marginTop: 4 }}
      >
        {KIND_ORDER.map((kind) => {
          const isActive = kind === activeKind;
          const count = itemsByKind[kind]?.length ?? 0;
          return (
            <Pressable
              key={kind}
              className={`rounded-full px-4 py-2 ${isActive ? "bg-blue-600" : "bg-slate-100"}`}
              style={{ backgroundColor: isActive ? o.ink : o.pill }}
              onPress={() => setActiveKind(kind)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-600"}`} style={{ color: isActive ? o.onInk : o.onPill }}>
                {ARCHIVE_CONFIG[kind].label}
                {!loading ? ` · ${count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="px-5 pt-4" style={{ paddingHorizontal: gutter, paddingTop: 4 }}>
        <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4" style={[{ backgroundColor: o.surface, borderColor: o.border, borderRadius: 16 }, layout.wide && { maxWidth: 420 }]}>
          <Ionicons name="search-outline" size={19} color={o.muted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search archived ${config.label.toLowerCase()}`}
            placeholderTextColor={o.faint}
            className="ml-3 flex-1 text-base text-slate-950"
            style={{ color: o.text }}
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={o.fill} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16" style={card}>
              <Ionicons name="archive-outline" size={38} color={o.faint} />
              <Text className="mt-3 text-center text-slate-500" style={{ color: o.muted }}>
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
                    style={{ borderBottomColor: o.border }}
                  >
                    <Text className="flex-1 text-base text-slate-900" style={{ color: o.text }} numberOfLines={1}>
                      {item.name}
                    </Text>
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
    </View>
    </SafeAreaView>
    </OrbitPage>
  );
}
