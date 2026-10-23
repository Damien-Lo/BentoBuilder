import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Fragment, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { amount, GoalCard, TargetEditor, TargetRow, WeightGoalEditor } from "@/src/components/health/TargetParts";
import { fit, type Target } from "@/src/components/health/targets";
import { burnFrom, useTargetsPage } from "@/src/components/health/targetsPage";
import { UnitsToggle, useUnits } from "@/src/components/health/units";
import { Button, Card, hoverable, PageTitle, WebPage } from "@/src/components/web/ui";
import { useOrbitTheme } from "@/src/theme/orbit";

// Your Targets in a desktop browser: on the left, how personal the
// suggestions are (and what would make them more so), the changes
// suggested to take all at once, and your goal weight with its pace; on the
// right, the targets in their groups side by side — Activity & fitness and
// Sleep & mind, then Nutrition (from your burn). Each target, clicked,
// opens its editor: yours beside the suggestion, and what it's based on.

type Hover = { hovered?: boolean };

export function WebTargets() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [units] = useUnits("about");
  const page = useTargetsPage(units);
  const [editing, setEditing] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  const title = <PageTitle title="Your Targets" subtitle="What to aim for, from everything Health knows" right={<UnitsToggle page="about" />} />;
  if (!page) {
    return (
      <WebPage>
        {title}
        <Text style={{ fontSize: 14, color: c.muted }}>Loading…</Text>
      </WebPage>
    );
  }

  const { settings, progress, targets, burn, aim, personal, yours, adds, changes, saving, save, setTarget, takeAll, setPace } = page;
  const open = editing ? (targets.find((t) => t.key === editing) ?? null) : null;
  const go = (href: string) => router.push(href as Href);

  // A group's targets, in a card, each opening its editor.
  const group = (name: Target["group"], top?: ReactNode) => {
    const rows = targets.filter((t) => t.group === name);
    if (!rows.length) return null;
    return (
      <Card title={name} padded={false}>
        {top}
        {rows.map((t, i) => (
          <Fragment key={t.key}>
            {(i > 0 || !!top) && <View style={{ height: 1, marginLeft: i > 0 ? 56 : 0, backgroundColor: c.border }} />}
            <TargetRow target={t} done={progress[t.key] ?? null} units={units} onPress={() => setEditing(t.key)} colors={c} />
          </Fragment>
        ))}
      </Card>
    );
  };

  return (
    <WebPage>
      {title}

      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
        <View style={{ flex: 1, minWidth: 340, maxWidth: 480, gap: 16 }}>
          {/* How personal they are, and what would make them more so */}
          <Card title="How personal">
            <Text style={{ fontSize: 22, fontWeight: "800", color: c.text }}>
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
              <Pressable key={text} onPress={() => go(href)} accessibilityRole="link" style={hoverable(({ hovered }: Hover) => ({ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: hovered ? c.pill : c.canvas }))}>
                <Ionicons name="add-circle" size={18} color={c.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: c.text }}>{text}</Text>
                  <Text style={{ fontSize: 12.5, color: c.muted }}>
                    {label} · improves {count} target{count === 1 ? "" : "s"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.faint} />
              </Pressable>
            ))}
          </Card>

          {/* The changes suggested to what's set */}
          {changes.length > 0 && (
            <Card title="Suggested changes" subtitle="Or click a target to set your own" action={<Button label={saving ? "Saving…" : changes.length === 1 ? "Use it" : `Use all ${changes.length}`} onPress={() => void takeAll()} kind="primary" small disabled={saving} />}>
              {changes.map((t, i) => (
                <View key={t.key} style={{ marginTop: i ? 8 : 0, flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: c.text }}>{t.label}</Text>
                  <Text style={{ fontSize: 14, color: c.muted, fontVariant: ["tabular-nums"] }}>{t.current != null ? `${amount(t, t.current, units, false)} → ` : "Not set → "}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: c.ink, fontVariant: ["tabular-nums"] }}>{amount(t, t.value, units)}</Text>
                </View>
              ))}
            </Card>
          )}

          {/* Body: the goal weight and its pace, which set the calories */}
          <GoalCard aim={aim} start={settings.startingWeight != null ? { kg: settings.startingWeight, date: settings.startingWeightDate } : null} burn={burn.value} units={units} onPace={setPace} onGoal={() => setGoalOpen(true)} colors={c} />
        </View>

        {/* The targets, their groups side by side */}
        <View style={{ flex: 2, minWidth: 560 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
            <View style={{ flex: 1, minWidth: 320, gap: 16 }}>
              {group("Activity & fitness")}
              {group("Sleep & mind")}
            </View>
            <View style={{ flex: 1, minWidth: 320 }}>
              {group(
                "Nutrition",
                // Your burn, which the calories come from
                <Pressable onPress={() => go("/health/burn")} accessibilityRole="link" style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: `${c.fill}${hovered ? "26" : "14"}` }))}>
                  <Ionicons name="information-circle" size={18} color={c.ink} />
                  <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: c.text }}>
                    <Text style={{ fontWeight: "700" }}>You burn about {Math.round(burn.value).toLocaleString()} kcal a day</Text>
                    {burnFrom(burn)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={c.faint} />
                </Pressable>,
              )}
            </View>
          </View>
          <Text style={{ marginTop: 14, marginHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>Click a target to change it, or to see its suggestion and what that&apos;s based on. Suggestions are worked out again each time, as your data grows.</Text>
        </View>
      </View>

      <WeightGoalEditor open={goalOpen} value={settings} heightCm={settings.heightCm} units={units} onSave={(v) => save(v)} onClose={() => setGoalOpen(false)} colors={c} />
      <TargetEditor
        target={open}
        units={units}
        onSave={(value) => setTarget(open!.key, value)}
        onClose={() => setEditing(null)}
        onAdd={(href) => {
          setEditing(null);
          go(href);
        }}
        colors={c}
      />
    </WebPage>
  );
}
