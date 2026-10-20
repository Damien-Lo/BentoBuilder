import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { SidePicker } from "@/src/components/planner/SidePicker";
import { OrbSphere } from "@/src/components/ui/OrbSphere";
import { useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import type { useSuggestionWatch } from "@/src/components/planner/useSuggestionWatch";
import type { MealPlanEntry, MealSlot } from "@/src/services/mealPlanApi";
import type { Dish } from "@/src/utils/recommend";

// Whether the suggestion cards are on, on the phone: one switch for the
// planner and the calendar's meal events, remembered on the device.
export function useSuggestionsToggle(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem("planner.suggestions")
      .then((v) => setOn(v === "on"))
      .catch(() => {});
  }, []);
  const toggle = () =>
    setOn((was) => {
      AsyncStorage.setItem("planner.suggestions", was ? "off" : "on").catch(() => {});
      return !was;
    });
  return [on, toggle];
}

export function SuggestionsToggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  // On an Orbit page they're the assistant's — the orb's — not a purple
  // thing of their own.
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  if (o) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={on ? "Hide suggestions" : "Show suggestions"}
        style={{ flexDirection: "row", alignItems: "center", height: 32, paddingLeft: 6, paddingRight: 12, borderRadius: 16, backgroundColor: on ? o.accentSoft : o.pill }}
      >
        <View pointerEvents="none">
          <OrbSphere size={20} colors={o} dark={dark} />
        </View>
        <Text style={{ marginLeft: 7, fontSize: 13, fontWeight: "600", color: on ? o.accent : o.onPill }}>{on ? "Suggesting" : "Suggestions"}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={on ? "Hide suggestions" : "Show suggestions"}
      className={`flex-row items-center rounded-full px-3 py-1.5 ${on ? "bg-violet-600 active:bg-violet-700" : "bg-slate-100 active:bg-slate-200"}`}
    >
      <Ionicons name="sparkles" size={13} color={on ? "#FFFFFF" : "#7C3AED"} />
      <Text className={`ml-1.5 text-xs font-semibold ${on ? "text-white" : "text-violet-700"}`}>Suggestions</Text>
    </Pressable>
  );
}

// The suggestion for one meal, to take or leave: the main (unless it's what's
// already planned), its sides — each to swap or drop — and the plate's
// numbers. Nothing when there's no offer for the slot, or the cards are off.
export function MealSuggestion({
  suggested,
  slot,
  className = "",
  onPlanned,
}: {
  suggested: ReturnType<typeof useSuggestionWatch>;
  slot: MealSlot;
  className?: string;
  // The planned meals a taken suggestion became.
  onPlanned: (added: MealPlanEntry[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  // (On an Orbit page, in the assistant's blue.)
  const o = useOrbitPage();
  // The side being swapped — or, with no `from`, one being added.
  const [picking, setPicking] = useState<{ from: Dish | null; title: string } | null>(null);
  const up = suggested.offerFor(slot);
  if (!up) return null;
  const { offer } = up;

  async function plan() {
    if (busy) return;
    try {
      setBusy(true);
      onPlanned(await suggested.plan(slot));
    } catch (error) {
      Alert.alert("Couldn't add it", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className={`rounded-2xl border border-dashed border-violet-300 bg-violet-50 px-4 py-3 ${className}`} style={o && { backgroundColor: o.accentSoft, borderColor: o.selectedRing, borderRadius: 16 }}>
      {(offer.beside ? offer.sides : [offer.main, ...offer.sides]).map((dish, index) => {
        const isMain = !offer.beside && index === 0;
        return (
          <View key={dish.key} className={`flex-row items-center ${index ? "mt-1.5" : ""}`}>
            <Ionicons name={isMain ? "sparkles" : "add"} size={isMain ? 13 : 14} color={o?.accent ?? "#7C3AED"} />
            <Text numberOfLines={1} className={`ml-2 flex-1 text-violet-900 ${isMain ? "text-base font-semibold" : "text-sm"}`} style={o && { color: o.text }}>
              {dish.name}
            </Text>
            <Text className="ml-2 text-xs text-violet-600" style={o && { color: o.muted }}>{Math.round(dish.calories)} kcal</Text>
            {!isMain && (
              <Pressable onPress={() => setPicking({ from: dish, title: `Swap ${dish.name} for` })} accessibilityLabel={`Swap ${dish.name}`} hitSlop={6} className="ml-2 h-7 w-7 items-center justify-center rounded-full active:bg-violet-200">
                <Ionicons name="swap-horizontal" size={15} color={o?.accent ?? "#7C3AED"} />
              </Pressable>
            )}
            {!isMain && (
              <Pressable onPress={() => suggested.changeSide(slot, dish, null)} accessibilityLabel={`Drop ${dish.name}`} hitSlop={6} className="ml-1 h-7 w-7 items-center justify-center rounded-full active:bg-violet-200">
                <Ionicons name="close" size={14} color={o?.accent ?? "#7C3AED"} />
              </Pressable>
            )}
          </View>
        );
      })}
      <Text className="mt-2 text-xs text-violet-600" style={o && { color: o.muted }}>
        <Text className="font-semibold">
          {offer.beside ? "+" : ""}
          {Math.round(offer.calories)} kcal · P {Math.round(offer.protein)} g
        </Text>
        {offer.reasons[0] ? ` · ${offer.reasons[0]}` : ""}
      </Text>
      <View className="mt-3 flex-row items-center">
        <Pressable onPress={() => void plan()} accessibilityLabel="Plan it" className="flex-row items-center rounded-xl bg-violet-600 px-4 py-2 active:bg-violet-700" style={o && { backgroundColor: o.ink, borderRadius: 999 }}>
          <Ionicons name="checkmark" size={15} color={o?.onInk ?? "#FFFFFF"} />
          <Text className="ml-1.5 text-sm font-semibold text-white" style={o && { color: o.onInk }}>Plan</Text>
        </Pressable>
        <View className="flex-1" />
        {offer.sides.length < 3 && !!offer.main.recipe && (
          <Pressable onPress={() => setPicking({ from: null, title: `Add beside ${offer.main.name}` })} accessibilityLabel="Add a side" className="h-9 w-9 items-center justify-center rounded-full active:bg-violet-200">
            <Ionicons name="add" size={20} color={o?.muted ?? "#6D28D9"} />
          </Pressable>
        )}
        {up.more && !offer.beside && (
          <Pressable onPress={() => suggested.another(slot)} accessibilityLabel="Another" className="h-9 w-9 items-center justify-center rounded-full active:bg-violet-200">
            <Ionicons name="refresh" size={18} color={o?.muted ?? "#6D28D9"} />
          </Pressable>
        )}
        <Pressable onPress={() => suggested.dismiss(slot)} accessibilityLabel="No suggestion here" className="ml-1 h-9 w-9 items-center justify-center rounded-full active:bg-violet-200">
          <Ionicons name="close" size={18} color={o?.muted ?? "#6D28D9"} />
        </Pressable>
      </View>
      {picking && (
        <SidePicker
          title={picking.title}
          likely={suggested.likelySides(slot)}
          find={(query) => suggested.findSides(slot, query)}
          onPick={(dish) => {
            suggested.changeSide(slot, picking.from, dish);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </View>
  );
}
