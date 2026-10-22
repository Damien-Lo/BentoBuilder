import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { CustomTabBar } from "@/src/components/CustomTabBar";
import { OrbitSection } from "@/src/theme/orbit";

// The Gym section: the same bottom bar as the Kitchen and Tasks — two tabs
// either side of the orb. Overview (training at a glance), Workouts (start
// a session, and the ones you've saved), Exercises (the library), and
// Progress (records, charts and history).
export default function GymSectionLayout() {
  return (
    // (Gym in its own black and white: its tabs, pages and orb.)
    <OrbitSection section="gym">
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Overview", tabBarIcon: ({ color }) => <Ionicons size={24} name="speedometer-outline" color={color} /> }} />
      <Tabs.Screen name="workouts" options={{ title: "Workouts", tabBarIcon: ({ color }) => <Ionicons size={24} name="barbell-outline" color={color} /> }} />
      <Tabs.Screen name="exercises" options={{ title: "Exercises", tabBarIcon: ({ color }) => <Ionicons size={24} name="body-outline" color={color} /> }} />
      <Tabs.Screen name="progress" options={{ title: "Progress", tabBarIcon: ({ color }) => <Ionicons size={24} name="stats-chart-outline" color={color} /> }} />
    </Tabs>
    </OrbitSection>
  );
}
