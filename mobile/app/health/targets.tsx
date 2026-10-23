import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Fragment, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { amount, GoalCard, TargetEditor, TargetRow, WeightGoalEditor } from "@/src/components/health/TargetParts";
import { fit } from "@/src/components/health/targets";
import { burnFrom, TARGET_GROUPS, useTargetsPage } from "@/src/components/health/targetsPage";
import { UnitsToggle, useUnits } from "@/src/components/health/units";
import { WebTargets } from "@/src/components/health/web/WebTargets";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Health → Targets: everything to aim for, in the Health list's groups —
// Activity & fitness (steps, exercise, workouts), Body (your goal weight and
// how fast to get there, which sets the calories), Sleep & mind (sleep) and
// Nutrition (calories and macros, from your burn, and water). At the top,
// how personal the suggestions are and what would make them more so, and
// the changes suggested to what's set, to take all at once. Each target —
// yours, with the suggestion under it when they differ — tapped to change
// it, see the suggestion, and what it's based on (TargetParts). Suggestions
// are worked out from what Health knows, with standard values for what it
// doesn't yet (targets.ts). Calories and macros are Kitchen's daily goals;
// the rest are kept with the pace in the profile's `targets`. (A desktop
// browser: in columns — WebTargets.)

export default function TargetsScreen() {
  const wide = useWideWeb();
  return (
    <OrbitSection section="health">
      <OrbitPage>{wide ? <WebTargets /> : <Targets />}</OrbitPage>
    </OrbitSection>
  );
}

function Targets() {
  const router = useRouter();
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  const [units] = useUnits("about");
  // (What they're worked out from, what's suggested, and saving: targetsPage.)
  const page = useTargetsPage(units);
  const [editing, setEditing] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  if (!page) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.muted} />
      </SafeAreaView>
    );
  }

  const { settings, progress, targets, burn, aim, personal, yours, adds, changes, saving, save, setTarget, takeAll, setPace } = page;
  const open = editing ? (targets.find((t) => t.key === editing) ?? null) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <PageHeader title="Your Targets" subtitle="What to aim for, from everything Health knows" onBack={leave} action={<UnitsToggle page="about" />} />

        {/* How personal they are, and what would make them more so */}
        <View style={{ marginTop: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: 0.8, color: c.ink }}>HOW PERSONAL</Text>
          <Text style={{ marginTop: 4, fontSize: 22, fontWeight: "800", color: c.text }}>
            {yours} of {personal.length} <Text style={{ fontSize: 15, fontWeight: "600", color: c.muted }}>suggested from your data</Text>
          </Text>
          <View style={{ marginTop: 10, height: 8, borderRadius: 4, backgroundColor: c.track, flexDirection: "row", overflow: "hidden" }}>
            {personal.map((t) => (
              <View key={t.key} style={{ flex: 1, marginRight: 2, backgroundColor: fit(t) === "yours" ? c.fill : fit(t) === "partly" ? `${c.fill}66` : "transparent" }} />
            ))}
          </View>
          <Text style={{ marginTop: 10, fontSize: 13.5, lineHeight: 19, color: c.muted }}>
            {adds.length ? "Where something's missing, a standard value is used for now. Add these to make the suggestions your own:" : "Every suggestion's worked out from your own data."}
          </Text>
          {adds.map(({ text, href, label, count }) => (
            <Tap key={text} onPress={() => router.push(href as Href)} accessibilityRole="link" style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.canvas }} pressedStyle={{ opacity: 0.7 }}>
              <Ionicons name="add-circle" size={18} color={c.ink} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: c.text }}>{text}</Text>
                <Text style={{ fontSize: 12.5, color: c.muted }}>
                  {label} · improves {count} target{count === 1 ? "" : "s"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.faint} />
            </Tap>
          ))}
        </View>

        {/* The changes suggested to what's set */}
        {changes.length > 0 && (
          <View style={{ marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: c.ink }}>
            <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: 0.8, color: c.onInk, opacity: 0.8 }}>SUGGESTED CHANGES</Text>
            {changes.map((t) => (
              <View key={t.key} style={{ marginTop: 10, flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.onInk }}>{t.label}</Text>
                <Text style={{ fontSize: 15, color: c.onInk, opacity: 0.75, fontVariant: ["tabular-nums"] }}>{t.current != null ? `${amount(t, t.current, units, false)} → ` : "Not set → "}</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: c.onInk, fontVariant: ["tabular-nums"] }}>{amount(t, t.value, units)}</Text>
              </View>
            ))}
            <Tap onPress={takeAll} disabled={saving} accessibilityRole="button" style={{ marginTop: 14, alignItems: "center", paddingVertical: 11, borderRadius: 12, backgroundColor: c.onInk }} pressedStyle={{ opacity: 0.8 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: c.ink }}>{saving ? "Saving…" : changes.length === 1 ? "Use it" : `Use all ${changes.length}`}</Text>
            </Tap>
            <Text style={{ marginTop: 8, fontSize: 12, textAlign: "center", color: c.onInk, opacity: 0.7 }}>Or tap a target below to set your own</Text>
          </View>
        )}

        {TARGET_GROUPS.map((group) => {
          const rows = targets.filter((t) => t.group === group);
          return (
            <Fragment key={group}>
              <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{group.toUpperCase()}</Text>
              {group === "Body" ? (
                <GoalCard aim={aim} start={settings.startingWeight != null ? { kg: settings.startingWeight, date: settings.startingWeightDate } : null} burn={burn.value} units={units} onPace={setPace} onGoal={() => setGoalOpen(true)} colors={c} />
              ) : (
                <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>
                  {/* Your burn, which the calories come from */}
                  {group === "Nutrition" && (
                    <Tap onPress={() => router.push("/health/burn" as Href)} accessibilityRole="link" style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: `${c.fill}14`, borderBottomWidth: 1, borderBottomColor: c.border }} pressedStyle={{ opacity: 0.7 }}>
                      <Ionicons name="information-circle" size={18} color={c.ink} />
                      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: c.text }}>
                        <Text style={{ fontWeight: "700" }}>You burn about {Math.round(burn.value).toLocaleString()} kcal a day</Text>
                        {burnFrom(burn)}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={c.faint} />
                    </Tap>
                  )}
                  {rows.map((t, i) => (
                    <Fragment key={t.key}>
                      {i > 0 && <View style={{ height: 1, marginLeft: 56, backgroundColor: c.border }} />}
                      <TargetRow target={t} done={progress[t.key] ?? null} units={units} onPress={() => setEditing(t.key)} colors={c} />
                    </Fragment>
                  ))}
                </View>
              )}
            </Fragment>
          );
        })}
        <Text style={{ marginTop: 16, marginHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>Tap a target to change it, or to see its suggestion and what that&apos;s based on. Suggestions are worked out again each time, as your data grows.</Text>
      </ScrollView>
      <WeightGoalEditor open={goalOpen} value={settings} heightCm={settings.heightCm} units={units} onSave={(v) => save(v)} onClose={() => setGoalOpen(false)} colors={c} />
      <TargetEditor
        target={open}
        units={units}
        onSave={(value) => setTarget(open!.key, value)}
        onClose={() => setEditing(null)}
        onAdd={(href) => {
          setEditing(null);
          router.push(href as Href);
        }}
        colors={c}
      />
    </SafeAreaView>
  );
}
