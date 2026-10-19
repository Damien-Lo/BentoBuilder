import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWideForm } from "@/src/components/forms/wideForm";
import { getAccounts, getInvites, type Account, type AccessCodeInfo } from "@/src/services/authApi";
import { getDatabaseState, type DatabaseState } from "@/src/services/databaseApi";

// Developer: the admin's corner. Who has an account and who's been invited
// (People), which data the server is on (Data), and data-quality reports —
// fixable-but-not-broken items surfaced for review. Add a report row + page
// as more checks are built (recipes, planner entries…).

type Route = Parameters<ReturnType<typeof useRouter>["push"]>[0];

const REPORTS: { id: string; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; route: Route }[] = [
  { id: "ingredients", label: "Ingredients missing data", description: "No barcode, broken generic-ingredient links", icon: "nutrition-outline", route: "/developer/ingredients" },
  { id: "suggestions", label: "Suggestion record", description: "What's been done with meal suggestions, as saved", icon: "sparkles-outline", route: "/developer/suggestions" },
];

function Panel({ icon, title, onPress, children, style }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void; children: ReactNode; style?: object }) {
  return (
    <Pressable onPress={onPress} className="rounded-2xl border border-slate-200 bg-white p-5 active:bg-slate-50" style={style}>
      <View className="flex-row items-center">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
          <Ionicons name={icon} size={20} color="#D97706" />
        </View>
        <Text className="ml-3 flex-1 text-base font-bold text-slate-900">{title}</Text>
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      </View>
      {children}
    </Pressable>
  );
}

function Stat({ value, label, tone = "text-slate-900" }: { value: number | string; label: string; tone?: string }) {
  return (
    <View className="mr-6">
      <Text className={`text-2xl font-bold ${tone}`}>{value}</Text>
      <Text className="text-xs text-slate-500">{label}</Text>
    </View>
  );
}

export default function DeveloperHomeScreen() {
  const router = useRouter();
  const layout = useWideForm();
  const [people, setPeople] = useState<Account[] | null>(null);
  const [invites, setInvites] = useState<AccessCodeInfo[] | null>(null);
  const [data, setData] = useState<DatabaseState | null>(null);

  useFocusEffect(
    useCallback(() => {
      getAccounts().then(setPeople, () => {});
      getInvites().then(setInvites, () => {});
      getDatabaseState().then(setData, () => {});
    }, []),
  );

  const off = people?.filter((p) => p.disabledAt).length ?? 0;
  const test = data?.current === "test";
  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={layout.page}>
      {/* Header */}
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1">
          <Text className="text-2xl font-bold text-slate-950">Developer</Text>
          <Text className="mt-0.5 text-sm text-slate-500">People, data and reports</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={layout.wide ? [layout.columns, { alignItems: "stretch" }] : { gap: 12 }}>
          {/* People */}
          <Panel icon="people-outline" title="People" onPress={() => router.push("/developer/people")} style={layout.column}>
            <View className="mt-4 flex-row">
              <Stat value={people ? people.length : "–"} label={people?.length === 1 ? "account" : "accounts"} />
              <Stat value={invites ? invites.length : "–"} label={invites?.length === 1 ? "invite waiting" : "invites waiting"} />
              {off > 0 && <Stat value={off} label="turned off" tone="text-red-500" />}
            </View>
            <Pressable onPress={() => router.push("/developer/people")} className="mt-4 flex-row items-center self-start rounded-xl bg-blue-600 px-4 py-2.5 active:bg-blue-700">
              <Ionicons name="person-add-outline" size={16} color="white" />
              <Text className="ml-1.5 text-sm font-semibold text-white">Invite someone</Text>
            </Pressable>
          </Panel>

          {/* Data */}
          <Panel icon="flask-outline" title="Data" onPress={() => router.push("/developer/data")} style={layout.column}>
            <View className="mt-4 flex-row items-center">
              <View className={`rounded-full px-3 py-1 ${test ? "bg-amber-500" : "bg-red-600"}`}>
                <Text className="text-xs font-bold text-white">{data ? (test ? "TEST DATA" : "REAL DATA") : "…"}</Text>
              </View>
            </View>
            <Text className="mt-3 text-sm text-slate-500">
              {!data
                ? "Checking which data the server is on…"
                : data.canSwitch
                  ? "This machine's server can switch between your real kitchen and a test copy, or reset the test copy."
                  : "The deployed server is always on the real data."}
            </Text>
          </Panel>
        </View>

        {/* Reports */}
        <Text className="mb-2 mt-8 text-xs font-bold uppercase tracking-widest text-slate-400">Reports</Text>
        <View style={layout.wide ? [layout.columns, { alignItems: "stretch" }] : undefined} className={layout.wide ? "" : "overflow-hidden rounded-2xl border border-slate-200 bg-white"}>
          {REPORTS.map((row, i) =>
            layout.wide ? (
              <Pressable key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 active:bg-slate-50" style={layout.column} onPress={() => router.push(row.route)}>
                <View className="flex-row items-center justify-between">
                  <Ionicons name={row.icon} size={22} color="#D97706" />
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </View>
                <Text className="mt-3 text-base font-semibold text-slate-700">{row.label}</Text>
                <Text className="mt-1 text-sm text-slate-400">{row.description}</Text>
              </Pressable>
            ) : (
              <Pressable
                key={row.id}
                className={`flex-row items-center px-4 py-3.5 active:bg-slate-50 ${i < REPORTS.length - 1 ? "border-b border-slate-100" : ""}`}
                onPress={() => router.push(row.route)}
              >
                <Ionicons name={row.icon} size={20} color="#D97706" />
                <View className="ml-3 flex-1">
                  <Text className="text-base text-slate-700">{row.label}</Text>
                  <Text className="mt-0.5 text-xs text-slate-400">{row.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </Pressable>
            ),
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
