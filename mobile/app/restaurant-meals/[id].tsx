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
import { useWideForm } from "@/src/components/forms/wideForm";
import { Tap } from "@/src/components/ui/Tap";
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";

function recentScoresFor(dish: Dish) {
  return (dish.scores ?? []).slice(-50);
}

function averageScoreFor(dish: Dish): number | null {
  const scores = recentScoresFor(dish);
  if (scores.length === 0) return null;
  const sum = scores.reduce((acc, s) => acc + s.value, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

// A restaurant's page (Kitchen → Eating Out): its dishes, their ratings and
// past visits. In Orbit's look, in the Kitchen's colours — in a desktop
// browser too, its dishes and visits side by side.
export default function RestaurantMealDetailPage() {
  return (
    <OrbitSection section="kitchen">
      <RestaurantMealDetail />
    </OrbitSection>
  );
}

function RestaurantMealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const layout = useWideForm();
  const { colors: o, dark } = useOrbitTheme();

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
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={{ backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o.muted} />
      </SafeAreaView>
    );
  }

  if (error || !restaurantMeal) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50 px-6" style={{ backgroundColor: o.canvas }}>
        <Ionicons name="alert-circle-outline" size={40} color={o.faint} />
        <Text className="mt-3 text-center text-slate-500" style={{ color: o.muted }}>{error ?? "Not found."}</Text>
      </SafeAreaView>
    );
  }

  const tags = (restaurantMeal.tags ?? []).filter(
    (t): t is SelectOption => typeof t !== "string",
  );

  // (Headings over cards, and the green of a tag.)
  const eyebrow = { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.2, color: o.faint, marginLeft: 4 };
  const card = { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  const tagChip = { backgroundColor: dark ? "rgba(52,211,153,0.14)" : "#ECFDF5" };
  const NUTRIENT_KEY: Record<string, MainNutrient> = { Calories: "calories", Protein: "protein", Carbs: "carbs", Fats: "fats", Fiber: "fiber", Sodium: "sodium" };

  // Header: the name as the page's large title, its tags and notes under it
  const headerSection = (
    <View>
      <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>{restaurantMeal.restaurantName}</Text>
      {tags.length > 0 && (
        <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {tags.map((tag) => (
            <View key={tag._id} style={[{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }, tagChip]}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: o.success }}>{tag.name}</Text>
            </View>
          ))}
        </View>
      )}
      {restaurantMeal.notes ? (
        <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: o.muted }}>{restaurantMeal.notes}</Text>
      ) : null}
    </View>
  );

  // Dishes
  const dishesSection = (
    <>
      <Text style={{ ...eyebrow, marginTop: 24, marginBottom: 8 }}>
        DISHES <Text style={{ color: o.orbit }}>· {restaurantMeal.dishes.length}</Text>
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
          <View key={dish._id} className="mb-4 rounded-2xl border border-slate-200 bg-white p-5" style={{ ...card, padding: 16, marginBottom: 12 }}>
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-lg font-bold text-slate-900" style={{ color: o.text }}>{dish.name}</Text>
              {dish.price != null && (
                <Text className="ml-2 text-base font-semibold text-slate-500" style={{ color: o.muted }}>
                  ${dish.price.toFixed(2)}
                </Text>
              )}
            </View>
            {dish.notes ? (
              <Text className="mt-1 text-sm leading-5 text-slate-600" style={{ color: o.muted }}>{dish.notes}</Text>
            ) : null}

            {nutritionRows.length > 0 && (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {nutritionRows.map(([label, value, unit]) => (
                  <View key={label} className="rounded-full bg-slate-100 px-2.5 py-1" style={{ flexDirection: "row", alignItems: "center", backgroundColor: o.pill }}>
                    {/* (A dot in the nutrient's colour.) */}
                    <View style={{ width: 6, height: 6, borderRadius: 3, marginRight: 5, backgroundColor: nutrientColor(NUTRIENT_KEY[label], dark) }} />
                    <Text className="text-xs font-semibold text-slate-600" style={{ color: o.onPill }}>
                      {value} {unit} {label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Rating */}
            <View className="mt-4 flex-row items-center justify-between border-t border-slate-100 pt-4" style={{ borderTopColor: o.border }}>
              <View>
                <Text className="text-xs font-bold uppercase tracking-wide text-slate-400" style={{ fontSize: 11, letterSpacing: 1.2, color: o.faint }}>Rating</Text>
                {averageScore != null ? (
                  <View className="mt-1.5 flex-row items-baseline">
                    <Text className="text-xl font-bold text-slate-900" style={{ fontSize: 22, fontWeight: "800", color: o.text }}>{averageScore}</Text>
                    <Text className="ml-1 text-sm font-semibold text-slate-400" style={{ color: o.faint }}>/ 10</Text>
                    <Text className="ml-1.5 text-xs text-slate-400" style={{ color: o.faint }}>
                      · {recentScores.length} {recentScores.length === 1 ? "rating" : "ratings"}
                    </Text>
                  </View>
                ) : (
                  <Text className="mt-1.5 text-sm text-slate-400" style={{ color: o.faint }}>Not rated yet</Text>
                )}
              </View>

              <Tap
                className="rounded-2xl bg-blue-600 px-4 py-2.5 active:bg-blue-700"
                style={{ backgroundColor: o.ink, borderRadius: 14, paddingHorizontal: 18 }}
                pressedStyle={{ opacity: 0.85 }}
                onPress={() => setRateModalDishId(dish._id)}
              >
                <Text className="text-sm font-semibold text-white" style={{ color: o.onInk }}>Rate</Text>
              </Tap>
            </View>

            {recentScores.length > 0 && (
              <>
                <Pressable className="mt-3 flex-row items-center" onPress={() => toggleHistory(dish._id)}>
                  <Text className="text-xs font-semibold text-slate-500" style={{ color: o.muted }}>
                    {showHistory ? "Hide history" : "Show history"}
                  </Text>
                  <Ionicons
                    name={showHistory ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={o.muted}
                    style={{ marginLeft: 4 }}
                  />
                </Pressable>

                {showHistory && (
                  <View className="mt-2 overflow-hidden rounded-2xl border border-slate-100" style={{ borderColor: o.border, borderRadius: 14 }}>
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
                          style={{ backgroundColor: o.surface, borderBottomColor: o.border }}
                        >
                          <Text className="text-sm text-slate-600" style={{ color: o.muted }}>
                            {new Date(score.ratedAt).toLocaleDateString()}
                          </Text>
                          <Text className="text-sm font-semibold text-slate-900" style={{ color: o.text }}>{score.value} / 10</Text>
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
    </>
  );

  // Past visits - collapsed by default (can be a long list once
  // you've eaten somewhere a while), individual visits expand on
  // tap to show what was actually ordered that time.
  const visitsSection = (
    <>
      <Pressable
        className="mb-2 mt-6 flex-row items-center justify-between"
        style={{ marginTop: 20, paddingVertical: 4 }}
        onPress={() => setVisitsExpanded((v) => !v)}
      >
        <Text style={eyebrow}>
          PAST VISITS <Text style={{ color: o.orbit }}>· {visits.length}</Text>
        </Text>
        <Ionicons name={visitsExpanded ? "chevron-up" : "chevron-down"} size={18} color={o.muted} />
      </Pressable>

      {visitsExpanded && (
        visitsLoading ? (
          <ActivityIndicator size="small" color={o.muted} style={{ marginVertical: 12 }} />
        ) : visits.length === 0 ? (
          <Text className="mb-4 text-sm text-slate-400" style={{ color: o.faint, marginLeft: 4 }}>No visits logged yet.</Text>
        ) : (
          <View className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            {visits.map((visit, i) => {
              const isOpen = expandedVisitId === visit._id;
              const selections = visit.restaurantDishSelections ?? [];
              const quantityByDish = new Map(selections.map((s) => [s.dish, s.quantity]));
              const orderedDishes = restaurantMeal.dishes.filter((d) => quantityByDish.has(d._id));
              const kcal = getRestaurantMealKcal(restaurantMeal, selections);
              return (
                <View key={visit._id} className={i < visits.length - 1 ? "border-b border-slate-100" : ""} style={{ borderBottomColor: o.border }}>
                  <Tap
                    className="flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50"
                    pressedStyle={{ backgroundColor: o.pill }}
                    onPress={() => setExpandedVisitId(isOpen ? null : visit._id)}
                  >
                    <View className="flex-1">
                      <Text className="font-semibold text-slate-900" style={{ color: o.text }}>{friendlyDayLabel(visit.date)}</Text>
                      <Text className="mt-0.5 text-xs text-slate-400" style={{ color: o.muted }}>
                        {orderedDishes.length} {orderedDishes.length === 1 ? "dish" : "dishes"}
                        {kcal != null ? ` · ${kcal} kcal` : ""}
                      </Text>
                    </View>
                    <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={o.faint} />
                  </Tap>

                  {isOpen && (
                    <View className="bg-slate-50 px-4 pb-4" style={{ backgroundColor: o.canvas, paddingTop: 10, borderTopWidth: 1, borderTopColor: o.border }}>
                      {orderedDishes.length === 0 ? (
                        <Text className="text-sm text-slate-400" style={{ color: o.faint }}>Dish details no longer available.</Text>
                      ) : (
                        orderedDishes.map((d) => {
                          const qty = quantityByDish.get(d._id) ?? 1;
                          return (
                            <View key={d._id} className="flex-row items-center justify-between py-1.5">
                              <Text className="text-sm text-slate-700" style={{ color: o.text }}>
                                {d.name}
                                {qty !== 1 ? ` ×${qty}` : ""}
                              </Text>
                              {d.nutrition?.calories != null && (
                                <Text className="text-xs text-slate-400" style={{ color: o.muted }}>
                                  {Math.round(d.nutrition.calories * qty)} kcal
                                </Text>
                              )}
                            </View>
                          );
                        })
                      )}
                      <Text className="mt-2 text-xs font-semibold text-slate-400" style={{ color: o.faint }}>
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
    </>
  );

  // (A desktop browser's page sits back from the edges a little more.)
  const gutter = layout.wide ? 24 : 16;

  return (
    <OrbitPage>
      <SafeAreaView className="flex-1 bg-slate-50" style={{ backgroundColor: o.canvas }}>
      {/* (In a desktop browser, a column down the middle of the canvas.) */}
      <View style={[{ flex: 1 }, layout.wide && { width: "100%", maxWidth: 1180, alignSelf: "center" }]}>
        {/* Nav bar: round buttons on the page itself (the name's the large
            title in the page) */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: gutter - 4, paddingTop: layout.wide ? 16 : 4 }}>
          <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
            <Ionicons name="chevron-back" size={22} color={o.text} />
          </Tap>
          <View style={{ flex: 1 }} />
          <Tap
            onPress={() => router.push({ pathname: "/restaurant-meals/edit/[id]", params: { id: restaurantMeal._id } })}
            accessibilityLabel="Edit restaurant"
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}
            pressedStyle={{ backgroundColor: o.pill }}
          >
            <Ionicons name="create-outline" size={20} color={o.ink} />
          </Tap>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 60, paddingTop: 12 }}
        >
          {/* (In a desktop browser: the restaurant across the top, then its
              visits on the left and the menu beside them.) */}
          {layout.wide ? (
            <>
              {headerSection}
              <View style={layout.columns}>
                {/* (Level with the dishes' heading.) */}
                <View style={[layout.column, { marginTop: -3 }]}>{visitsSection}</View>
                <View style={{ flex: 1.5, minWidth: 0 }}>{dishesSection}</View>
              </View>
            </>
          ) : (
            <>
              {headerSection}
              {dishesSection}
              {visitsSection}
            </>
          )}
        </ScrollView>
      </View>
      </SafeAreaView>

      <RateRecipeModal
        visible={rateModalDishId != null}
        saving={savingScore}
        title="Rate this dish"
        subtitle="How was it, out of 10?"
        onClose={() => setRateModalDishId(null)}
        onSubmit={(value) => void handleAddScore(value)}
      />
    </OrbitPage>
  );
}
