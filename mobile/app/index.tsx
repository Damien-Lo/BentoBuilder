import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WebHomeScreen } from "@/src/components/web/WebHomeScreen";
import { useWideWeb } from "@/src/utils/useWideWeb";

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
    route: "/planner",
  },
  {
    id: "lists",
    name: "Lists",
    description: "Tasks, checklists & shopping",
    icon: "checkbox-outline",
    iconColor: "#4B55C9",
    iconBg: "#EEF0FB",
    active: true,
    route: "/lists",
  },
  {
    id: "calendar",
    name: "Calendar",
    description: "Events, schedules & appointments",
    icon: "calendar-outline",
    iconColor: "#0D9488",
    iconBg: "#F0FDFA",
    active: true,
    route: "/calendar",
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
  {
    id: "developer",
    name: "Developer",
    description: "Data quality & fixable items",
    icon: "construct-outline",
    iconColor: "#D97706",
    iconBg: "#FFFBEB",
    active: true,
    route: "/developer/home",
  },
];

// The order the cards were last arranged in (section ids), kept on the device.
const ORDER_KEY = "home.sectionOrder";

// Saved order first; any section it doesn't mention (a new one) goes last.
function arrange(order: string[]): Section[] {
  const known = order.map((id) => SECTIONS.find((s) => s.id === id)).filter((s): s is Section => !!s);
  return [...known, ...SECTIONS.filter((s) => !order.includes(s.id))];
}

export default function HomeScreen() {
  // A desktop browser gets a dashboard; the phone's home is below.
  const wide = useWideWeb();
  return wide ? <WebHomeScreen /> : <PhoneHomeScreen />;
}

function PhoneHomeScreen() {
  const router = useRouter();
  const [sections, setSections] = useState(SECTIONS);
  // Reorder mode: the cards show arrows instead of opening.
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ORDER_KEY)
      .then((saved) => saved && setSections(arrange(JSON.parse(saved))))
      .catch(() => {});
  }, []);

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    AsyncStorage.setItem(ORDER_KEY, JSON.stringify(next.map((s) => s.id))).catch(() => {});
  }

  function resetOrder() {
    setSections(SECTIONS);
    AsyncStorage.removeItem(ORDER_KEY).catch(() => {});
  }

  const pairs: Section[][] = [];
  for (let i = 0; i < sections.length; i += 2) {
    pairs.push(sections.slice(i, i + 2));
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

        {/* Section label, with the reorder switch */}
        <View className="mb-4 flex-row items-center">
          <Text className="flex-1 text-xs font-bold uppercase tracking-widest text-slate-400">
            {reordering ? "Reorder sections" : "Sections"}
          </Text>
          {reordering && (
            <Pressable onPress={resetOrder} hitSlop={8} className="mr-2 rounded-full px-3 py-1.5 active:bg-slate-200">
              <Text className="text-xs font-semibold text-slate-500">Reset</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setReordering((v) => !v)}
            hitSlop={8}
            accessibilityLabel={reordering ? "Finish reordering" : "Reorder sections"}
            className={`flex-row items-center rounded-full px-3 py-1.5 ${reordering ? "bg-blue-600 active:bg-blue-700" : "bg-slate-200 active:bg-slate-300"}`}
          >
            <Ionicons name={reordering ? "checkmark" : "swap-vertical"} size={14} color={reordering ? "#FFFFFF" : "#475569"} />
            <Text className={`ml-1 text-xs font-semibold ${reordering ? "text-white" : "text-slate-600"}`}>
              {reordering ? "Done" : "Reorder"}
            </Text>
          </Pressable>
        </View>

        {/* 2-column grid */}
        {pairs.map((pair, rowIdx) => (
          <View key={rowIdx} className="mb-4 flex-row gap-4">
            {pair.map((section, colIdx) => {
              const index = rowIdx * 2 + colIdx;
              return (
                <Pressable
                  key={section.id}
                  onPress={() => {
                    if (section.active && section.route) {
                      // navigate (not push) — Kitchen's tab navigator persists
                      // whichever tab was last focused, so a plain push can
                      // resurface a stale tab (e.g. Planner) instead of
                      // re-targeting this section's actual landing screen.
                      router.navigate(section.route as Parameters<typeof router.navigate>[0]);
                    }
                  }}
                  disabled={!section.active || reordering}
                  className={`flex-1 overflow-hidden rounded-2xl border bg-white ${
                    reordering ? "border-blue-300" : "border-slate-200"
                  } ${section.active ? "active:bg-slate-50" : reordering ? "" : "opacity-55"}`}
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

                    {reordering ? (
                      // Earlier / later in reading order (across, then down).
                      <View className="mt-4 flex-row gap-2">
                        <MoveButton icon="arrow-back" label={`Move ${section.name} earlier`} disabled={index === 0} onPress={() => move(index, -1)} />
                        <MoveButton
                          icon="arrow-forward"
                          label={`Move ${section.name} later`}
                          disabled={index === sections.length - 1}
                          onPress={() => move(index, 1)}
                        />
                      </View>
                    ) : (
                      /* Status badge */
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
                    )}
                  </View>
                </Pressable>
              );
            })}
            {/* Spacer if row has only one card */}
            {pair.length === 1 && <View className="flex-1" />}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function MoveButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className={`flex-1 items-center justify-center rounded-xl ${disabled ? "bg-slate-100" : "bg-blue-600 active:bg-blue-700"}`}
      style={{ height: 34 }}
    >
      <Ionicons name={icon} size={17} color={disabled ? "#CBD5E1" : "#FFFFFF"} />
    </Pressable>
  );
}
