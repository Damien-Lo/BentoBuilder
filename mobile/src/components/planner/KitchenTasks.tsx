import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { addDays, minutesLabel, shortDateLabel } from "@/src/components/calendar/calendarUtils";
import type { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { API_BASE_URL } from "@/src/config/api";
import { getStorageLocations, type SelectOption } from "@/src/services/optionsApi";
import { getMoveSuggestion, takeOutPantryItem } from "@/src/services/pantryApi";
import type { KitchenIssue, KitchenTask } from "@/src/utils/planNeeds";

// What the kitchen needs doing: the tasks worked out from the plan (see
// utils/planNeeds.ts), each with the thing that does it. Nothing is ticked
// off as such — a task goes when what it's about has changed: the entry is
// in the fridge, the item is bought. (The one exception is a recipe's
// "start ahead" step, which nothing else records: that's ticked, and the
// tick remembered on the device.)
//
// Shared by the desktop pages and the phone planner.

type Plan = ReturnType<typeof usePlanNeeds>;

const ICONS: Record<KitchenTask["kind"], keyof typeof Ionicons.glyphMap> = {
  shop: "cart-outline",
  prep: "flame-outline",
  thaw: "snow-outline",
  ahead: "timer-outline",
  use: "hourglass-outline",
};

const DONE_KEY = "kitchen.tasks.done";

// Whether an ingredient is thawed before cooking or goes in frozen: asked
// once, by the first thaw task for it, and kept on the ingredient.
async function setCooksFromFrozen(ingredientId: string, cooksFromFrozen: boolean) {
  await fetch(`${API_BASE_URL}/api/ingredients/${ingredientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cooksFromFrozen }) });
}

export function KitchenTasks({
  plan,
  days = 1,
  onChanged,
}: {
  plan: Plan;
  // How many days past today to show.
  days?: number;
  // After a task changed something (the pantry, an ingredient): reload.
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { today } = plan;
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    getStorageLocations().then(setLocations).catch(() => {});
    AsyncStorage.getItem(DONE_KEY)
      .then((kept) => {
        const list: unknown = JSON.parse(kept ?? "[]");
        if (Array.isArray(list)) setDone(list.filter((id): id is string => typeof id === "string"));
      })
      .catch(() => {});
  }, []);

  const place = (pattern: RegExp) => locations.find((l) => pattern.test(l.name));
  const changed = () => {
    plan.reload();
    onChanged?.();
  };
  const fail = (error: unknown) => Alert.alert("Couldn't do that", error instanceof Error ? error.message : "Something went wrong.");

  // Out of the freezer, or into it: the entry (or just the amount wanted)
  // moves, with the date that ingredient usually gets there.
  async function move(task: KitchenTask, to: SelectOption | undefined, part: boolean) {
    if (!task.pantryItemId || !to || busy) return;
    try {
      setBusy(task.id);
      const suggestion = await getMoveSuggestion(task.pantryItemId, { to: to._id }, today);
      await takeOutPantryItem(task.pantryItemId, { storageLocation: to._id, expiryDate: suggestion.expiryDate, ...(part ? { amount: task.amount, unit: task.unit } : {}) });
      if (task.asks && task.ingredientId) await setCooksFromFrozen(task.ingredientId, false);
      Alert.alert(`In the ${to.name.toLowerCase()}`, `Good until ${shortDateLabel(suggestion.expiryDate)} (${suggestion.days} day${suggestion.days === 1 ? "" : "s"}, ${suggestion.learned ? "what you've given it before" : "a usual figure"}). Change the date on the pantry entry if that's not right.`);
      changed();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }

  async function fromFrozen(task: KitchenTask) {
    if (!task.ingredientId || busy) return;
    try {
      setBusy(task.id);
      await setCooksFromFrozen(task.ingredientId, true);
      changed();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  }

  function tick(task: KitchenTask) {
    setDone((prev) => {
      const next = [...prev.slice(-80), task.id];
      AsyncStorage.setItem(DONE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  const until = addDays(today, days);
  const tasks = plan.tasks.filter((t) => t.date <= until && !done.includes(t.id));
  if (!plan.ready) return <View style={{ height: 12 }} />;
  if (!tasks.length) {
    return <Text className="px-[18px] pb-4 text-sm text-slate-500">Nothing to do {days === 0 ? "today" : days === 1 ? "today or tomorrow" : "in the days ahead"}.</Text>;
  }

  const when = (task: KitchenTask) => {
    const day = task.date === today ? "Today" : task.date === addDays(today, 1) ? "Tomorrow" : shortDateLabel(task.date);
    const time = task.minutes != null ? ` ${minutesLabel(((task.minutes % 1440) + 1440) % 1440)}` : task.kind === "thaw" && !task.late ? " evening" : "";
    return `${day}${time}`;
  };

  return (
    <View className="pb-2">
      {tasks.map((task) => (
        <View key={task.id} className="flex-row px-[18px] py-2">
          <Ionicons name={ICONS[task.kind]} size={17} color={task.late ? "#DC2626" : "#2563EB"} style={{ marginTop: 2 }} />
          <View className="ml-2.5 flex-1">
            <Text className="text-sm font-semibold text-slate-900">{task.title}</Text>
            <Text className={`mt-0.5 text-xs ${task.late ? "text-red-600" : "text-slate-500"}`}>
              {when(task)} · {task.late ? "still frozen: thaw it sealed in cold water, about an hour · " : ""}
              {task.detail}
            </Text>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {task.kind === "thaw" && (
                <>
                  <Action label={busy === task.id ? "Moving…" : "Moved to the fridge"} primary onPress={() => void move(task, place(/fridge|refriger/i), true)} />
                  {/* Not known yet for this ingredient: the other answer. */}
                  {task.asks && <Action label="I cook it from frozen" onPress={() => void fromFrozen(task)} />}
                </>
              )}
              {task.kind === "use" && (
                <>
                  <Action label={busy === task.id ? "Moving…" : "Froze it"} primary onPress={() => void move(task, place(/freez/i), false)} />
                  {!!task.pantryItemId && <Action label="Open" onPress={() => router.push({ pathname: "/pantry/edit/[id]", params: { id: task.pantryItemId! } })} />}
                </>
              )}
              {task.kind === "shop" && <Action label="Grocery list" onPress={() => router.push("/grocery-list")} />}
              {(task.kind === "shop" || task.kind === "prep") && !!task.sessionId && (
                <Action label="Open session" onPress={() => router.push({ pathname: "/calendar/event/[id]", params: { id: task.sessionId!.split("|")[0], date: task.sessionId!.split("|")[1] } })} />
              )}
              {task.kind === "ahead" && (
                <>
                  <Action label="Done" primary onPress={() => tick(task)} />
                  {!!task.recipeId && <Action label="Recipe" onPress={() => router.push({ pathname: "/recipes/[id]", params: { id: task.recipeId! } })} />}
                </>
              )}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// What's wrong with the plan as it stands. (`onPress`: where the detail is.)
export function KitchenIssues({ issues, onPress }: { issues: KitchenIssue[]; onPress?: () => void }) {
  return (
    <View className="pb-2">
      {issues.map((issue) => (
        <Pressable key={issue.id} onPress={onPress} disabled={!onPress} className="flex-row px-[18px] py-2 active:opacity-60">
          <Ionicons name="alert-circle-outline" size={17} color={issue.kind === "past-date" ? "#D97706" : "#DC2626"} style={{ marginTop: 2 }} />
          <View className="ml-2.5 flex-1">
            <Text className="text-sm font-semibold text-slate-900">{issue.title}</Text>
            <Text numberOfLines={2} className="mt-0.5 text-xs text-slate-500">
              {issue.detail}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} className={`rounded-lg px-2.5 py-1 ${primary ? "bg-blue-600 active:bg-blue-700" : "bg-slate-100 active:bg-slate-200"}`}>
      <Text className={`text-xs font-semibold ${primary ? "text-white" : "text-slate-700"}`}>{label}</Text>
    </Pressable>
  );
}
