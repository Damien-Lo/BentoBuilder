import "../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider
      value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
    >
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />

        {/* Settings section — its own tab group, one tab per app area */}
        <Stack.Screen
          name="settings-section"
          options={{
            headerShown: false,
          }}
        />

        {/* Goals — starting/goal weight targets */}
        <Stack.Screen
          name="health/goals"
          options={{
            headerShown: false,
          }}
        />

        {/* All Nutrients — every tracked nutrient for a day, plus their goals */}
        <Stack.Screen
          name="health/nutrients"
          options={{
            headerShown: false,
          }}
        />

        {/* Weight & Measurements — weigh-in log and progress */}
        <Stack.Screen
          name="health/weight"
          options={{
            headerShown: false,
          }}
        />

        {/* My Weekly Report — weekly nutrition & weight summary */}
        <Stack.Screen
          name="health/weekly-report"
          options={{
            headerShown: false,
          }}
        />

        {/* Storage location detail — lists all pantry items in that location */}
        <Stack.Screen
          name="pantry/location/[id]"
          options={{
            headerShown: false,
          }}
        />

        {/* Add an existing ingredient to the pantry */}
        <Stack.Screen
          name="pantry/add_by_ingredient"
          options={{
            headerShown: false,
          }}
        />

        {/* Create a standalone ingredient manually */}
        <Stack.Screen
          name="ingredients/add_manual"
          options={{
            headerShown: false,
          }}
        />

        {/* Edit an existing ingredient */}
        <Stack.Screen
          name="ingredients/edit/[id]"
          options={{
            headerShown: false,
          }}
        />

        {/* Edit an existing pantry item */}
        <Stack.Screen
          name="pantry/edit/[id]"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="recipes/add"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="recipes/[id]"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="recipes/edit/[id]"
          options={{
            headerShown: false,
          }}
        />

        {/* Grocery list — reached from the Pantry/Kitchen tabs, not its own tab */}
        <Stack.Screen
          name="grocery-list"
          options={{
            headerShown: false,
          }}
        />

        {/* Review a scanned receipt before its items are added to the pantry */}
        <Stack.Screen
          name="receipts/review"
          options={{
            headerShown: false,
          }}
        />

        {/* Meals (course/bento composites) */}
        <Stack.Screen
          name="meals/add"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="meals/[id]"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="meals/edit/[id]"
          options={{
            headerShown: false,
          }}
        />

        {/* Restaurant meals — logged eating-out visits */}
        <Stack.Screen
          name="restaurant-meals"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="restaurant-meals/add"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="restaurant-meals/[id]"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="restaurant-meals/edit/[id]"
          options={{
            headerShown: false,
          }}
        />

        {/* Developer — data-quality reports for fixable-but-not-broken items */}
        <Stack.Screen
          name="developer/home"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="developer/ingredients"
          options={{
            headerShown: false,
          }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}