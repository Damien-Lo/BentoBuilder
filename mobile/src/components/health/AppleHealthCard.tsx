import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import { connectAppleHealth, getHealthMetrics, healthAvailable, lastSynced, syncAppleHealth, type HealthMetric } from "@/src/services/healthSync";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Health's link to Apple Health: on an iPhone not yet connected, a way to
// connect it; once connected, when it last synced (and a sync now) — and
// synced on its own when Health opens, an hour or more since the last.
// Then today's numbers from it (on any device): steps, active calories,
// last night's sleep, resting heart rate.

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AppleHealthCard() {
  const { colors: c } = useOrbitTheme();
  const phone = healthAvailable();
  const [synced, setSynced] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [today, setToday] = useState<HealthMetric[]>([]);

  const loadToday = useCallback(() => {
    const now = new Date();
    getHealthMetrics(["steps", "activeEnergy", "sleep", "restingHeartRate"], dayOf(new Date(now.getTime() - 86_400_000)), dayOf(now)).then(setToday, () => {});
  }, []);
  const sync = useCallback(
    async (quiet = false) => {
      setSyncing(true);
      try {
        await syncAppleHealth();
        setSynced(await lastSynced());
        loadToday();
      } catch (error) {
        if (!quiet) Alert.alert("Couldn't sync Apple Health", error instanceof Error ? error.message : "Something went wrong.");
      } finally {
        setSyncing(false);
      }
    },
    [loadToday],
  );
  useFocusEffect(
    useCallback(() => {
      loadToday();
      if (!phone) return;
      lastSynced().then((last) => {
        setSynced(last);
        if (last && Date.now() - last.getTime() > 3_600_000) void sync(true);
      });
    }, [phone, loadToday, sync]),
  );

  async function connect() {
    try {
      await connectAppleHealth();
      await sync();
    } catch (error) {
      Alert.alert("Couldn't connect Apple Health", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  const latest = (type: string) => today.filter((m) => m.type === type).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const todayKey = dayOf(new Date());
  const of = (type: string) => {
    const m = latest(type);
    return m && (type === "sleep" || type === "restingHeartRate" || m.date === todayKey) ? m : null;
  };
  const steps = of("steps");
  const active = of("activeEnergy");
  const sleep = of("sleep");
  const resting = of("restingHeartRate");
  const anything = steps || active || sleep || resting;

  // Not on an iPhone, and nothing synced from one: nothing to show.
  if (!phone && !anything) return null;

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FF2D55" }}>
          <Ionicons name="heart" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>Apple Health</Text>
          <Text style={{ fontSize: 12.5, color: c.muted }}>{!phone ? "Synced from your iPhone" : synced ? `Synced ${ago(synced)}` : "Your Watch and iPhone's health data, here"}</Text>
        </View>
        {phone &&
          (syncing ? (
            <ActivityIndicator color={c.muted} />
          ) : synced ? (
            <Tap onPress={() => void sync()} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.pill }} pressedStyle={{ opacity: 0.7 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: c.onPill }}>Sync now</Text>
            </Tap>
          ) : (
            <Tap onPress={() => void connect()} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.ink }} pressedStyle={{ opacity: 0.85 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: c.onInk }}>Connect</Text>
            </Tap>
          ))}
      </View>
      {anything && (
        <View style={{ marginTop: 12, flexDirection: "row" }}>
          <Stat icon="walk" label="Steps" value={steps ? Math.round(steps.value).toLocaleString() : "—"} colors={c} />
          <Stat icon="flame" label="Active" value={active ? `${Math.round(active.value).toLocaleString()}` : "—"} unit="kcal" colors={c} />
          <Stat icon="moon" label="Sleep" value={sleep ? `${Math.floor(sleep.value / 60)}h ${Math.round(sleep.value % 60)}m` : "—"} colors={c} />
          <Stat icon="heart" label="Resting" value={resting ? `${Math.round(resting.value)}` : "—"} unit="bpm" colors={c} />
        </View>
      )}
    </View>
  );
}

function Stat({ icon, label, value, unit, colors: c }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; unit?: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name={icon} size={12} color={c.faint} />
        <Text style={{ fontSize: 11.5, color: c.muted }}>{label}</Text>
      </View>
      <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "800", color: value === "—" ? c.faint : c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
        {unit && value !== "—" && <Text style={{ fontSize: 11, fontWeight: "600", color: c.muted }}> {unit}</Text>}
      </Text>
    </View>
  );
}
