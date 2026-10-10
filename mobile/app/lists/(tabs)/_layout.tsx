import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { CustomTabBar } from "@/src/components/CustomTabBar";

// The Lists section: the same bottom bar as Kitchen (two tabs either side
// of the centre home button).
export default function ListsSectionLayout() {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Overview",
          tabBarIcon: ({ color }) => <Ionicons size={24} name="speedometer-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Lists",
          tabBarIcon: ({ color }) => <Ionicons size={24} name="list-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="checklists"
        options={{
          title: "Checklists",
          tabBarIcon: ({ color }) => <Ionicons size={24} name="checkbox-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: "Shopping",
          tabBarIcon: ({ color }) => <Ionicons size={24} name="cart-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
