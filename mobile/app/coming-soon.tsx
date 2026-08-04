import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Generic landing spot for FAB radial-menu entries that don't do anything
// yet (Scan/Timer/Notes/Shopping/Share) — future expansions to the app,
// parameterized by feature name/icon rather than one screen per feature.
export default function ComingSoonScreen() {
  const router = useRouter();
  const { feature, icon } = useLocalSearchParams<{ feature?: string; icon?: string }>();

  const featureName = feature || "This feature";
  const iconName = (icon as keyof typeof Ionicons.glyphMap) || "sparkles-outline";

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-blue-50">
          <Ionicons name={iconName} size={36} color="#2563EB" />
        </View>
        <Text className="mt-6 text-2xl font-bold text-slate-950">{featureName}</Text>
        <Text className="mt-2 text-center text-base leading-6 text-slate-500">
          {featureName} is coming to a future version of BentoBuilder — it isn&apos;t built yet.
        </Text>
      </View>
    </SafeAreaView>
  );
}
