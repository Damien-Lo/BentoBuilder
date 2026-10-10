import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { addDays, MONTHS_FULL, MONTHS_SHORT, WEEKDAYS_SHORT, weekOf } from "@/src/components/calendar/calendarUtils";
import { entryName } from "@/src/components/calendar/mealFood";
import { useEntryConfirm } from "@/src/components/planner/useEntryConfirm";
import { showActions } from "@/src/components/todo/theme";
import { Button, Card, GoalBar, IconButton, Planned, WEB, WebPage } from "@/src/components/web/ui";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import {
  deleteMealPlanEntry,
  getMealPlanRange,
  unconfirmMealPlanEntry,
  type MealPlanEntry,
  type MealSlot,
} from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { stopUsualMeal } from "@/src/services/usualMealApi";
import type { PantryItem } from "@/src/types/pantry";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";

// The planner in a desktop browser: the whole week at once. A column per
// day and a row per meal, each cell holding what's planned or eaten, with
// the day's calories on top and the week's totals down the side. The phone
// planner shows one day at a time, for logging; this is for laying the
// week out.

type Hover = { hovered?: boolean };

const LABEL_WIDTH = 104;
const SUMMARY_WIDTH = 300;
// One page of the numbers card (the card, less its border).
const PAGE_WIDTH = SUMMARY_WIDTH - 2;

