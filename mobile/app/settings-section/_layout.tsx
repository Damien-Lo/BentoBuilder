import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { CustomTabBar } from "@/src/components/CustomTabBar";

export default function SettingsSectionLayout() {
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      initialRouteName="kitchen"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="kitchen"
        options={{
          title: "Kitchen",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="restaurant-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scheduling"
        options={{
          title: "Scheduling",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="time-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="home-planning"
        options={{
          title: "Home Planning",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="home-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="document-text-outline" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
