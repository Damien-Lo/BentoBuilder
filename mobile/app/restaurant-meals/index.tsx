import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { deleteRestaurantMeal, getRestaurantMeals, type RestaurantMeal } from "@/src/services/restaurantMealApi";

export default function RestaurantMealsListPage() {
  const router = useRouter();
  const [restaurantMeals, setRestaurantMeals] = useState<RestaurantMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setIsLoading(true);
    getRestaurantMeals()
      .then(setRestaurantMeals)
      .catch(() => setRestaurantMeals([]))
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(load);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? restaurantMeals
      : restaurantMeals.filter(
          (r) =>
            r.restaurantName.toLowerCase().includes(q) ||
            r.dishes.some((d) => d.name.toLowerCase().includes(q)),
        );
    return [...list].sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));
  }, [restaurantMeals, search]);

  function handleDelete(item: RestaurantMeal) {
    Alert.alert(`Archive "${item.restaurantName}"?`, "You can restore it later from Settings > Archive.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: () => {
          void deleteRestaurantMeal(item._id)
            .then(() => setRestaurantMeals((prev) => prev.filter((r) => r._id !== item._id)))
            .catch((err) =>
              Alert.alert("Couldn't archive", err instanceof Error ? err.message : "Something went wrong."),
            );
        },
      },
    ]);
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
        <Text className="ml-2 flex-1 text-xl font-bold text-slate-950">Eating Out</Text>
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.push("/restaurant-meals/add")}
        >
          <Ionicons name="add" size={26} color="#2563EB" />
        </Pressable>
      </View>

      <View className="px-5 pt-4">
        <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
          <Ionicons name="search-outline" size={19} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search restaurants or dishes"
            placeholderTextColor="#94A3B8"
            className="ml-3 flex-1 text-base text-slate-950"
          />
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r._id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ReanimatedSwipeable
              friction={2}
              rightThreshold={40}
              renderLeftActions={() => (
                <Pressable
                  className="mb-3 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="archive-outline" size={20} color="white" />
                </Pressable>
              )}
            >
              <Pressable
                className="mb-3 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                onPress={() => router.push({ pathname: "/restaurant-meals/[id]", params: { id: item._id } })}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-orange-50">
                  <Ionicons name="restaurant-outline" size={18} color="#EA580C" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-900">{item.restaurantName}</Text>
                  <Text className="mt-0.5 text-sm text-slate-400" numberOfLines={1}>
                    {item.dishes.map((d) => d.name).join(", ") || "No dishes yet"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
              </Pressable>
            </ReanimatedSwipeable>
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Ionicons name="restaurant-outline" size={42} color="#94A3B8" />
              <Text className="mt-4 text-lg font-bold text-slate-900">No restaurant meals yet</Text>
              <Text className="mt-2 text-center text-slate-500">
                {search ? "Try a different search." : "Log a visit to see it here."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
