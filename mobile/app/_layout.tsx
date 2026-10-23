import "../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ServerGate } from "@/src/components/ServerGate";
import { AuthGate } from "@/src/components/auth/AuthGate";
import { HealthAutoSync } from "@/src/components/health/HealthAutoSync";
import { OrbitThemeProvider } from "@/src/theme/orbit";
import { OrbitStatusBar } from "@/src/theme/OrbitStatusBar";
import { WebAlertHost } from "@/src/components/web/WebAlert";
import { DataBadge } from "@/src/components/DataBadge";
import { WebShell } from "@/src/components/web/WebShell";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <OrbitThemeProvider>
    <ThemeProvider
      value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
    >
      <ServerGate>
      <AuthGate>
      {/* (Apple Health, synced as the app comes to the front.) */}
      <HealthAutoSync />
      <WebShell>
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

        {/* Gym — workouts, sessions and progress */}
        <Stack.Screen name="gym/(tabs)" options={{ headerShown: false }} />
        {/* Building a workout (no swipe away: it asks before losing changes) */}
        <Stack.Screen name="gym/build" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="gym/exercise/new" options={{ headerShown: false }} />
        <Stack.Screen name="gym/exercise/[id]" options={{ headerShown: false }} />
        {/* Doing a workout (no swipe away: Finish or Discard) */}
        <Stack.Screen name="gym/session" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="gym/history" options={{ headerShown: false }} />
        <Stack.Screen name="gym/records" options={{ headerShown: false }} />
        <Stack.Screen name="gym/plan" options={{ headerShown: false }} />
        <Stack.Screen name="gym/muscles" options={{ headerShown: false }} />
        <Stack.Screen name="gym/volume" options={{ headerShown: false }} />
        <Stack.Screen name="gym/workout/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="gym/sessions/[id]" options={{ headerShown: false }} />

        {/* Health — a list: nutrition, weight, and what's to come */}
        <Stack.Screen
          name="health-section"
          options={{
            headerShown: false,
          }}
        />

        {/* Settings — a list (like the iPhone's), each row its own page */}
        <Stack.Screen
          name="settings-section"
          options={{
            headerShown: false,
          }}
        />

        {/* About you — sex, birthday, height, activity, and the numbers from them */}
        <Stack.Screen
          name="health/about"
          options={{
            headerShown: false,
          }}
        />

        {/* Nutrition today — what's eaten against your targets */}
        <Stack.Screen
          name="health/today"
          options={{
            headerShown: false,
          }}
        />

        {/* Your burn — measured from food and weight, the Watch corrected to it */}
        <Stack.Screen
          name="health/burn"
          options={{
            headerShown: false,
          }}
        />

        {/* Targets — what to aim for, worked out from everything Health knows */}
        <Stack.Screen
          name="health/targets"
          options={{
            headerShown: false,
          }}
        />

        {/* A Health section — Activity, Heart, Sleep, Workouts… */}
        <Stack.Screen
          name="health/section/[id]"
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

        {/* Lists — tabs (Overview / Tasks / Checklists / Shopping), from the home page */}
        <Stack.Screen name="lists/(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="lists/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="lists/task/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="lists/deleted" options={{ headerShown: false }} />
        {/* Calendar — modelled on Outlook for iPhone, from the home page */}
        <Stack.Screen name="calendar/index" options={{ headerShown: false }} />
        <Stack.Screen name="calendar/event/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="calendar/meal-times" options={{ headerShown: false }} />
        <Stack.Screen name="calendar/sessions" options={{ headerShown: false }} />
        <Stack.Screen name="kitchen/index" options={{ headerShown: false }} />
        <Stack.Screen name="kitchen/needs" options={{ headerShown: false }} />
        <Stack.Screen name="calendar/edit" options={{ headerShown: false, presentation: "modal" }} />

        {/* Grocery list — reached from the Pantry/Kitchen tabs, not its own tab */}
        <Stack.Screen
          name="grocery-list"
          options={{
            headerShown: false,
          }}
        />

        {/* Review a scanned receipt before its items are added to the pantry */}
        {/* Desktop only: where scanned receipts will be reviewed (planned) */}
        <Stack.Screen name="receipts/index" options={{ headerShown: false }} />
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
          name="restaurant-meals/index"
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

        <Stack.Screen name="developer/data" options={{ headerShown: false }} />
        <Stack.Screen name="developer/people" options={{ headerShown: false }} />
        <Stack.Screen name="archive" options={{ headerShown: false }} />
        <Stack.Screen name="menu" options={{ headerShown: false }} />
        <Stack.Screen name="desktop-camera" options={{ headerShown: false }} />
        <Stack.Screen name="manage-lists" options={{ headerShown: false }} />

        <Stack.Screen
          name="developer/suggestions"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
      </WebShell>
      </AuthGate>
      {/* Which data is on show, where there's a choice. */}
      <DataBadge />
      </ServerGate>

      <WebAlertHost />
      <OrbitStatusBar />
    </ThemeProvider>
    </OrbitThemeProvider>
    </GestureHandlerRootView>
  );
}