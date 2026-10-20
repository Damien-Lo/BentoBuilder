import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";

import { CustomTabBar } from "@/src/components/CustomTabBar";

// The Kitchen on the phone: four tabs, two either side of the orb — Log
// (what's eaten and planned, day by day), Recipes, Pantry, and Plan (the
// grocery list, and prep & shopping).
export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} initialRouteName="planner" screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="planner" options={{ title: "Log", tabBarIcon: ({ color }) => <Ionicons size={26} name="journal-outline" color={color} /> }} />
      <Tabs.Screen name="RecipesMainPage" options={{ title: "Recipes", tabBarIcon: ({ color }) => <Ionicons size={26} name="restaurant-outline" color={color} /> }} />
      <Tabs.Screen name="PantryMainPage" options={{ title: "Pantry", tabBarIcon: ({ color }) => <Ionicons size={26} name="basket-outline" color={color} /> }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: ({ color }) => <Ionicons size={26} name="clipboard-outline" color={color} /> }} />
      {/* Not tabs: the old Overview (its parts are now in Plan and on Home), and
          Nutrition — the Health section's, from Home. */}
      <Tabs.Screen name="overview" options={{ href: null, title: "Overview" }} />
      <Tabs.Screen name="health" options={{ href: null, title: "Nutrition" }} />
    </Tabs>
  );
}
