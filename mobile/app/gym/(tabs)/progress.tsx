import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { recordTimeline } from "@/src/components/gym/progressStats";
import { Hairline, IconTile, ListCard, ListRow, neutralTile } from "@/src/components/settings/AccountParts";
import { getSessions, sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { sectionColor, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import type { Ionicons } from "@expo/vector-icons";

// Gym → Progress: this week at a glance, then a list — like Settings — of
// the ways to look back: History (every workout you've finished), your
// records, the muscles you've trained, and your volume over time — each
// its own page.

type Entry = { label: string; icon: keyof typeof Ionicons.glyphMap; path?: string; soon?: boolean; value?: string };

export default function ProgressTab() {
  const router = useRouter();
  const { colors: c, dark } = useOrbitTheme();
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      getSessions().then(setSessions, () => setSessions([]));
    }, []),
  );

  // This week: from Monday.
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = (sessions ?? []).filter((s) => new Date(s.finishedAt) >= monday);
  const totals = week.map(sessionTotals);
  const volume = totals.reduce((n, t) => n + t.volume, 0);
  const sets = totals.reduce((n, t) => n + t.sets, 0);

  const entries: Entry[] = [
    { label: "History", icon: "time", path: "/gym/history", value: sessions ? `${sessions.length}` : undefined },
    { label: "Personal records", icon: "trophy", path: "/gym/records", value: sessions ? recordsValue(sessions) : undefined },
    { label: "Muscles trained", icon: "body", path: "/gym/muscles" },
    { label: "Volume over time", icon: "stats-chart", path: "/gym/volume" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Progress</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>How your training&apos;s going</Text>

        {/* This week */}
        <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>THIS WEEK</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat value={sessions ? String(week.length) : " "} label={week.length === 1 ? "workout" : "workouts"} colors={c} />
          <Stat value={sessions ? String(sets) : " "} label="sets" colors={c} />
          <Stat value={sessions ? Math.round(volume).toLocaleString() : " "} label="lbs moved" colors={c} />
        </View>

        <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>LOOK BACK</Text>
        <ListCard>
          {entries.map((entry, i) => (
            <Fragment key={entry.label}>
              {i > 0 && <Hairline />}
              <ListRow
                label={entry.label}
                soon={entry.soon}
                value={entry.soon ? "Coming" : entry.value}
                tile={<IconTile icon={entry.icon} color={entry.soon ? neutralTile(dark) : (sectionColor("gym", false) ?? c.ink)} />}
                onPress={() => entry.path && router.push(entry.path as Href)}
              />
            </Fragment>
          ))}
        </ListCard>
      </ScrollView>
    </SafeAreaView>
  );
}

// "3 this month" — records set in the last 30 days.
function recordsValue(sessions: GymSessionRecord[]) {
  const since = Date.now() - 30 * 86_400_000;
  const recent = recordTimeline(sessions).filter((r) => new Date(r.finishedAt).getTime() >= since).length;
  return recent ? `${recent} this month` : undefined;
}

function Stat({ value, label, colors: c }: { value: string; label: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <Text style={{ fontSize: 24, fontWeight: "800", color: c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 12.5, color: c.muted }}>{label}</Text>
    </View>
  );
}
