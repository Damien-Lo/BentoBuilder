import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { DatePickerField } from "@/src/components/forms/DatePickerField";
import { aboutNumbers, InfoCard, SmallNumber, useAboutYou, type Info } from "@/src/components/health/AboutParts";
import { ACTIVITY } from "@/src/components/health/bodyStats";
import { UnitsToggle } from "@/src/components/health/units";
import { Button, Card, hoverable, PageTitle, Row, WebPage } from "@/src/components/web/ui";
import type { Sex } from "@/src/services/settingsService";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// About you in a desktop browser: what you've said — sex, date of birth,
// height, your weight and goal weight, how active you are — beside the
// numbers worked out from it, a grid of cards that each, clicked, say what
// the number is and how it was worked out; and the calories and protein to
// aim for, set as your daily goals in a click (what they'd replace shown).

type Hover = { hovered?: boolean };

export function WebAboutYou() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const { settings, weight, units, metric, height, change, saveHeight } = useAboutYou();
  const [info, setInfo] = useState<Info | null>(null);

  const title = <PageTitle title="About you" subtitle="What your health numbers are worked out from" right={<UnitsToggle page="about" />} />;
  if (!settings) {
    return (
      <WebPage maxWidth={1240}>
        {title}
        <Text style={{ fontSize: 14, color: c.muted }}>Loading…</Text>
      </WebPage>
    );
  }

  const { W, U, age, w, goal, target, proteinGoal, matchesGoals, missing, figures } = aboutNumbers(settings, weight, units);
  const go = (href: string) => router.push(href as Href);

  return (
    <WebPage maxWidth={1240}>
      {title}

      <Row style={{ alignItems: "flex-start" }}>
        {/* What you've said */}
        <View style={{ flex: 1, minWidth: 360, maxWidth: 480, gap: 16 }}>
          <Card title="You" padded={false}>
            <Line colors={c} />
            <Field label="Sex" colors={c}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["male", "female"] as Sex[]).map((s) => (
                  <Chip key={s} label={s === "male" ? "Male" : "Female"} on={settings.sex === s} onPress={() => void change({ sex: settings.sex === s ? null : s })} colors={c} />
                ))}
              </View>
            </Field>
            <Line colors={c} />
            <View style={{ paddingHorizontal: 18, paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ flex: 1, fontSize: 14, color: c.text }}>Date of birth</Text>
                {age != null && <Text style={{ fontSize: 13.5, fontWeight: "600", color: c.muted }}>{age} years old</Text>}
              </View>
              <DatePickerField value={settings.birthDate ?? ""} onChange={(d) => void change({ birthDate: d || null })} title="Date of birth" placeholder="Pick your date of birth" />
            </View>
            <Line colors={c} />
            <Field label="Height" colors={c}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {metric ? (
                  <SmallNumber value={height.cmText} onChange={height.setCmText} onDone={saveHeight} unit="cm" label="Height, centimetres" digits={3} colors={c} />
                ) : (
                  <>
                    <SmallNumber value={height.feet} onChange={height.setFeet} onDone={saveHeight} unit="ft" label="Height, feet" colors={c} />
                    <SmallNumber value={height.inches} onChange={height.setInches} onDone={saveHeight} unit="in" label="Height, inches" colors={c} />
                  </>
                )}
              </View>
            </Field>
            <Line colors={c} />
            <Field label="Weight" onPress={() => go("/health/weight")} colors={c}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: w != null ? c.text : c.faint }}>{w != null ? `${Number(W(w).toFixed(1))} ${U}` : "Log a weigh-in"}</Text>
              <Ionicons name="chevron-forward" size={15} color={c.faint} />
            </Field>
            <Line colors={c} />
            <Field label="Goal weight" onPress={() => go("/health/targets")} colors={c}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: goal != null ? c.text : c.faint }}>{goal != null ? `${Number(W(goal).toFixed(1))} ${U}` : "Set one"}</Text>
              <Ionicons name="chevron-forward" size={15} color={c.faint} />
            </Field>
          </Card>

          {/* How active */}
          <Card title="How active you are">
            <View style={{ gap: 8 }}>
              {ACTIVITY.map((a) => {
                const on = settings.activityLevel === a.id;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => void change({ activityLevel: a.id })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.border, backgroundColor: hovered ? c.pill : c.surface }))}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{a.label}</Text>
                      <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{a.hint}</Text>
                    </View>
                    <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={19} color={on ? c.ink : c.faint} />
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>

        {/* The numbers worked out from it */}
        <View style={{ flex: 1.5, minWidth: 480, gap: 16 }}>
          <Card title="Your numbers" subtitle={missing.length ? `Add ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")} for all of them.` : "Click any for what it is and how it's worked out"}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {figures.map((f) => (
                <Figure key={f.key} label={f.label} value={f.value} unit={f.unit} detail={f.detail} strong={f.strong} onPress={() => setInfo(f.info)} colors={c} />
              ))}
            </View>
          </Card>

          {/* The calories and protein to aim for, as your daily goals */}
          {target && proteinGoal != null && (
            <Card
              title="Your daily goals"
              subtitle={matchesGoals ? "These are your daily goals" : "Kitchen's and Nutrition's, from the numbers above"}
              action={matchesGoals ? <Ionicons name="checkmark-circle" size={20} color={c.success} /> : <Button label="Use as my daily goals" icon="flag" kind="primary" small onPress={() => void change({ dailyCalorieLimit: target.kcal, dailyProteinLimit: proteinGoal })} />}
            >
              <View style={{ flexDirection: "row", gap: 24 }}>
                <Goal label="Calories" now={settings.dailyCalorieLimit != null ? `${settings.dailyCalorieLimit.toLocaleString()} kcal` : "Not set"} next={`${target.kcal.toLocaleString()} kcal`} same={settings.dailyCalorieLimit === target.kcal} colors={c} />
                <Goal label="Protein" now={settings.dailyProteinLimit != null ? `${settings.dailyProteinLimit} g` : "Not set"} next={`${proteinGoal} g`} same={settings.dailyProteinLimit === proteinGoal} colors={c} />
              </View>
            </Card>
          )}

          <Text style={{ marginHorizontal: 4, fontSize: 12, lineHeight: 18, color: c.faint }}>
            Estimates, not medical advice. Burn at rest is the Mifflin–St Jeor equation; a day&apos;s burn multiplies it by how active you are. BMI doesn&apos;t tell muscle from fat.
          </Text>
        </View>
      </Row>

      <InfoCard info={info} onClose={() => setInfo(null)} colors={c} />
    </WebPage>
  );
}

