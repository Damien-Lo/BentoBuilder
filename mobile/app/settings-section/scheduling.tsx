import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SchedulingSettingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-xl font-bold text-slate-900">Scheduling Settings</Text>
        <Text className="mt-2 text-center text-sm text-slate-400">Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}
