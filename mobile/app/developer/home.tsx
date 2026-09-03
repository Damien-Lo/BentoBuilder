import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ReportRow {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

// Each row here is a data-quality report — fixable-but-not-broken items
// surfaced for review, not a crash/error report. Add a new row + page as
// more checks are built out (recipes, planner entries, etc.).
const REPORTS: ReportRow[] = [
  {
    id: "ingredients",
    label: "Ingredients Missing Data",
    description: "No barcode, broken generic-ingredient links",
    icon: "nutrition-outline",
    route: "/developer/ingredients",
  },
];

export default function DeveloperHomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1">
          <Text className="text-2xl font-bold text-slate-950">Developer</Text>
          <Text className="mt-0.5 text-sm text-slate-500">Data quality & fixable items</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          Reports
        </Text>
        <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {REPORTS.map((row, i) => (
            <Pressable
              key={row.id}
              className={`flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50 ${
                i < REPORTS.length - 1 ? "border-b border-slate-100" : ""
              }`}
              onPress={() => router.push(row.route as Parameters<typeof router.push>[0])}
            >
              <View className="flex-1 flex-row items-center">
                <Ionicons name={row.icon} size={20} color="#D97706" />
                <View className="ml-3 flex-1">
                  <Text className="text-base text-slate-700">{row.label}</Text>
                  <Text className="mt-0.5 text-xs text-slate-400">{row.description}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
