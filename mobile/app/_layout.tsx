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
  anchor: "(tabs)",
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
          name="(tabs)"
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

        {/* Create a pantry item manually */}
        <Stack.Screen
          name="pantry/add_manual"
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
          name="modal"
          options={{
            presentation: "modal",
            title: "Modal",
          }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}