import { Ionicons } from "@expo/vector-icons";
import { KitchenSessionNeeds } from "@/src/components/planner/KitchenSessionNeeds";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  addDays,
  calendarColor,
  daysBetween,
  durationLabel,
  longDateLabel,
  minutesLabel,
  remindLabel,
  repeatLabel,
  shortDateLabel,
} from "@/src/components/calendar/calendarUtils";
import { buildMealFood, mealKey, type MealFood } from "@/src/components/calendar/mealFood";
import { MealSuggestion, SuggestionsToggle, useSuggestionsToggle } from "@/src/components/planner/MealSuggestion";
import { useSuggestionWatch } from "@/src/components/planner/useSuggestionWatch";
import { RepeatDaysSheet } from "@/src/components/calendar/RepeatDaysSheet";
import { useEntryConfirm } from "@/src/components/planner/useEntryConfirm";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { showActions } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { OrbitPage, OrbitSection, useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import {
  deleteCalendarEvent,
  getCalendarEvent,
  getCalendars,
  type CalendarEvent,
  type SeriesScope,
  type EventCalendar,
  type MealType,
} from "@/src/services/calendarApi";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import {
  deleteMealPlanEntry,
  getMealPlanForDate,
  unconfirmMealPlanEntry,
  type MealPlanEntry,
} from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { makeUsualFromEntry, stopUsualMeal } from "@/src/services/usualMealApi";
import type { PantryItem } from "@/src/types/pantry";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";
import { hexToRgba, parseLocalDate, todayStr } from "@/src/utils/mealPlan";

// One event, as Outlook's event page shows it: the summary card (title,
// date, time, repeat), then location / notes / reminder, then delete. `date`
// is the occurrence that was tapped (for a repeating event). In Orbit's
// look, in the Calendar's colours — in a desktop browser too, with what the
// event is for beside it.
export default function CalendarEventScreen() {
  return (
    <OrbitSection section="calendar">
      <CalendarEventPage />
    </OrbitSection>
  );
}

function CalendarEventPage() {
  const router = useRouter();
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [calendar, setCalendar] = useState<EventCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  // A meal event: that day's food for its meal from the planner
  // (undefined while loading, null when nothing's planned).
  // (undefined: loading; null: couldn't load. What's planned counts at the
  // pantry piece it would get.)
  const [loadedFood, setFood] = useState<{ entries: MealPlanEntry[]; conversions: CustomUnitConversion[]; day: string; slot: MealType } | null | undefined>(undefined);
  const kitchenPlan = usePlanNeeds();
  const wide = useWideWeb();
  // (In Orbit's colours, on a phone and in a desktop browser.)
  const { colors: o, dark } = useOrbitTheme();
  const food = useMemo<MealFood | null | undefined>(
    () => (loadedFood ? (buildMealFood(kitchenPlan.sized(loadedFood.entries), loadedFood.conversions).get(mealKey(loadedFood.day, loadedFood.slot)) ?? null) : loadedFood),
    [loadedFood, kitchenPlan],
  );
  // The planner entries behind `food`, and what marking one as eaten works
  // from (what's in the pantry, and the recipes and ingredients it uses).
  const [slotEntries, setSlotEntries] = useState<MealPlanEntry[]>([]);
  // The whole day's plan (null until loaded), and the day it's for: what
  // the suggestions for this meal are worked out from.
  const [dayPlan, setDayPlan] = useState<{ day: string; entries: MealPlanEntry[] } | null>(null);
  const [showSuggestions, toggleSuggestions] = useSuggestionsToggle();
  const suggested = useSuggestionWatch(dayPlan?.day ?? "", dayPlan?.entries ?? null, showSuggestions);
  // The food being made a usual: picking which days of the week.
  const [repeating, setRepeating] = useState<MealFood["items"][number] | null>(null);
  const [kitchen, setKitchen] = useState<{
    recipes: Recipe[];
    ingredients: Ingredient[];
    pantry: PantryItem[];
    settings: AppSettings;
  } | null>(null);

  // That day's food for the meal, from the planner.
  async function loadFood(day: string, slot: MealType, cancelled: () => boolean = () => false) {
    try {
      const [entries, settings] = await Promise.all([getMealPlanForDate(day), loadSettings()]);
      if (cancelled()) return;
      setSlotEntries(entries.filter((e) => e.slot === slot));
      setDayPlan({ day, entries });
      setFood({ entries, conversions: settings.unitConversions, day, slot });
    } catch {
      if (!cancelled()) setFood(null);
    }
  }

  // Marking food as eaten runs the planner's own confirm, here on this page:
  // the pantry deduction, the choose-a-source step and the rating prompt.
  const confirmEntry = useEntryConfirm({
    allRecipes: kitchen?.recipes ?? [],
    allIngredients: kitchen?.ingredients ?? [],
    pantryItems: kitchen?.pantry ?? [],
    settings: kitchen?.settings ?? null,
    ready: !!kitchen,
    sized: kitchenPlan.sized,
    onConfirmed: (updated) => {
      if (event?.mealSlot) void loadFood(updated.date, event.mealSlot);
      // What it used has left the pantry.
      getPantryItems()
        .then((pantry) => setKitchen((prev) => prev && { ...prev, pantry }))
        .catch(() => {});
    },
  });

  function markEaten(entryId: string) {
    const entry = slotEntries.find((e) => e._id === entryId);
    // (If the pantry is still loading, the confirm waits for it.)
    if (entry) confirmEntry.confirm(entry, true);
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getCalendarEvent(id), getCalendars()])
        .then(([loaded, calendars]) => {
          if (cancelled) return;
          setEvent(loaded);
          setCalendar(calendars.find((c) => c._id === loaded.calendar) ?? null);
          if (loaded.mealSlot) {
            void loadFood(date ?? loaded.date, loaded.mealSlot, () => cancelled);
            // Fresh each visit: the pantry may have changed since.
            Promise.all([getRecipes(), getIngredients(), getPantryItems(), loadSettings()])
              .then(([recipes, ingredients, pantry, settings]) => {
                if (!cancelled) setKitchen({ recipes, ingredients, pantry, settings });
              })
              .catch(() => {});
          }
        })
        .catch(() => {
          if (!cancelled) Alert.alert("Couldn't load event", undefined, [{ text: "OK", onPress: () => router.back() }]);
        })
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id, date, router]),
  );

  if (loading || !event) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={o && { backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o?.muted ?? "#2563EB"} />
      </SafeAreaView>
    );
  }

  // (Orbit's look: a card, a hairline, and the soft red of something to
  // delete.)
  const card = o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  const line = o && { borderColor: o.border };
  const dangerTint = dark ? "rgba(248,113,113,0.14)" : "#FEF2F2";

  const occurrence = date ?? event.date;
  const span = daysBetween(event.date, event.endDate);
  const occurrenceEnd = addDays(occurrence, span);
  const color = calendarColor(calendar);
  const duration = span * 1440 + event.endMinutes - event.startMinutes;

  async function remove(scope: SeriesScope) {
    try {
      await deleteCalendarEvent(id, scope, occurrence);
      router.back();
    } catch (error) {
      Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  // Adding food hands over to the planner's add sheet for this day and
  // meal; coming back here reloads the food.
  function openPlanner(action?: { add?: MealType }) {
    router.navigate({
      pathname: "/planner",
      params: { date: occurrence, from: "calendar", t: String(Date.now()), ...action },
    });
  }

  function markNotEaten(entryId: string) {
    const slot = event?.mealSlot;
    // Puts back what it took from the pantry.
    unconfirmMealPlanEntry(entryId).then(
      () => slot && loadFood(occurrence, slot),
      (error) => Alert.alert("Couldn't update", error instanceof Error ? error.message : "Something went wrong."),
    );
  }

  // The swipe-to-delete button. A usual meal asks how much to remove.
  function confirmRemove(item: MealFood["items"][number]) {
    const slot = event?.mealSlot;
    if (!slot) return;
    const reload = () => loadFood(occurrence, slot);
    const fail = (error: unknown) =>
      Alert.alert("Couldn't remove", error instanceof Error ? error.message : "Something went wrong.");
    if (item.usual) {
      const usualId = item.usual;
      Alert.alert(`Remove ${item.name}?`, "This is one of your usual meals.", [
        { text: "Cancel", style: "cancel" },
        { text: "Just this day", onPress: () => void deleteMealPlanEntry(item.id).then(reload, fail) },
        {
          text: "This day and every one after",
          style: "destructive",
          onPress: () => void stopUsualMeal(usualId, occurrence).then(reload, fail),
        },
      ]);
      return;
    }
    Alert.alert("Remove item", "Remove this item from the plan?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void deleteMealPlanEntry(item.id).then(reload, fail) },
    ]);
  }

  function foodActions(item: MealFood["items"][number]) {
    const slot = event?.mealSlot;
    if (!slot) return;
    const reload = () => loadFood(occurrence, slot);
    const fail = (error: unknown) =>
      Alert.alert("Couldn't update", error instanceof Error ? error.message : "Something went wrong.");
    showActions(item.name, [
      item.eaten
        ? {
            label: "Mark as not eaten",
            onPress: () => markNotEaten(item.id),
          }
        : { label: "Mark as eaten", onPress: () => markEaten(item.id) },
      ...(item.usual
        ? [
            {
              // The usual carries on; this day is skipped.
              label: "Remove just this day",
              destructive: true,
              onPress: () => void deleteMealPlanEntry(item.id).then(reload, fail),
            },
            {
              label: "Stop having this from this day on",
              destructive: true,
              onPress: () => void stopUsualMeal(item.usual!, occurrence).then(reload, fail),
            },
          ]
        : [
            // (After the menu has gone: iOS can't present over it.)
            { label: "Have this every week…", onPress: () => setTimeout(() => setRepeating(item), 350) },
            {
              label: "Remove from this meal",
              destructive: true,
              onPress: () => void deleteMealPlanEntry(item.id).then(reload, fail),
            },
          ]),
    ]);
  }

  // A regular meal (from the Meals calendar's times) can only be changed a
  // day at a time here; the series is changed in the meal times.
  const regularMeal = !!event.mealAuto && !!event.repeat;

  function confirmDelete() {
    if (regularMeal) {
      Alert.alert("Skip this meal?", "Only this day's block is removed. To stop it every week, change your meal times.", [
        { text: "Cancel", style: "cancel" },
        { text: "Skip this day", style: "destructive", onPress: () => void remove("one") },
      ]);
      return;
    }
    if (event?.repeat) {
      showActions("Delete repeating event", [
        { label: "Delete this event", destructive: true, onPress: () => void remove("one") },
        { label: "Delete this and following events", destructive: true, onPress: () => void remove("following") },
        { label: "Delete all events in the series", destructive: true, onPress: () => void remove("all") },
      ]);
      return;
    }
    Alert.alert("Delete event?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove("all") },
    ]);
  }

  // A repeating event asks which occurrences the edit is for first.
  function startEdit() {
    const open = (scope?: SeriesScope) =>
      router.push({ pathname: "/calendar/edit", params: { id, occurrence, ...(scope ? { scope } : {}) } });
    if (!event?.repeat) {
      open();
      return;
    }
    if (regularMeal) {
      open("one");
      return;
    }
    showActions("Edit repeating event", [
      { label: "Only this event", onPress: () => open("one") },
      { label: "This and following events", onPress: () => open("following") },
      { label: "All events in the series", onPress: () => open("all") },
    ]);
  }

  // What the event is for: a meal's food, or a session's prep and shopping.
  const purpose = (
    <>
        {/* A prep session or shopping trip: what it's for, from the plan. */}
        {!!event.kitchenKind && (
          <View className="mb-3">
            <KitchenSessionNeeds eventId={event._id} date={date ?? event.date} kind={event.kitchenKind} />
          </View>
        )}

        {/* Food from the planner */}
        {event.mealSlot && (
          <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white" style={card}>
            <View className="flex-row items-center px-4 pb-1 pt-3.5">
              <Ionicons name="restaurant-outline" size={18} color={o?.muted ?? "#64748B"} />
              <Text className="ml-2 flex-1 text-base font-semibold text-slate-900" style={o && { color: o.text }}>Food</Text>
              {!!food && (
                <Text className="mr-3 text-sm font-semibold text-slate-700" style={o && { color: o.muted }}>{Math.round(food.nutrition.calories ?? 0)} kcal</Text>
              )}
              {/* (Suggestions are only worked out from today on.) */}
              {occurrence >= todayStr() && <SuggestionsToggle on={showSuggestions} onPress={toggleSuggestions} />}
            </View>
            {food === undefined ? (
              <ActivityIndicator className="my-4" color={o?.muted ?? "#2563EB"} />
            ) : !food ? (
              <Text className="px-4 pb-3 pt-1 text-sm text-slate-500" style={o && { color: o.muted }}>Nothing planned for this meal yet.</Text>
            ) : (
              <>
                {food.items.map((item) => {
                  const entry = slotEntries.find((e) => e._id === item.id);
                  return (
                    <FoodRow
                      key={item.id}
                      item={item}
                      // A planned recipe or ingredient can be rated as it's confirmed.
                      canRate={!item.eaten && !!entry && !!(entry.recipe || entry.ingredient)}
                      onToggleEaten={() => (item.eaten ? markNotEaten(item.id) : markEaten(item.id))}
                      onRate={() => entry && confirmEntry.openRateAndConfirm(entry)}
                      onDelete={() => confirmRemove(item)}
                      onMenu={() => foodActions(item)}
                    />
                  );
                })}
                <View className="flex-row border-t border-slate-100 px-4 py-3" style={line}>
                  <Macro label="Protein" nutrient="protein" value={food.nutrition.protein} />
                  <Macro label="Carbs" nutrient="carbs" value={food.nutrition.carbs} />
                  <Macro label="Fat" nutrient="fats" value={food.nutrition.fats} />
                </View>
              </>
            )}
            {/* What's suggested for this meal — or, with a main planned, to go with it. */}
            {food !== undefined && (
              <MealSuggestion
                suggested={suggested}
                slot={event.mealSlot}
                className="mx-3 mb-3 mt-1"
                onPlanned={() => {
                  const slot = event.mealSlot;
                  if (slot) void loadFood(occurrence, slot);
                }}
              />
            )}
            <View className="flex-row border-t border-slate-100" style={line}>
              <Tap
                onPress={() => event.mealSlot && openPlanner({ add: event.mealSlot })}
                className="flex-1 flex-row items-center justify-center py-3.5 active:bg-slate-50"
                pressedStyle={o ? { backgroundColor: o.pill } : {}}
              >
                <Ionicons name="add-circle-outline" size={18} color={o?.ink ?? "#1D4ED8"} />
                <Text className="ml-1.5 font-semibold text-blue-700" style={o && { color: o.ink }}>Add food</Text>
              </Tap>
              <Tap
                onPress={() => openPlanner()}
                className="flex-1 flex-row items-center justify-center border-l border-slate-100 py-3.5 active:bg-slate-50"
                style={line}
                pressedStyle={o ? { backgroundColor: o.pill } : {}}
              >
                <Text className="font-semibold text-slate-700" style={o && { color: o.icon }}>Open planner</Text>
                <Ionicons name="chevron-forward" size={16} color={o?.muted ?? "#475569"} style={{ marginLeft: 4 }} />
              </Tap>
            </View>
          </View>
        )}
    </>
  );

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={[{ backgroundColor: o.canvas }, wide && { width: "100%", maxWidth: 1180, alignSelf: "center" }]}>
      {/* Nav bar: round buttons on the page itself (the title's the large
          one in the page) */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4 }}>
        <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
          <Ionicons name="chevron-back" size={22} color={o.text} />
        </Tap>
        <View style={{ flex: 1 }} />
        <Tap onPress={startEdit} accessibilityLabel="Edit event" style={{ height: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: o.ink }} pressedStyle={{ opacity: 0.8 }}>
          <Ionicons name="create-outline" size={17} color={o.onInk} />
          <Text style={{ fontSize: 15, fontWeight: "600", color: o.onInk }}>Edit</Text>
        </Tap>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 48 }}>
        {/* The event's title as the page's large one, and its calendar under it. */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>{event.title}</Text>
          <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: color }} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: o.muted }}>{calendar?.name ?? "Calendar"}</Text>
          </View>
        </View>
        {/* (In a desktop browser: what the event is on the left, what it's
            for — the food, or the session's prep and shopping — on the right.) */}
        <View style={wide ? { flexDirection: "row", alignItems: "flex-start", gap: 16 } : undefined}>
          <View style={wide ? { flex: 2, minWidth: 0 } : undefined}>
        {/* Summary */}
        <View className="mb-3 flex-row rounded-3xl border border-slate-200 bg-white p-4" style={card}>
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(color, dark ? 0.22 : 0.15) }}>
            <View className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
          </View>
          <View className="ml-3 flex-1" style={o && { justifyContent: "center" }}>
            <Text className="mt-1.5 text-base text-slate-700" style={o && { marginTop: 0, fontWeight: "600", color: o.text }}>{longDateLabel(occurrence)}</Text>
            {event.allDay ? (
              <Text className="mt-0.5 text-base text-slate-500" style={o && { color: o.muted }}>
                {span === 0 ? "All day" : `All day, until ${shortDateLabel(occurrenceEnd)}`}
              </Text>
            ) : (
              <Text className="mt-0.5 text-base text-slate-500" style={o && { color: o.muted }}>
                {minutesLabel(event.startMinutes)} → {minutesLabel(event.endMinutes)}
                {span > 0 ? ` ${shortDateLabel(occurrenceEnd)}` : ""} ({durationLabel(duration)})
              </Text>
            )}
            {event.seriesId && !event.repeat && (
              <View className="mt-1.5 flex-row items-center">
                <Ionicons name="git-branch-outline" size={15} color={o?.muted ?? "#64748B"} />
                <Text className="ml-1.5 flex-1 text-sm text-slate-500" style={o && { color: o.muted }}>Changed from its repeating series</Text>
              </View>
            )}
            {event.repeat && (
              <View className="mt-1.5 flex-row items-center">
                <Ionicons name="repeat" size={15} color={o?.muted ?? "#64748B"} />
                <Text className="ml-1.5 flex-1 text-sm text-slate-500" style={o && { color: o.muted }}>{repeatLabel(event.repeat, event.date)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Details */}
        <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white" style={card}>
          {!!event.location && (
            <Detail icon="location-outline">
              <Text className="text-base text-slate-900" style={o && { color: o.text }}>{event.location}</Text>
            </Detail>
          )}
          {!!event.description && (
            <Detail icon="reorder-three-outline">
              <Text className="text-base leading-6 text-slate-700" style={o && { color: o.icon }}>{event.description}</Text>
            </Detail>
          )}
          <Detail icon="notifications-outline">
            <Text className="text-base text-slate-900" style={o && { color: o.text }}>{remindLabel(event.remindMinutes)}</Text>
          </Detail>
          <Detail icon="calendar-outline" last>
            <View className="flex-row items-center">
              <View className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <Text className="text-base text-slate-900" style={o && { color: o.text }}>{calendar?.name ?? "Calendar"}</Text>
            </View>
          </Detail>
        </View>
          {!wide && purpose}
        {regularMeal && (
          <Tap
            onPress={() => router.push("/calendar/meal-times")}
            className="mb-3 flex-row items-center rounded-2xl bg-blue-50 px-4 py-3 active:bg-blue-100"
            style={o && { backgroundColor: o.accentSoft, borderRadius: 16 }}
            pressedStyle={o ? { opacity: 0.8 } : {}}
          >
            <Ionicons name="time-outline" size={18} color={o?.accent ?? "#1D4ED8"} />
            <Text className="ml-2 flex-1 text-sm text-blue-900" style={o && { color: o.icon }}>
              This is one of your regular meal times. Editing here changes this day only.
            </Text>
            <Text className="text-sm font-semibold text-blue-700" style={o && { color: o.accent }}>Change times</Text>
          </Tap>
        )}

        <Tap
          onPress={confirmDelete}
          className="items-center rounded-2xl border border-red-200 bg-red-50 py-3.5 active:bg-red-100"
          style={o && { backgroundColor: dangerTint, borderColor: dangerTint, borderRadius: 16 }}
          pressedStyle={o ? { opacity: 0.75 } : {}}
        >
          <Text className="font-semibold text-red-600" style={o && { color: o.danger }}>{regularMeal ? "Skip this day" : "Delete event"}</Text>
        </Tap>
          </View>
          {wide && <View style={{ flex: 3, minWidth: 0 }}>{purpose}</View>}
        </View>
      </ScrollView>

      {confirmEntry.modals}

      <RepeatDaysSheet
        visible={!!repeating}
        title={`Have ${repeating?.name ?? "this"} every week`}
        subtitle={`It will be added to your planner as planned ${event.mealSlot ?? "meal"} on these days, two weeks ahead.`}
        initialDays={[parseLocalDate(occurrence).getDay()]}
        weekStartDay={kitchen?.settings.weekStartDay ?? 1}
        confirmLabel="Add as usual"
        onCancel={() => setRepeating(null)}
        onConfirm={(days) => {
          const item = repeating;
          setRepeating(null);
          if (!item || !event.mealSlot) return;
          const slot = event.mealSlot;
          makeUsualFromEntry(item.id, days).then(
            () => loadFood(occurrence, slot),
            (error) => Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong."),
          );
        }}
      />
    </SafeAreaView>
    </OrbitPage>
  );
}

