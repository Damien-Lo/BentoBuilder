import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { RateRecipeModal } from "@/src/components/recipes/RateRecipeModal";
import type { SelectOption } from "@/src/services/optionsApi";
import {
  addDishScore,
  deleteDishScore,
  getRestaurantMealById,
  type Dish,
  type RestaurantMeal,
} from "@/src/services/restaurantMealApi";
import { getMealPlanHistoryForRestaurant, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { friendlyDayLabel, getRestaurantMealKcal } from "@/src/utils/mealPlan";

function recentScoresFor(dish: Dish) {
  return (dish.scores ?? []).slice(-50);
}

function averageScoreFor(dish: Dish): number | null {
  const scores = recentScoresFor(dish);
  if (scores.length === 0) return null;
  const sum = scores.reduce((acc, s) => acc + s.value, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

export default function RestaurantMealDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [restaurantMeal, setRestaurantMeal] = useState<RestaurantMeal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rateModalDishId, setRateModalDishId] = useState<string | null>(null);
  const [savingScore, setSavingScore] = useState(false);
  const [expandedHistoryDishIds, setExpandedHistoryDishIds] = useState<Set<string>>(new Set());

  // Past visits to this restaurant - the whole section starts collapsed
  // (there can be a lot of these once you've eaten somewhere a while),
  // individual visits expand on tap to show what was actually ordered.
  const [visits, setVisits] = useState<MealPlanEntry[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(true);
  const [visitsExpanded, setVisitsExpanded] = useState(false);
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setIsLoading(true);
    getRestaurantMealById(id)
      .then((data) => {
        setRestaurantMeal(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this visit."))
      .finally(() => setIsLoading(false));
  }, [id]);

  const loadVisits = useCallback(() => {
    if (!id) return;
    setVisitsLoading(true);
    getMealPlanHistoryForRestaurant(id)
      .then(setVisits)
      .catch(() => setVisits([]))
      .finally(() => setVisitsLoading(false));
  }, [id]);

  useFocusEffect(load);
  useFocusEffect(loadVisits);

  function toggleHistory(dishId: string) {
    setExpandedHistoryDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
  }

  async function handleAddScore(value: number) {
    if (!restaurantMeal || !rateModalDishId) return;
    setSavingScore(true);
    try {
      const updatedScores = await addDishScore(restaurantMeal._id, rateModalDishId, value);
      setRestaurantMeal((prev) =>
        prev
          ? {
              ...prev,
              dishes: prev.dishes.map((d) =>
                d._id === rateModalDishId ? { ...d, scores: updatedScores } : d,
              ),
            }
          : prev,
      );
      setRateModalDishId(null);
    } catch (err) {
      Alert.alert("Couldn't save rating", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSavingScore(false);
    }
  }

  function handleDeleteScore(dishId: string, scoreId: string) {
    if (!restaurantMeal) return;
    Alert.alert("Delete rating", "Remove this rating?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteDishScore(restaurantMeal._id, dishId, scoreId)
            .then((updatedScores) => {
              setRestaurantMeal((prev) =>
                prev
                  ? {
                      ...prev,
                      dishes: prev.dishes.map((d) =>
                        d._id === dishId ? { ...d, scores: updatedScores } : d,
                      ),
                    }
                  : prev,
              );
            })
            .catch((err) =>
              Alert.alert("Couldn't delete", err instanceof Error ? err.message : "Something went wrong."),
            );
        },
      },
    ]);
  }

  if (isLoading && !restaurantMeal) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  if (error || !restaurantMeal) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 px-6">
        <Ionicons name="alert-circle-outline" size={40} color="#94A3B8" />
        <Text className="mt-3 text-center text-slate-500">{error ?? "Not found."}</Text>
      </SafeAreaView>
    );
  }

  const tags = (restaurantMeal.tags ?? []).filter(
    (t): t is SelectOption => typeof t !== "string",
  );

  return (
    <>
      <SafeAreaView className="flex-1 bg-slate-50">
        {/* Nav bar */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>

          <Text className="ml-2 flex-1 text-xl font-bold text-slate-950" numberOfLines={1}>
            {restaurantMeal.restaurantName}
          </Text>

          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() =>
              router.push({ pathname: "/restaurant-meals/edit/[id]", params: { id: restaurantMeal._id } })
            }
          >
            <Ionicons name="create-outline" size={24} color="#2563EB" />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 20 }}
        >
          {/* Header card */}
          <View className="rounded-2xl border border-slate-200 bg-white p-5">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-orange-50">
              <Ionicons name="restaurant-outline" size={26} color="#EA580C" />
            </View>

            <Text className="mt-4 text-2xl font-bold text-slate-900">{restaurantMeal.restaurantName}</Text>

            {tags.length > 0 && (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {tags.map((tag) => (
                  <View key={tag._id} className="rounded-full bg-emerald-100 px-3 py-1">
                    <Text className="text-xs font-semibold text-emerald-700">{tag.name}</Text>
                  </View>
                ))}
              </View>
            )}

            {restaurantMeal.notes ? (
              <Text className="mt-4 text-base leading-6 text-slate-600">{restaurantMeal.notes}</Text>
            ) : null}
          </View>

          {/* Dishes */}
          <Text className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">
            Dishes ({restaurantMeal.dishes.length})
          </Text>

          {restaurantMeal.dishes.map((dish) => {
            const recentScores = recentScoresFor(dish);
            const averageScore = averageScoreFor(dish);
            const showHistory = expandedHistoryDishIds.has(dish._id);
            const n = dish.nutrition;
            const nutritionRows = n
              ? ([
                  ["Calories", n.calories, "kcal"],
                  ["Protein", n.protein, "g"],
                  ["Carbs", n.carbs, "g"],
                  ["Fats", n.fats, "g"],
                  ["Fiber", n.fiber, "g"],
                  ["Sodium", n.sodium, "mg"],
                ] as [string, number | null | undefined, string][]).filter(([, v]) => v != null)
              : [];

            return (
              <View key={dish._id} className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-lg font-bold text-slate-900">{dish.name}</Text>
                  {dish.price != null && (
                    <Text className="ml-2 text-base font-semibold text-slate-500">
                      ${dish.price.toFixed(2)}
                    </Text>
                  )}
                </View>
                {dish.notes ? (
                  <Text className="mt-1 text-sm leading-5 text-slate-600">{dish.notes}</Text>
                ) : null}

                {nutritionRows.length > 0 && (
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {nutritionRows.map(([label, value, unit]) => (
                      <View key={label} className="rounded-full bg-slate-100 px-2.5 py-1">
                        <Text className="text-xs font-semibold text-slate-600">
                          {value} {unit} {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Rating */}
                <View className="mt-4 flex-row items-center justify-between border-t border-slate-100 pt-4">
                  <View>
                    <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">Rating</Text>
                    {averageScore != null ? (
                      <View className="mt-1.5 flex-row items-baseline">
                        <Text className="text-xl font-bold text-slate-900">{averageScore}</Text>
                        <Text className="ml-1 text-sm font-semibold text-slate-400">/ 10</Text>
                        <Text className="ml-1.5 text-xs text-slate-400">
                          · {recentScores.length} {recentScores.length === 1 ? "rating" : "ratings"}
                        </Text>
                      </View>
                    ) : (
                      <Text className="mt-1.5 text-sm text-slate-400">Not rated yet</Text>
                    )}
                  </View>

                  <Pressable
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 active:bg-blue-700"
                    onPress={() => setRateModalDishId(dish._id)}
                  >
                    <Text className="text-sm font-semibold text-white">Rate</Text>
                  </Pressable>
                </View>

                {recentScores.length > 0 && (
                  <>
                    <Pressable className="mt-3 flex-row items-center" onPress={() => toggleHistory(dish._id)}>
                      <Text className="text-xs font-semibold text-slate-500">
                        {showHistory ? "Hide history" : "Show history"}
                      </Text>
                      <Ionicons
                        name={showHistory ? "chevron-up" : "chevron-down"}
                        size={14}
                        color="#64748B"
                        style={{ marginLeft: 4 }}
                      />
                    </Pressable>

                    {showHistory && (
                      <View className="mt-2 overflow-hidden rounded-2xl border border-slate-100">
                        {recentScores.map((score, index) => (
                          <ReanimatedSwipeable
                            key={score._id}
                            friction={2}
                            rightThreshold={40}
                            renderLeftActions={() => (
                              <Pressable
                                className="w-20 items-center justify-center bg-red-500 active:bg-red-600"
                                onPress={() => handleDeleteScore(dish._id, score._id)}
                              >
                                <Ionicons name="trash-outline" size={20} color="white" />
                              </Pressable>
                            )}
                          >
                            <View
                              className={`flex-row items-center justify-between bg-white px-3 py-2.5 ${
                                index < recentScores.length - 1 ? "border-b border-slate-100" : ""
                              }`}
                            >
                              <Text className="text-sm text-slate-600">
                                {new Date(score.ratedAt).toLocaleDateString()}
                              </Text>
                              <Text className="text-sm font-semibold text-slate-900">{score.value} / 10</Text>
                            </View>
                          </ReanimatedSwipeable>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}

          {/* Past visits - collapsed by default (can be a long list once
              you've eaten somewhere a while), individual visits expand on
              tap to show what was actually ordered that time. */}
          <Pressable
            className="mb-2 mt-6 flex-row items-center justify-between"
            onPress={() => setVisitsExpanded((v) => !v)}
          >
            <Text className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Past Visits ({visits.length})
            </Text>
            <Ionicons name={visitsExpanded ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
          </Pressable>

          {visitsExpanded && (
            visitsLoading ? (
              <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 12 }} />
            ) : visits.length === 0 ? (
              <Text className="mb-4 text-sm text-slate-400">No visits logged yet.</Text>
            ) : (
              <View className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {visits.map((visit, i) => {
                  const isOpen = expandedVisitId === visit._id;
                  const selections = visit.restaurantDishSelections ?? [];
                  const quantityByDish = new Map(selections.map((s) => [s.dish, s.quantity]));
                  const orderedDishes = restaurantMeal.dishes.filter((d) => quantityByDish.has(d._id));
                  const kcal = getRestaurantMealKcal(restaurantMeal, selections);
                  return (
                    <View key={visit._id} className={i < visits.length - 1 ? "border-b border-slate-100" : ""}>
                      <Pressable
                        className="flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50"
                        onPress={() => setExpandedVisitId(isOpen ? null : visit._id)}
                      >
                        <View className="flex-1">
                          <Text className="font-semibold text-slate-900">{friendlyDayLabel(visit.date)}</Text>
                          <Text className="mt-0.5 text-xs text-slate-400">
                            {orderedDishes.length} {orderedDishes.length === 1 ? "dish" : "dishes"}
                            {kcal != null ? ` · ${kcal} kcal` : ""}
                          </Text>
                        </View>
                        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
                      </Pressable>

                      {isOpen && (
                        <View className="bg-slate-50 px-4 pb-4">
                          {orderedDishes.length === 0 ? (
                            <Text className="text-sm text-slate-400">Dish details no longer available.</Text>
                          ) : (
                            orderedDishes.map((d) => {
                              const qty = quantityByDish.get(d._id) ?? 1;
                              return (
                                <View key={d._id} className="flex-row items-center justify-between py-1.5">
                                  <Text className="text-sm text-slate-700">
                                    {d.name}
                                    {qty > 1 ? ` ×${qty}` : ""}
                                  </Text>
                                  {d.nutrition?.calories != null && (
                                    <Text className="text-xs text-slate-400">
                                      {Math.round(d.nutrition.calories * qty)} kcal
                                    </Text>
                                  )}
                                </View>
                              );
                            })
                          )}
                          <Text className="mt-2 text-xs font-semibold text-slate-400">
                            {visit.status === "confirmed" ? "Confirmed" : "Planned"}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )
          )}
        </ScrollView>
      </SafeAreaView>

      <RateRecipeModal
        visible={rateModalDishId != null}
        saving={savingScore}
        title="Rate this dish"
        subtitle="How was it, out of 10?"
        onClose={() => setRateModalDishId(null)}
        onSubmit={(value) => void handleAddScore(value)}
      />
    </>
  );
}