export function WebWeekPlanScreen() {
  const router = useRouter();
  const today = todayStr();
  // `date`: the day to open on — set on the way back from adding food, so
  // the week that was being planned is still the one on show.
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const [focusDate, setFocusDate] = useState(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  // What marking an entry as eaten works from.
  const [kitchen, setKitchen] = useState<{ recipes: Recipe[]; ingredients: Ingredient[]; pantry: PantryItem[] } | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const week = useMemo(() => weekOf(focusDate, settings.weekStartDay), [focusDate, settings.weekStartDay]);

  const loadWeek = useCallback((days: string[]) => {
    getMealPlanRange(days[0], days[6])
      .then((loaded) => {
        setEntries(loaded);
        setLoadedWeek(days[0]);
      })
      .catch((error) => Alert.alert("Couldn't load the plan", error instanceof Error ? error.message : "Something went wrong."));
  }, []);

  const loadKitchen = useCallback(() => {
    Promise.all([getRecipes(), getIngredients(), getPantryItems()])
      .then(([recipes, ingredients, pantry]) => setKitchen({ recipes, ingredients, pantry }))
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings()
        .then((s) => {
          setSettings(s);
          setSettingsLoaded(true);
        })
        .catch(() => setSettingsLoaded(true));
      loadKitchen();
    }, [loadKitchen]),
  );
  // (Re)load whenever the week on show changes, and on coming back to it.
  useFocusEffect(
    useCallback(() => {
      if (settingsLoaded) loadWeek(week);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingsLoaded, week[0], loadWeek]),
  );
  useEffect(() => {
    if (settingsLoaded) loadWeek(week);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week[0]]);

  const reload = () => {
    loadWeek(week);
    loadKitchen();
  };

  const confirm = useEntryConfirm({
    allRecipes: kitchen?.recipes ?? [],
    allIngredients: kitchen?.ingredients ?? [],
    pantryItems: kitchen?.pantry ?? [],
    settings: settingsLoaded ? settings : null,
    ready: !!kitchen && settingsLoaded,
    onConfirmed: reload,
  });

  const fail = (error: unknown) => Alert.alert("Couldn't update", error instanceof Error ? error.message : "Something went wrong.");
  const conversions = settings.unitConversions;
  const kcalOf = (list: MealPlanEntry[]) => computeDayNutrition(list, conversions).calories ?? 0;

  function addFood(date: string, slot: MealSlot) {
    // The phone planner's own add sheet, on that day and meal; it comes back
    // here when done.
    router.push({ pathname: "/planner", params: { date, add: slot, from: "web", t: String(Date.now()) } });
  }

  function openItem(entry: MealPlanEntry) {
    if (entry.recipe) router.push({ pathname: "/recipes/[id]", params: { id: entry.recipe._id } });
    else if (entry.meal) router.push({ pathname: "/meals/[id]", params: { id: entry.meal._id } });
    else if (entry.ingredient) router.push({ pathname: "/ingredients/edit/[id]", params: { id: entry.ingredient._id } });
    else if (entry.restaurantMeal) router.push({ pathname: "/restaurant-meals/[id]", params: { id: entry.restaurantMeal._id } });
  }

  function toggleEaten(entry: MealPlanEntry) {
    if (entry.status === "confirmed") unconfirmMealPlanEntry(entry._id).then(reload, fail);
    else confirm.confirm(entry, true);
  }

  function entryMenu(entry: MealPlanEntry) {
    const usualId = entry.usual;
    showActions(entryName(entry), [
      { label: entry.status === "confirmed" ? "Mark as not eaten" : "Mark as eaten", onPress: () => toggleEaten(entry) },
      { label: "Open", onPress: () => openItem(entry) },
      ...(usualId
        ? [
            { label: "Remove just this day", destructive: true, onPress: () => void deleteMealPlanEntry(entry._id).then(reload, fail) },
            { label: "Stop having this from this day on", destructive: true, onPress: () => void stopUsualMeal(usualId, entry.date).then(reload, fail) },
          ]
        : [{ label: "Remove", destructive: true, onPress: () => void deleteMealPlanEntry(entry._id).then(reload, fail) }]),
    ]);
  }

  const a = parseLocalDate(week[0]);
  const b = parseLocalDate(week[6]);
  const range =
    a.getMonth() === b.getMonth()
      ? `${MONTHS_FULL[a.getMonth()]} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
      : `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()} – ${MONTHS_SHORT[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;

  const ready = loadedWeek === week[0];
  const weekEntries = ready ? entries.filter((e) => e.date >= week[0] && e.date <= week[6]) : [];
  const eaten = computeDayNutrition(weekEntries.filter((e) => e.status === "confirmed"), conversions);
  const planned = computeDayNutrition(weekEntries.filter((e) => e.status === "planned"), conversions);
  const loggedDays = week.filter((d) => weekEntries.some((e) => e.date === d && e.status === "confirmed")).length;

  // The numbers card has two pages, swiped between: the week, and one day.
  // Clicking a day at the top of the grid picks it and turns to its page.
  const [page, setPage] = useState<0 | 1>(0);
  const [pickedDay, setPickedDay] = useState(today);
  const pickedDayShown = week.includes(pickedDay) ? pickedDay : week.includes(today) ? today : week[0];
  const pager = useRef<ScrollView>(null);
  const turnTo = (next: 0 | 1) => {
    setPage(next);
    pager.current?.scrollTo({ x: next * PAGE_WIDTH, animated: true });
  };
  const pickedEntries = weekEntries.filter((e) => e.date === pickedDayShown);
  const dayEaten = computeDayNutrition(pickedEntries.filter((e) => e.status === "confirmed"), conversions);
  const dayPlanned = computeDayNutrition(pickedEntries.filter((e) => e.status === "planned"), conversions);
  const dayCount = pickedEntries.filter((e) => e.status === "confirmed").length;
  const longDay = (date: string) => {
    const d = parseLocalDate(date);
    return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };

  return (
    <WebPage maxWidth={1760}>
      {/* Toolbar */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 }}>
        <Button label="This week" onPress={() => setFocusDate(today)} />
        <IconButton icon="chevron-back" label="Previous week" onPress={() => setFocusDate((d) => addDays(d, -7))} />
        <IconButton icon="chevron-forward" label="Next week" onPress={() => setFocusDate((d) => addDays(d, 7))} />
        <Text style={{ flex: 1, marginLeft: 6, fontSize: 20, fontWeight: "700", color: WEB.text }}>{range}</Text>
        <Button label="Grocery list" icon="cart-outline" onPress={() => router.navigate("/grocery-list")} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        {/* The week */}
        <View style={{ flex: 1, backgroundColor: WEB.card, borderWidth: 1, borderColor: WEB.border, borderRadius: 16, overflow: "hidden" }}>
          {/* Days */}
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: WEB.border }}>
            <View style={{ width: LABEL_WIDTH }} />
            {week.map((day) => {
              const d = parseLocalDate(day);
              const isToday = day === today;
              const dayEntries = weekEntries.filter((e) => e.date === day);
              const done = kcalOf(dayEntries.filter((e) => e.status === "confirmed"));
              const ahead = kcalOf(dayEntries.filter((e) => e.status === "planned"));
              const goal = settings.dailyCalorieLimit;
              const pct = (n: number) => `${Math.max(0, Math.min(100, goal ? (n / goal) * 100 : 0))}%` as const;
              const over = !!goal && done > goal * 1.05;
              const chosen = page === 1 && day === pickedDayShown;
              return (
                <Pressable
                  key={day}
                  onPress={() => {
                    setPickedDay(day);
                    turnTo(1);
                  }}
                  accessibilityLabel={`Show ${longDay(day)}`}
                  style={({ hovered }: { hovered?: boolean }) => ({
                    flex: 1,
                    padding: 10,
                    borderLeftWidth: 1,
                    borderLeftColor: WEB.border,
                    borderTopWidth: 3,
                    borderTopColor: isToday || chosen ? WEB.blue : "transparent",
                    backgroundColor: chosen ? "#DBEAFE" : hovered ? "#EEF2F7" : isToday ? "#F8FBFF" : WEB.card,
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Text style={{ fontSize: 20, fontWeight: isToday ? "700" : "500", color: isToday ? WEB.blue : WEB.text }}>{d.getDate()}</Text>
                    <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: isToday ? WEB.blue : WEB.muted }}>{WEEKDAYS_SHORT[d.getDay()]}</Text>
                  </View>
                  <Text style={{ marginTop: 4, fontSize: 12, color: WEB.muted }}>
                    <Text style={{ fontWeight: "700", color: over ? WEB.red : WEB.text }}>{Math.round(done)}</Text>
                    {ahead > 0 && <Text style={{ color: WEB.faint }}> +{Math.round(ahead)}</Text>} kcal
                  </Text>
                  <View style={{ marginTop: 5, height: 5, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden", flexDirection: "row" }}>
                    <View style={{ width: pct(done), backgroundColor: over ? WEB.red : WEB.blue }} />
                    <View style={{ width: pct(Math.min(ahead, Math.max(0, (goal ?? 0) - done))), backgroundColor: WEB.blue, opacity: 0.3 }} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* A row per meal */}
          {SLOTS.map((slot, row) => (
            <View key={slot.id} style={{ flexDirection: "row", borderBottomWidth: row < SLOTS.length - 1 ? 1 : 0, borderBottomColor: WEB.border }}>
              <View style={{ width: LABEL_WIDTH, padding: 12 }}>
                <Ionicons name={slot.icon} size={18} color={slot.iconColor} />
                <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "700", color: WEB.body }}>{slot.label}</Text>
              </View>
              {week.map((day) => {
                const inCell = weekEntries.filter((e) => e.date === day && e.slot === slot.id);
                return (
                  <View
                    key={day}
                    style={{ flex: 1, minHeight: 118, padding: 6, borderLeftWidth: 1, borderLeftColor: WEB.border, backgroundColor: day === today ? "#F8FBFF" : WEB.card }}
                  >
                    {inCell.map((entry) => {
                      const isEaten = entry.status === "confirmed";
                      return (
                        <Pressable
                          key={entry._id}
                          onPress={() => entryMenu(entry)}
                          style={({ hovered }: Hover) => ({
                            flexDirection: "row",
                            marginBottom: 5,
                            borderRadius: 9,
                            borderWidth: 1,
                            borderStyle: isEaten ? "solid" : "dashed",
                            borderColor: isEaten ? "#BBF7D0" : "#CBD5E1",
                            backgroundColor: hovered ? "#F1F5F9" : isEaten ? "#F0FDF4" : "#FFFFFF",
                          })}
                        >
                          <Pressable
                            onPress={() => toggleEaten(entry)}
                            accessibilityLabel={isEaten ? "Mark as not eaten" : "Mark as eaten"}
                            style={{ width: 26, alignItems: "center", paddingTop: 7 }}
                          >
                            <Ionicons name={isEaten ? "checkmark-circle" : "ellipse-outline"} size={16} color={isEaten ? WEB.green : WEB.faint} />
                          </Pressable>
                          <View style={{ flex: 1, paddingVertical: 5, paddingRight: 6 }}>
                            <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: "600", lineHeight: 15, color: WEB.text }}>
                              {entryName(entry)}
                              {entry.usual ? " " : ""}
                              {entry.usual && <Ionicons name="repeat" size={11} color={WEB.blue} />}
                            </Text>
                            <Text style={{ marginTop: 1, fontSize: 11, color: WEB.muted }}>{Math.round(kcalOf([entry]))} kcal</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => addFood(day, slot.id)}
                      accessibilityLabel={`Add ${slot.label.toLowerCase()}`}
                      style={({ hovered }: Hover) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 26,
                        borderRadius: 8,
                        backgroundColor: hovered ? WEB.blueSoft : "transparent",
                      })}
                    >
                      {({ hovered }: Hover) => (
                        <>
                          <Ionicons name="add" size={14} color={hovered ? WEB.blue : "#CBD5E1"} />
                          <Text style={{ marginLeft: 2, fontSize: 11, fontWeight: "600", color: hovered ? WEB.blue : "#CBD5E1" }}>Add</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* The week in numbers */}
        <View style={{ width: SUMMARY_WIDTH, gap: 16 }}>
          <Card padded={false}>
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={32}
              onScroll={(e) => {
                const next = e.nativeEvent.contentOffset.x > PAGE_WIDTH / 2 ? 1 : 0;
                if (next !== page) setPage(next);
              }}
            >
              <Numbers
                title="This week"
                subtitle={`${loggedDays} of 7 days logged`}
                eaten={eaten}
                planned={planned}
                days={7}
                settings={settings}
                line={loggedDays > 0 ? `${Math.round((eaten.calories ?? 0) / loggedDays)} kcal a day on logged days` : "Nothing logged yet"}
              />
              <Numbers
                title={longDay(pickedDayShown)}
                subtitle={`${pickedDayShown === today ? "Today · " : ""}${dayCount} eaten${pickedEntries.length > dayCount ? `, ${pickedEntries.length - dayCount} planned` : ""}`}
                eaten={dayEaten}
                planned={dayPlanned}
                days={1}
                settings={settings}
                line={pickedEntries.length ? "" : "Nothing planned or eaten"}
              />
            </ScrollView>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingBottom: 14 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Legend color="#F0FDF4" border="#BBF7D0" label="Eaten" />
                <Legend color="#FFFFFF" border="#CBD5E1" dashed label="Planned" />
              </View>
              {/* Which page is showing; click to turn. */}
              {([0, 1] as const).map((n) => (
                <Pressable key={n} onPress={() => turnTo(n)} accessibilityLabel={n ? "The day" : "The week"} style={{ padding: 4 }}>
                  <View style={{ width: page === n ? 16 : 7, height: 7, borderRadius: 4, backgroundColor: page === n ? WEB.blue : "#CBD5E1" }} />
                </Pressable>
              ))}
            </View>
          </Card>
          <Planned
            icon="cart-outline"
            title="Shopping for this plan"
            text="What the week's planned meals need that the pantry doesn't have, ready to send to the grocery list."
          />
          <Planned icon="flame-outline" title="Prep sessions" text="Batch-cooking blocks for the week, booked in the calendar and tied to the recipes they cover." />
        </View>
      </View>

      {confirm.modals}
    </WebPage>
  );
}

// One page of the numbers card: what was eaten (and what's still planned)
// against the goals for that many days.
function Numbers({
  title,
  subtitle,
  eaten,
  planned,
  days,
  settings,
  line,
}: {
  title: string;
  subtitle: string;
  eaten: ReturnType<typeof computeDayNutrition>;
  planned: ReturnType<typeof computeDayNutrition>;
  days: number;
  settings: AppSettings;
  line: string;
}) {
  const goal = (n: number | null) => (n != null ? n * days : null);
  return (
    <View style={{ width: PAGE_WIDTH, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: WEB.text }}>{title}</Text>
      <Text style={{ marginTop: 1, marginBottom: 10, fontSize: 12, color: WEB.muted }}>{subtitle}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ fontSize: 28, fontWeight: "700", color: WEB.text }}>{Math.round(eaten.calories ?? 0)}</Text>
        {(planned.calories ?? 0) > 0 && <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: WEB.faint }}>+{Math.round(planned.calories ?? 0)}</Text>}
        <Text style={{ marginLeft: 6, fontSize: 13, color: WEB.muted }}>kcal</Text>
      </View>
      <Text style={{ marginTop: 2, fontSize: 12, color: WEB.muted }}>
        {[line, settings.dailyCalorieLimit ? `goal ${settings.dailyCalorieLimit}${days === 1 ? " kcal" : ""}` : ""].filter(Boolean).join(" · ")}
      </Text>
      <GoalBar label="Calories" value={eaten.calories ?? 0} planned={planned.calories ?? 0} goal={goal(settings.dailyCalorieLimit)} unit="kcal" />
      <GoalBar label="Protein" value={eaten.protein ?? 0} planned={planned.protein ?? 0} goal={goal(settings.dailyProteinLimit)} unit="g" />
      <GoalBar label="Carbs" value={eaten.carbs ?? 0} planned={planned.carbs ?? 0} goal={goal(settings.dailyCarbsLimit)} unit="g" color="#D97706" />
      <GoalBar label="Fats" value={eaten.fats ?? 0} planned={planned.fats ?? 0} goal={goal(settings.dailyFatsLimit)} unit="g" color="#DB2777" />
    </View>
  );
}

function Legend({ color, border, dashed, label }: { color: string; border: string; dashed?: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 16, height: 12, borderRadius: 4, backgroundColor: color, borderWidth: 1, borderColor: border, borderStyle: dashed ? "dashed" : "solid" }} />
      <Text style={{ marginLeft: 6, fontSize: 11, color: WEB.muted }}>{label}</Text>
    </View>
  );
}