// (Inside the page: in Orbit's colours on a phone, the older look elsewhere.)
function Detail({ icon, children, last = false }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode; last?: boolean }) {
  const o = useOrbitPage();
  return (
    <View className={`flex-row items-start px-4 py-3.5 ${last ? "" : "border-b border-slate-100"}`} style={o && { borderColor: o.border }}>
      <Ionicons name={icon} size={20} color={o?.muted ?? "#64748B"} style={{ marginTop: 1 }} />
      <View className="ml-3 flex-1">{children}</View>
    </View>
  );
}

// One of the meal's macros (on a phone, by its nutrient's colour).
function Macro({ label, nutrient, value }: { label: string; nutrient: MainNutrient; value: number | null | undefined }) {
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  return (
    <View className="flex-1 items-center">
      <Text className="text-sm font-semibold text-slate-900" style={o && { color: o.text }}>{Math.round(value ?? 0)} g</Text>
      <View className="flex-row items-center">
        {o && <View style={{ width: 6, height: 6, borderRadius: 3, marginRight: 5, backgroundColor: nutrientColor(nutrient, dark) }} />}
        <Text className="text-xs text-slate-500" style={o && { color: o.muted }}>{label}</Text>
      </View>
    </View>
  );
}

// One food in a meal, swiped like a row in the planner: right to reveal
// delete, left to reveal confirm (with "Rate" for a planned recipe or
// ingredient) or unconfirm. The circle and the row's menu do the same jobs
// by tap.
function FoodRow({
  item,
  canRate,
  onToggleEaten,
  onRate,
  onDelete,
  onMenu,
}: {
  item: MealFood["items"][number];
  canRate: boolean;
  onToggleEaten: () => void;
  onRate: () => void;
  onDelete: () => void;
  onMenu: () => void;
}) {
  const swipe = useRef<SwipeableMethods | null>(null);
  const o = useOrbitPage();
  const then = (action: () => void) => () => {
    swipe.current?.close();
    action();
  };

  return (
    <View className="border-t border-slate-100" style={o && { borderColor: o.border }}>
      <ReanimatedSwipeable
        ref={swipe}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
        renderLeftActions={() => (
          <Pressable
            className="w-20 items-center justify-center bg-red-500 active:bg-red-600"
            onPress={then(onDelete)}
            accessibilityLabel={`Remove ${item.name}`}
          >
            <Ionicons name="trash-outline" size={20} color="white" />
          </Pressable>
        )}
        renderRightActions={() => (
          <View className="flex-row">
            {canRate && (
              <Pressable className="w-20 items-center justify-center bg-blue-600 active:opacity-80" style={o && { backgroundColor: o.ink }} onPress={then(onRate)}>
                <Ionicons name="star-outline" size={20} color={o?.onInk ?? "white"} />
                <Text className="mt-1 text-[10px] font-semibold text-white" style={o && { color: o.onInk }}>Rate</Text>
              </Pressable>
            )}
            <Pressable
              className="w-20 items-center justify-center active:opacity-80"
              style={{ backgroundColor: item.eaten ? "#94A3B8" : "#10B981" }}
              onPress={then(onToggleEaten)}
            >
              <Ionicons name={item.eaten ? "time-outline" : "checkmark-circle-outline"} size={20} color="white" />
              <Text className="mt-1 text-[10px] font-semibold text-white">{item.eaten ? "Unconfirm" : "Confirm"}</Text>
            </Pressable>
          </View>
        )}
      >
        <View className="flex-row items-center bg-white pl-2 pr-4" style={o && { backgroundColor: o.surface }}>
          <Pressable
            hitSlop={6}
            onPress={onToggleEaten}
            accessibilityLabel={item.eaten ? `Mark ${item.name} as not eaten` : `Mark ${item.name} as eaten`}
            className="h-11 w-10 items-center justify-center active:opacity-60"
          >
            <Ionicons
              name={item.eaten ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={item.eaten ? (o?.success ?? "#16A34A") : (o?.faint ?? "#94A3B8")}
            />
          </Pressable>
          <Pressable onPress={onMenu} className="flex-1 flex-row items-center py-3 active:opacity-60">
            <Text className="ml-1 flex-1 text-base text-slate-900" style={o && { color: o.text }} numberOfLines={2}>
              {item.name}
              {/* One of your usual meals. */}
              {item.usual ? "  " : ""}
              {item.usual && <Ionicons name="repeat" size={14} color={o?.accent ?? "#2563EB"} />}
            </Text>
            <Text className="text-sm text-slate-500" style={o && { color: o.muted }}>{item.kcal} kcal</Text>
            <Ionicons name="ellipsis-horizontal" size={16} color={o?.faint ?? "#CBD5E1"} style={{ marginLeft: 8 }} />
          </Pressable>
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}
