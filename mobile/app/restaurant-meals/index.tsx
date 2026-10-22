import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { useWideForm } from "@/src/components/forms/wideForm";
import { Tap } from "@/src/components/ui/Tap";
import { deleteRestaurantMeal, getRestaurantMeals, type RestaurantMeal } from "@/src/services/restaurantMealApi";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

// Eating Out (Kitchen): the places you eat at, with their dishes. In
// Orbit's look, in the Kitchen's colours — in a desktop browser too, as a
// grid of cards.
export default function RestaurantMealsListPage() {
  return (
    <OrbitSection section="kitchen">
      <RestaurantMealsList />
    </OrbitSection>
  );
}

function RestaurantMealsList() {
  const router = useRouter();
  const layout = useWideForm();
  const { colors: o } = useOrbitTheme();
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

  const round = { width: 40, height: 40, borderRadius: 20, alignItems: "center" as const, justifyContent: "center" as const };
  // (A desktop browser's page sits back from the edges a little more.)
  const gutter = layout.wide ? 24 : 16;

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={{ backgroundColor: o.canvas }}>
    {/* (In a desktop browser, a column down the middle of the canvas.) */}
    <View style={[{ flex: 1 }, layout.wide && { width: "100%", maxWidth: 1180, alignSelf: "center" }]}>
      {/* The way back and a new one, round, over a large title on the page
          itself. */}
      <View style={{ paddingHorizontal: gutter, paddingTop: layout.wide ? 16 : 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
          <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ ...round, backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
            <Ionicons name="chevron-back" size={22} color={o.text} />
          </Tap>
          <View style={{ flex: 1 }} />
          <Tap onPress={() => router.push("/restaurant-meals/add")} accessibilityLabel="Add a restaurant" style={{ ...round, backgroundColor: o.ink }} pressedStyle={{ opacity: 0.8 }}>
            <Ionicons name="add" size={24} color={o.onInk} />
          </Tap>
        </View>
        <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>Eating Out</Text>
      </View>

      <View className="px-5 pt-4" style={{ paddingHorizontal: gutter, paddingTop: 14 }}>
        <View className="h-12 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4" style={[{ backgroundColor: o.surface, borderColor: o.border, borderRadius: 16 }, layout.wide && { maxWidth: 420 }]}>
          <Ionicons name="search-outline" size={19} color={o.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search restaurants or dishes"
            placeholderTextColor={o.faint}
            className="ml-3 flex-1 text-base text-slate-950"
            style={{ color: o.text }}
          />
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={o.muted} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r._id}
          // (In a desktop browser: a grid of cards, three to a row.)
          key={layout.wide ? "grid" : "list"}
          numColumns={layout.wide ? 3 : 1}
          contentContainerStyle={{ paddingHorizontal: layout.wide ? gutter - 6 : gutter, paddingTop: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={layout.wide ? { width: "33.333%", paddingHorizontal: 6 } : undefined}>
            <ReanimatedSwipeable
              friction={2}
              rightThreshold={40}
              renderLeftActions={() => (
                <Pressable
                  className="mb-3 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
                  style={{ borderRadius: 18 }}
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="archive-outline" size={20} color="white" />
                </Pressable>
              )}
            >
              <Tap
                className="mb-3 flex-row items-center rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50"
                style={{ backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 }}
                pressedStyle={{ backgroundColor: o.pill }}
                onPress={() => router.push({ pathname: "/restaurant-meals/[id]", params: { id: item._id } })}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-orange-50" style={{ backgroundColor: o.pill }}>
                  <Ionicons name="restaurant-outline" size={18} color={o.ink} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-slate-900" style={{ color: o.text }}>{item.restaurantName}</Text>
                  <Text className="mt-0.5 text-sm text-slate-400" style={{ color: o.muted }} numberOfLines={1}>
                    {item.dishes.map((d) => d.name).join(", ") || "No dishes yet"}
                  </Text>
                </View>
                {/* (No swiping with a mouse: archiving is a button here.) */}
                {layout.wide && (
                  <Pressable onPress={() => handleDelete(item)} accessibilityLabel={`Archive ${item.restaurantName}`} hitSlop={8} style={({ hovered }: { hovered?: boolean }) => ({ marginRight: 4, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? o.track : "transparent" })}>
                    <Ionicons name="archive-outline" size={17} color={o.faint} />
                  </Pressable>
                )}
                <Ionicons name="chevron-forward" size={20} color={o.faint} />
              </Tap>
            </ReanimatedSwipeable>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Ionicons name="restaurant-outline" size={42} color={o.faint} />
              <Text className="mt-4 text-lg font-bold text-slate-900" style={{ color: o.text }}>No restaurant meals yet</Text>
              <Text className="mt-2 text-center text-slate-500" style={{ color: o.muted }}>
                {search ? "Try a different search." : "Log a visit to see it here."}
              </Text>
            </View>
          }
        />
      )}
    </View>
    </SafeAreaView>
    </OrbitPage>
  );
}
