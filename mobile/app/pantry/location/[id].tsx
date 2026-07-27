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
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { deletePantryItem, getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { daysUntil, formatDateDisplay } from "@/src/utils/date";

function getIngredientName(item: PantryItem): string {
  const ing = item.ingredient as unknown;
  if (typeof ing === "object" && ing !== null && "name" in ing) {
    return String((ing as Record<string, unknown>).name ?? "Unknown ingredient");
  }
  return "Unknown ingredient";
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
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const [items, setItems] = useState<PantryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setIsLoading(true);
        try {
          const all = await getPantryItems();
          if (!cancelled) {
            setItems(
              (Array.isArray(all) ? all : []).filter((item) =>
                itemMatchesLocation(item, id),
              ),
            );
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

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      {/* Nav bar */}
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

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
          <Text className="mt-3 text-slate-500">Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 60,
          }}
          ListEmptyComponent={
            <View className="items-center rounded-3xl bg-white px-6 py-16 shadow-sm">
              <Ionicons
                name="file-tray-stacked-outline"
                size={42}
                color="#94A3B8"
              />
              <Text className="mt-4 text-lg font-bold text-slate-900">
                Nothing here yet
              </Text>
              <Text className="mt-2 text-center text-slate-500">
                Tap + to add your first item to {name ?? "this location"}.
              </Text>
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
            </View>
          }
          renderItem={({ item }) => {
            const ingredientName = getIngredientName(item);
            const expiryStr = formatExpiryDate(item.expiryDate);
            const expired = isExpired(item.expiryDate);
            const expiringSoon = !expired && isExpiringSoon(item.expiryDate);

            return (
              <ReanimatedSwipeable
                friction={2}
                rightThreshold={40}
                renderLeftActions={() => (
                  <Pressable
                    className="mb-3 w-20 items-center justify-center rounded-3xl bg-red-500 active:bg-red-600"
                    onPress={() => handleDelete(item._id, ingredientName)}
                  >
                    <Ionicons name="trash-outline" size={22} color="white" />
                  </Pressable>
                )}
              >
                <Pressable
                  className="mb-3 flex-row items-center rounded-3xl bg-white p-4 shadow-sm active:bg-slate-50"
                  onPress={() =>
                    router.push({
                      pathname: "/pantry/edit/[id]",
                      params: { id: item._id },
                    })
                  }
                >
                  <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                    <Ionicons
                      name="nutrition-outline"
                      size={23}
                      color="#2563EB"
                    />
                  </View>

                  <View className="ml-4 flex-1">
                    <Text className="text-base font-bold text-slate-900">
                      {ingredientName}
                    </Text>
                    <Text className="mt-0.5 text-sm text-slate-500">
                      {item.quantityAvailable} {item.quantityUnit}
                    </Text>
                  </View>

                  {expiryStr ? (
                    <View
                      className={`mr-2 rounded-full px-3 py-1 ${
                        expired
                          ? "bg-red-100"
                          : expiringSoon
                            ? "bg-amber-100"
                            : "bg-slate-100"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          expired
                            ? "text-red-600"
                            : expiringSoon
                              ? "text-amber-600"
                              : "text-slate-500"
                        }`}
                      >
                        {expired ? "Expired " : "Exp "}
                        {expiryStr}
                      </Text>
                    </View>
                  ) : null}

                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </Pressable>
              </ReanimatedSwipeable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
