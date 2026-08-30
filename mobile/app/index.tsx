import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function todayLabel(): string {
  const d = new Date();
  return `${DAY_FULL[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

interface Section {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  active: boolean;
  route?: string;
}

const SECTIONS: Section[] = [
  {
    id: "kitchen",
    name: "Kitchen",
    description: "Recipes, meals & pantry management",
    icon: "restaurant-outline",
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
    active: true,
    route: "/RecipesMainPage",
  },
  {
    id: "scheduling",
    name: "Scheduling",
    description: "Manage your time & appointments",
    icon: "time-outline",
    iconColor: "#94A3B8",
    iconBg: "#F8FAFC",
    active: false,
  },
  {
    id: "home-planning",
    name: "Home Planning",
    description: "Track tasks & home projects",
    icon: "home-outline",
    iconColor: "#94A3B8",
    iconBg: "#F8FAFC",
    active: false,
  },
  {
    id: "documents",
    name: "Document Manager",
    description: "Store & organise your files",
    icon: "document-text-outline",
    iconColor: "#94A3B8",
    iconBg: "#F8FAFC",
    active: false,
  },
  {
    id: "settings",
    name: "Settings",
    description: "Preferences for every section",
    icon: "settings-outline",
    iconColor: "#7C3AED",
    iconBg: "#F5F3FF",
    active: true,
    route: "/settings-section/kitchen",
  },
];

export default function HomeScreen() {
  const router = useRouter();

  const pairs: Section[][] = [];
  for (let i = 0; i < SECTIONS.length; i += 2) {
    pairs.push(SECTIONS.slice(i, i + 2));
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 60 }}
      >
        {/* Header */}
        <View className="mb-10">
          <Text className="text-3xl font-bold text-slate-900">BentoBuilder</Text>
          <Text className="mt-1.5 text-sm text-slate-400">{todayLabel()}</Text>
        </View>

        {/* Section label */}
        <Text className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">
          Sections
        </Text>

        {/* 2-column grid */}
        {pairs.map((pair, rowIdx) => (
          <View key={rowIdx} className="mb-4 flex-row gap-4">
            {pair.map(section => (
              <Pressable
                key={section.id}
                onPress={() => {
                  if (section.active && section.route) {
                    router.push(section.route as Parameters<typeof router.push>[0]);
                  }
                }}
                disabled={!section.active}
                className={`flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white ${
                  section.active ? "active:bg-slate-50" : "opacity-55"
                }`}
              >
                <View className="p-5">
                  {/* Icon */}
                  <View
                    className="mb-4 h-11 w-11 items-center justify-center rounded-full"
                    style={{ backgroundColor: section.iconBg }}
                  >
                    <Ionicons name={section.icon} size={20} color={section.iconColor} />
                  </View>

                  {/* Name */}
                  <Text className="text-base font-bold text-slate-900">{section.name}</Text>

                  {/* Description */}
                  <Text className="mt-1 text-xs leading-4 text-slate-400" numberOfLines={2}>
                    {section.description}
                  </Text>

                  {/* Status badge */}
                  <View className="mt-4">
                    {section.active ? (
                      <View className="self-start rounded-full bg-blue-100 px-2.5 py-1">
                        <Text className="text-[11px] font-semibold text-blue-700">Open</Text>
                      </View>
                    ) : (
                      <View className="self-start rounded-full bg-slate-100 px-2.5 py-1">
                        <Text className="text-[11px] font-semibold text-slate-400">Coming Soon</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
            {/* Spacer if row has only one card */}
            {pair.length === 1 && <View className="flex-1" />}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
