import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { useOrbitPage } from "@/src/theme/orbit";
import { parseLocalDate } from "@/src/utils/mealPlan";
import { needAmountLabel, type BuyNeed, type PrepNeed } from "@/src/utils/planNeeds";

import { usePlanNeeds } from "./usePlanNeeds";

// What one prep session or shopping trip is for, on its event's page (the
// phone) or its preview card (the desktop calendar): everything the plan
// needs made, or bought, between this session and the next of its kind.
export function KitchenSessionNeeds({ eventId, date, kind, onNavigate }: { eventId: string; date: string; kind: "prep" | "shop"; onNavigate?: () => void }) {
  const router = useRouter();
  // (On an Orbit page — see theme/orbit.tsx — in its colours.)
  const o = useOrbitPage();
  const needs = usePlanNeeds();
  const id = `${eventId}|${date}`;
  const rows: (PrepNeed | BuyNeed)[] = kind === "prep" ? needs.prep.filter((n) => n.session === id) : needs.buy.filter((n) => n.session === id);
  const past = date < needs.today;

  const day = (value: string) => {
    const d = parseLocalDate(value);
    return value === needs.today ? "today" : `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`;
  };

  return (
    <View className="overflow-hidden rounded-3xl border border-slate-200 bg-white" style={o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 }}>
      <View className="flex-row items-center px-4 pb-1 pt-3.5">
        <Ionicons name={kind === "prep" ? "flame-outline" : "cart-outline"} size={18} color={o?.muted ?? "#64748B"} />
        <Text className="ml-2 flex-1 text-base font-semibold text-slate-900" style={o && { color: o.text }}>{kind === "prep" ? "To prep in this session" : "To buy on this trip"}</Text>
        {rows.length > 0 && <Text className="text-sm text-slate-400" style={o && { color: o.faint }}>{rows.length}</Text>}
      </View>
      <Text className="px-4 pb-2 text-xs leading-4 text-slate-500" style={o && { color: o.muted }}>
        {kind === "prep" ? "From your planned meals, up to the next prep session." : "What the plan and your prep need that the pantry is short of, up to the next trip."}
      </Text>
      {!needs.ready ? (
        <Text className="px-4 pb-4 text-sm text-slate-400" style={o && { color: o.faint }}>Working it out…</Text>
      ) : past ? (
        <Text className="px-4 pb-4 text-sm text-slate-400" style={o && { color: o.faint }}>This one has passed.</Text>
      ) : rows.length === 0 ? (
        <Text className="px-4 pb-4 text-sm text-slate-400" style={o && { color: o.faint }}>{kind === "prep" ? "Nothing planned needs prepping here." : "The pantry covers what's planned."}</Text>
      ) : (
        rows.map((need) => {
          const prep = "recipeId" in need ? need : null;
          return (
            <Pressable
              key={`${need.ingredientId}-${need.unit}`}
              disabled={!prep}
              onPress={() => {
                if (!prep) return;
                onNavigate?.();
                router.push({ pathname: "/recipes/[id]", params: { id: prep.recipeId } });
              }}
              className="flex-row items-center border-t border-slate-100 px-4 py-3 active:bg-slate-50"
              style={o && { borderTopColor: o.border }}
            >
              <View className="flex-1">
                <Text className="text-base font-medium text-slate-900" numberOfLines={1} style={o && { color: o.text }}>
                  {prep ? prep.recipeName : need.name}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1} style={o && { color: o.muted }}>
                  {prep
                    ? `${needAmountLabel(need.amount, need.unit)} of ${need.name}${Math.abs(prep.batches - 1) > 0.01 ? ` · ${Math.round(prep.batches * 10) / 10} batches` : ""}`
                    : needAmountLabel(need.amount, need.unit)}
                  {` · needed ${day(need.neededBy)}`}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-400" numberOfLines={1} style={o && { color: o.faint }}>
                  for {[...new Set(need.for.map((f) => f.label))].slice(0, 2).join(", ")}
                </Text>
              </View>
              {!!prep && <Ionicons name="chevron-forward" size={16} color={o?.faint ?? "#CBD5E1"} />}
            </Pressable>
          );
        })
      )}
    </View>
  );
}
