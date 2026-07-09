import { useEffect } from "react";
import { Text, View } from "react-native";

import { getPantryItems } from "@/src/services/pantryApi";

export default function HomeScreen() {
  useEffect(() => {
    async function testPantryApi() {
      try {
        const items = await getPantryItems();
        console.log("Pantry items:", items);
      } catch (error) {
        console.error("Pantry API error:", error);
      }
    }

    void testPantryApi();
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-bold text-slate-900">
        Check the Expo terminal
      </Text>
    </View>
  );
}