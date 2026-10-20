import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GroceryList } from "@/app/grocery-list";
import { SegmentedToggle } from "@/src/components/forms";
import { WebPrepShoppingScreen } from "@/src/components/planner/web/PrepShopping";

// Kitchen → Plan: getting ready for the meals planned — the grocery list,
// and prep & shopping (what to make ahead and buy, the sessions booked for
// it, what's wrong with the plan, and the kitchen's tasks for the week).
// Whichever was open last opens again.
type Part = "grocery" | "prep";
const KEY = "kitchen.plan.view";

export default function PlanTab() {
  const [view, setView] = useState<Part>("grocery");
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => (saved === "grocery" || saved === "prep") && setView(saved))
      .catch(() => {});
  }, []);
  function choose(next: Part) {
    setView(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="px-4 pb-1 pt-1">
        <SegmentedToggle<Part>
          value={view}
          options={[
            { value: "grocery", label: "Grocery list" },
            { value: "prep", label: "Prep & shopping" },
          ]}
          onChange={choose}
        />
      </View>
      <View className="flex-1">{view === "grocery" ? <GroceryList inTabs /> : <WebPrepShoppingScreen inTabs />}</View>
    </SafeAreaView>
  );
}
