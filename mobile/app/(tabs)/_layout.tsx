import { Tabs } from "expo-router";
import React from "react";

import { Ionicons } from "@expo/vector-icons";
import { CustomTabBar } from "@/src/components/CustomTabBar";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      initialRouteName="planner"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="planner"
        options={{
          title: "Planner",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="calendar-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="RecipesMainPage"
        options={{
          title: "Kitchen",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="restaurant-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="PantryMainPage"
        options={{
          title: "Pantry",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="basket-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: "Nutrition",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="pie-chart-outline" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
