import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { minutesLabel } from "@/src/components/calendar/calendarUtils";
import { mealLine } from "@/src/components/calendar/mealFood";
import { getGroceryItems, type GroceryItem } from "@/src/services/groceryListApi";
import type { OrbitColors } from "@/src/theme/orbit";

import { pageParts, PagedCard, type CardPage } from "./PagedCard";
import type { Today } from "./useToday";

// The home screen's Kitchen card, a page at a time: today's meals (each
// with its time and what's in it, ticked once eaten), what's expiring in the pantry, and the grocery list. Each opens its
// page in the Kitchen.

export function KitchenPages({ t, go, colors: c }: { t: Today; go: (route: Href) => void; colors: OrbitColors }) {
  const [groceries, setGroceries] = useState<GroceryItem[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      getGroceryItems().then(setGroceries, () => setGroceries([]));
    }, []),
  );
  const { big, line, row } = pageParts(c);
  const eaten = t.meals.filter((e) => e.meal?.food?.eaten).length;
  const toBuy = (groceries ?? []).filter((g) => g.status === "toBuy");
  const expiryText = (date: string | null | undefined) => {
    const day = (date ?? "").slice(0, 10);
    return day < t.today ? "past its date" : day === t.today ? "today" : day.slice(5).split("-").reverse().join("/");
  };

  const pages: CardPage[] = [
    {
      title: "Meals",
      route: "/planner" as Href,
      body: t.meals.length ? (
        <>
          {big(`${t.meals.length}`, `meal${t.meals.length === 1 ? "" : "s"} today${eaten ? ` · ${eaten} eaten` : ""}`)}
          {t.meals.map((e) => {
            const done = !!e.meal?.food?.eaten;
            return (
              <View key={`${e._id}-${e.occurrenceDate}`} style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
                <Ionicons name={done ? "checkmark-circle" : "restaurant-outline"} size={17} color={done ? c.success : c.muted} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: c.text }} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={{ fontSize: 12.5, color: c.muted }}>{minutesLabel(e.startMinutes)}</Text>
                  </View>
                  <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }} numberOfLines={1}>
                    {mealLine(e)}
                  </Text>
                </View>
              </View>
            );
          })}
        </>
      ) : (
        <>
          {big("—", "no meals today")}
          {line("Meal times come from the Calendar.", true)}
        </>
      ),
    },
    {
      title: "Pantry",
      route: "/PantryMainPage" as Href,
      body: (
        <>
          {big(String(t.expiring.length), `expiring soon`)}
          {t.expiring.length ? t.expiring.slice(0, 3).map((p) => row(p._id, "hourglass-outline", p.ingredient?.name ?? "Something", expiryText(p.expiryDate), c.warning)) : line("Nothing close to its date.", true)}
        </>
      ),
    },
    {
      title: "Groceries",
      route: "/grocery-list" as Href,
      body: (
        <>
          {big(groceries ? String(toBuy.length) : "—", "to buy")}
          {toBuy.length ? toBuy.slice(0, 3).map((g) => row(g._id, "cart-outline", g.name, g.quantity != null ? `${g.quantity} ${g.unit}`.trim() : undefined)) : line(groceries ? "Nothing on the list." : "Loading…", true)}
        </>
      ),
    },
  ];
  return <PagedCard pages={pages} go={go} colors={c} />;
}
