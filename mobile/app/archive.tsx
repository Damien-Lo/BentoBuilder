import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

export default function ArchiveScreen() {
  const router = useRouter();
  const [activeKind, setActiveKind] = useState<ArchiveKind>("ingredients");
  const [itemsByKind, setItemsByKind] = useState<Partial<Record<ArchiveKind, ArchiveItem[]>>>({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Archive</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
        className="border-b border-slate-200 bg-white"
      >
        {KIND_ORDER.map((kind) => {
          const isActive = kind === activeKind;
          const count = itemsByKind[kind]?.length ?? 0;
          return (
            <Pressable
              key={kind}
              className={`rounded-full px-4 py-2 ${isActive ? "bg-blue-600" : "bg-slate-100"}`}
              onPress={() => setActiveKind(kind)}
            >
              <Text className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-600"}`}>
                {ARCHIVE_CONFIG[kind].label}
                {!loading ? ` · ${count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="px-5 pt-4">
        <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
          <Ionicons name="search-outline" size={19} color="#64748B" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={`Search archived ${config.label.toLowerCase()}`}
            placeholderTextColor="#94A3B8"
            className="ml-3 flex-1 text-base text-slate-950"
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View className="items-center rounded-2xl border border-slate-200 bg-white px-6 py-16">
              <Ionicons name="archive-outline" size={38} color="#94A3B8" />
              <Text className="mt-3 text-center text-slate-500">
                {searchText ? "No matches." : `No archived ${config.label.toLowerCase()}.`}
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {items.map((item, index) => {
                const isBusy = busyId === item._id;
                return (
                  <View
                    key={item._id}
                    className={`flex-row items-center px-4 py-3.5 ${
                      index < items.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                  >
                    <Text className="flex-1 text-base text-slate-900" numberOfLines={1}>
                      {item.name}
                    </Text>
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
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