function Line({ colors: c }: { colors: OrbitColors }) {
  return <View style={{ height: 1, backgroundColor: c.border }} />;
}

// A row: its label on the left, what it holds on the right (a link when it
// opens a page).
function Field({ label, onPress, children, colors: c }: { label: string; onPress?: () => void; children: ReactNode; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "link" : undefined}
      style={hoverable(({ hovered }: Hover) => ({ minHeight: 50, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: hovered && onPress ? c.pill : "transparent" }))}
    >
      <Text style={{ flex: 1, fontSize: 14, color: c.text }}>{label}</Text>
      {children}
    </Pressable>
  );
}

function Chip({ label, on, onPress, colors: c }: { label: string; on: boolean; onPress: () => void; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={hoverable(({ hovered }: Hover) => ({ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: on ? c.ink : hovered ? c.track : c.pill }))}
    >
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{label}</Text>
    </Pressable>
  );
}

// One of your numbers, a third of the width. (`strong`: one to aim for —
// in Health's colour.)
function Figure({ label, value, unit, detail, strong, onPress, colors: c }: { label: string; value: string; unit?: string; detail: string; strong?: boolean; onPress: () => void; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="How it's worked out"
      style={hoverable(({ hovered }: Hover) => ({ flexBasis: "30%", flexGrow: 1, minWidth: 170, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: strong ? c.fill : c.border, backgroundColor: hovered ? c.pill : c.surface }))}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 12.5, color: c.muted }}>{label}</Text>
        <Ionicons name="information-circle-outline" size={15} color={c.faint} />
      </View>
      <Text style={{ marginTop: 4, fontSize: 24, fontWeight: "800", color: value === "—" ? c.faint : c.text }} numberOfLines={1}>
        {value}
        {unit && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}> {unit}</Text>}
      </Text>
      <Text style={{ marginTop: 3, fontSize: 12, lineHeight: 16, color: c.faint }}>{detail}</Text>
    </Pressable>
  );
}

// A daily goal: what it is now, and what it'd be.
function Goal({ label, now, next, same, colors: c }: { label: string; now: string; next: string; same: boolean; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12.5, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 3, fontSize: 18, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }}>
        {same ? (
          next
        ) : (
          <>
            <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>{now} → </Text>
            {next}
          </>
        )}
      </Text>
    </View>
  );
}
