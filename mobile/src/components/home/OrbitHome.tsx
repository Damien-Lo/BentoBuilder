import { Ionicons } from "@expo/vector-icons";
import { requireOptionalNativeModule } from "expo";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useAccount } from "@/src/components/auth/AuthGate";
import { OrbSphere } from "@/src/components/ui/OrbSphere";
import { QuickActions } from "@/src/components/ui/QuickActions";
import { Tap } from "@/src/components/ui/Tap";
import { minutesLabel } from "@/src/components/calendar/calendarUtils";
import { mealLine } from "@/src/components/calendar/mealFood";
import { dayLabel, durationLabel } from "@/src/components/gym/schedule";
import { showMeasure, useUnits } from "@/src/components/health/units";
import type { Units } from "@/src/services/settingsService";
import { sessionTotals } from "@/src/services/gymApi";
import { updateTodoTask } from "@/src/services/todoApi";
import { nutrientColor } from "@/src/theme/nutrients";
import { sectionColor, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

import { useToday, type Today } from "./useToday";

// The phone's home screen: the assistant — the orb — at the centre, and
// the app's sections on an orbit around it, each with its one number for
// today. The selected section sits at the top (Calendar, to start); tapping
// another turns the orbit to bring it up — or it can be turned by hand,
// dragged round and let go, settling on the section nearest the top — and the panel below shows what
// matters in it now, with its quick actions — tap it again to open the
// section. The ring round the orb is the selected section's progress (the
// day so far, calories, tasks done). Tapping the orb opens quick actions —
// where the voice assistant will go.

type SectionId = "calendar" | "kitchen" | "gym" | "health" | "documents" | "tasks";
interface Section {
  id: SectionId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: Href;
  soon?: boolean;
}
const ORBIT: Section[] = [
  { id: "calendar", label: "Calendar", icon: "calendar-outline", route: "/calendar" },
  { id: "kitchen", label: "Kitchen", icon: "restaurant-outline", route: "/planner" },
  // (Nutrition is part of Health now — its pages are in Health's list.)
  { id: "gym", label: "Gym", icon: "barbell-outline", route: "/gym" as Href },
  { id: "health", label: "Health", icon: "pulse-outline", route: "/health-section" as Href },
  // (Files, meeting notes, documents and planning — in place of Home: the
  // house's chores and upkeep fit Tasks' lists and projects.)
  { id: "documents", label: "Docs", icon: "document-text-outline", soon: true },
  { id: "tasks", label: "Tasks", icon: "checkmark-circle-outline", route: "/lists" },
];
const STEP = 360 / ORBIT.length;


// (A light tap felt when the orbit turns — where the app has it.)
function tick() {
  if (Platform.OS === "web" || !requireOptionalNativeModule("ExpoHaptics")) return;
  void import("expo-haptics").then((h) => h.selectionAsync()).catch(() => {});
}

function inWords(minutes: number) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} hour${h === 1 ? "" : "s"}`;
}

// The line at the top: what's on now, or next if it's soon, or hello.
function headline(t: Today, name: string) {
  if (t.happening) return t.happening.meal ? `${t.happening.title} time` : `${t.happening.title} now`;
  const next = t.upcoming[0];
  if (next && next.startMinutes - t.now <= 180) return `${next.title} in ${inWords(next.startMinutes - t.now)}`;
  const hour = Math.floor(t.now / 60);
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}${name ? `, ${name}` : ""}`;
}

// Each section's number on the orbit, and its ring round the orb.
function glance(id: SectionId, t: Today, units: Units): { value: string; ring: number; caption: string } {
  const kcal = Math.round(t.eaten.calories ?? 0);
  switch (id) {
    case "calendar": {
      const next = t.happening ?? t.upcoming[0];
      return { value: next ? minutesLabel(next.startMinutes) : "Free", ring: t.dayProgress, caption: `${Math.round(t.dayProgress * 100)}% of the day gone` };
    }
    case "kitchen":
      return {
        value: t.nextMeal ? t.nextMeal.title : t.expiring.length ? `${t.expiring.length} expiring` : "—",
        // (The ring: the day's calories against the goal.)
        ring: t.goal ? Math.min(1, kcal / t.goal) : 0,
        caption: t.goal ? `${kcal.toLocaleString()} of ${t.goal.toLocaleString()} kcal` : `${kcal.toLocaleString()} kcal today`,
      };
    case "health":
      return {
        value: t.latestWeight ? showMeasure("weight", t.latestWeight.weight, units) : "—",
        ring: t.weightProgress,
        caption: t.latestWeight ? `${Math.round(t.weightProgress * 100)}% of the way to your goal` : "No weigh-ins yet",
      };
    case "gym": {
      // (The time trained this week — "2h 15m"; the ring: the days of the
      // week trained on.)
      const seconds = t.gym.week.sessions.reduce((n, session) => n + sessionTotals(session).seconds, 0);
      const when = t.gym.last ? dayLabel(t.gym.last.finishedAt) : "";
      return {
        value: seconds ? durationLabel(seconds) : "0h",
        ring: t.gym.week.days.filter((d) => d.done).length / 7,
        caption: t.gym.active ? `${t.gym.active.name} under way` : t.gym.last ? `Last: ${t.gym.last.name}, ${when === "Today" || when === "Yesterday" ? when.toLowerCase() : when}` : "No workouts yet",
      };
    }
    case "tasks":
      return {
        value: t.tasks.length ? `${t.tasks.length} due` : "All done",
        ring: t.myDayTotal ? t.doneToday / t.myDayTotal : 0,
        caption: t.myDayTotal ? `${t.doneToday} of ${t.myDayTotal} done today` : "Nothing in My Day",
      };
    default:
      return { value: "soon", ring: 0, caption: "Coming soon" };
  }
}

// --- The orb's ring ---

// The selected section's progress, as a ring of short marks.
function Ring({ size, value, colors }: { size: number; value: number; colors: OrbitColors }) {
  const marks = 48;
  const filled = Math.round(Math.max(0, Math.min(1, value)) * marks);
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
      {Array.from({ length: marks }, (_, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: size / 2 - 1.25,
            top: size / 2 - 4,
            width: 2.5,
            height: 8,
            borderRadius: 1.25,
            backgroundColor: i < filled ? colors.fill : colors.track,
            transform: [{ rotate: `${i * (360 / marks)}deg` }, { translateY: -size / 2 + 4 }],
          }}
        />
      ))}
    </View>
  );
}

// --- The orbit -----------------------------------------------------------

function Node({ section, index, turn, centre, radius, selected, value, onPress, colors }: { section: Section; index: number; turn: SharedValue<number>; centre: number; radius: number; selected: boolean; value: string; onPress: () => void; colors: OrbitColors }) {
  const box = 96;
  const dot = selected ? 62 : 54;
  // In its section's colour: the icon, or — chosen — the whole node, with a
  // soft ring of it round.
  const { dark } = useOrbitTheme();
  const hue = section.soon ? null : sectionColor(section.id, dark);
  const place = useAnimatedStyle(() => {
    const a = ((-90 + index * STEP + turn.value) * Math.PI) / 180;
    return { transform: [{ translateX: centre + radius * Math.cos(a) - box / 2 }, { translateY: centre + radius * Math.sin(a) - dot / 2 }] };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: box, alignItems: "center" }, place]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${section.label}, ${value}`}
        accessibilityState={{ selected }}
        style={{
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? (hue ?? colors.ink) : section.soon ? colors.nodeSoon : colors.node,
          borderWidth: selected ? 3 : 1,
          borderColor: selected ? (hue ? `${hue}59` : colors.selectedRing) : colors.nodeBorder,
        }}
      >
        <Ionicons name={section.icon} size={selected ? 24 : 21} color={selected ? colors.onInk : section.soon ? colors.faint : (hue ?? colors.icon)} />
      </Pressable>
      <Text numberOfLines={1} style={{ marginTop: 5, fontSize: 12, fontWeight: "600", color: section.soon ? colors.faint : colors.text }}>
        {section.label}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted, maxWidth: box }}>
        {value}
      </Text>
    </Animated.View>
  );
}

// --- A section's own nodes --------------------------------------------------

// The section at the top shows its own nodes in a fan above it (for now
// three empty ones, while what goes in them is planned). They grow out of
// it one after another once it's there, and fold away while the orbit
// turns. (The orbit keeps room above it for them, so nothing on the page
// moves.)
//
// Off for now (Oct 22, 2026): tried, and the orbit read as busier than it's
// worth while sub-sections live inside each section. Set to true to bring
// it back — the room above the orbit comes with it.
const SHOW_SUB_NODES = false;
const SUB_COUNT = 3;
const SUB_SIZE = 38;
const SUB_REACH = 62; // from the section's centre to each of its nodes
const SUB_SPREAD = 54; // degrees between neighbours
function SubNode({ k, open, wait, x, y, color, colors }: { k: number; open: boolean; wait: number; x: number; y: number; color: string; colors: OrbitColors }) {
  const still = useReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    // (Out from the middle one first — once the section has turned to the
    // top, `wait` — and back in all at once.)
    const order = Math.abs(k - (SUB_COUNT - 1) / 2);
    shown.value = still ? (open ? 1 : 0) : open ? withDelay(wait + order * 60, withSpring(1, { damping: 14, stiffness: 180 })) : withTiming(0, { duration: 140 });
  }, [open, wait, k, still, shown]);
  const a = ((-90 + (k - (SUB_COUNT - 1) / 2) * SUB_SPREAD) * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value),
    transform: [{ translateX: x + SUB_REACH * Math.cos(a) * shown.value - SUB_SIZE / 2 }, { translateY: y + SUB_REACH * Math.sin(a) * shown.value - SUB_SIZE / 2 }, { scale: 0.4 + 0.6 * shown.value }],
  }));
  return (
    <Animated.View pointerEvents={open ? "auto" : "none"} style={[{ position: "absolute", left: 0, top: 0 }, style]}>
      {/* (Tap, not a Pressable with a style function: NativeWind drops those on a phone.) */}
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Empty"
        style={{ width: SUB_SIZE, height: SUB_SIZE, borderRadius: SUB_SIZE / 2, backgroundColor: colors.node, borderWidth: 1.5, borderStyle: "dashed", borderColor: color }}
        pressedStyle={{ backgroundColor: colors.pill }}
      />
    </Animated.View>
  );
}

// --- The panel for the selected section -----------------------------------

function Row({ icon, iconColor, title, detail, right, onPress, colors }: { icon: keyof typeof Ionicons.glyphMap; iconColor?: string; title: string; detail?: string; right?: React.ReactNode; onPress?: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} disabled={!onPress} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
      <Ionicons name={icon} size={18} color={iconColor ?? colors.muted} />
      <View style={{ marginLeft: 12, flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>
          {title}
        </Text>
        {!!detail && (
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>
            {detail}
          </Text>
        )}
      </View>
      {right}
    </Tap>
  );
}

function Action({ label, icon, onPress, primary, colors }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean; colors: OrbitColors }) {
  return (
    <Tap
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: primary ? colors.ink : colors.pill }}
      pressedStyle={{ opacity: 0.75 }}
    >
      <Ionicons name={icon} size={15} color={primary ? colors.onInk : colors.onPill} />
      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: primary ? colors.onInk : colors.onPill }}>{label}</Text>
    </Tap>
  );
}

function Panel({ section, t, go, onDone, colors }: { section: Section; t: Today; go: (route: Href) => void; onDone: () => void; colors: OrbitColors }) {
  const { dark } = useOrbitTheme();
  const [units] = useUnits("weight");
  const open = section.route ? <Action label={`Open ${section.label}`} icon="arrow-forward" primary onPress={() => go(section.route!)} colors={colors} /> : null;
  const quiet = (text: string) => <Text style={{ paddingVertical: 8, fontSize: 14, color: colors.muted }}>{text}</Text>;
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (section.id === "calendar") {
    const shown = t.later.slice(0, 4);
    body = shown.length
      ? shown.map((e) => (
          <Row
            key={`${e._id}-${e.occurrenceDate}`}
            icon={e.meal ? "restaurant-outline" : "time-outline"}
            iconColor={e === t.happening ? colors.accent : colors.muted}
            title={e.title}
            detail={`${e === t.happening ? "Now" : minutesLabel(e.startMinutes)} – ${minutesLabel(e.endMinutes)}${e.meal ? ` · ${mealLine(e)}` : ""}`}
            colors={colors}
          />
        ))
      : quiet("Nothing else today.");
    actions = <Action label="New event" icon="add" onPress={() => go("/calendar/edit")} colors={colors} />;
  } else if (section.id === "kitchen") {
    const meals = t.meals.filter((e) => e.endMinutes > t.now).slice(0, 2);
    body = (
      <>
        {meals.map((e) => (
          <Row key={`${e._id}-${e.occurrenceDate}`} icon="restaurant-outline" iconColor={colors.success} title={`${e.title} · ${minutesLabel(e.startMinutes)}`} detail={mealLine(e)} colors={colors} />
        ))}
        {t.expiring.slice(0, 2).map((p) => {
          const day = (p.expiryDate ?? "").slice(0, 10);
          return (
            <Row
              key={p._id}
              icon="hourglass-outline"
              iconColor={colors.warning}
              title={`${p.ingredient?.name ?? "Something"} ${day < t.today ? "is past its date" : `expires ${day === t.today ? "today" : day.slice(5).split("-").reverse().join("/")}`}`}
              onPress={() => go("/PantryMainPage")}
              colors={colors}
            />
          );
        })}
        {!meals.length && !t.expiring.length && quiet("No more meals planned today.")}
      </>
    );
    actions = <Action label="Grocery list" icon="cart-outline" onPress={() => go("/grocery-list")} colors={colors} />;
  } else if (section.id === "health") {
    // (What you've eaten against your goals, then your weight.)
    const bar = (label: string, value: number | null | undefined, limit: number | null, color: string) => {
      const share = limit ? Math.min(1, (value ?? 0) / limit) : 0;
      return (
        <View key={label} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onPill }}>{label}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {Math.round(value ?? 0)}
              {limit ? ` / ${limit}` : ""} g
            </Text>
          </View>
          <View style={{ marginTop: 4, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: colors.track }}>
            <View style={{ width: `${share * 100}%`, height: "100%", borderRadius: 3, backgroundColor: color }} />
          </View>
        </View>
      );
    };
    const left = t.goal - Math.round(t.eaten.calories ?? 0);
    body = (
      <>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>
          {Math.max(0, left).toLocaleString()} <Text style={{ fontSize: 14, fontWeight: "400", color: colors.muted }}>kcal {left >= 0 ? "left" : "over"}</Text>
        </Text>
        {bar("Protein", t.eaten.protein, t.settings.dailyProteinLimit, nutrientColor("protein", dark))}
        {bar("Carbs", t.eaten.carbs, t.settings.dailyCarbsLimit, nutrientColor("carbs", dark))}
        {bar("Fat", t.eaten.fats, t.settings.dailyFatsLimit, nutrientColor("fats", dark))}
        <View style={{ marginTop: 10 }}>
          {t.latestWeight ? (
            <Row
              icon="scale-outline"
              title={showMeasure("weight", t.latestWeight.weight, units)}
              detail={`${t.weightChange == null ? "Weighed" : `${t.weightChange > 0 ? "+" : ""}${showMeasure("weight", t.weightChange, units)} this week · weighed`} ${t.latestWeight.date === t.today ? "today" : t.latestWeight.date}${t.settings.goalWeight ? ` · goal ${showMeasure("weight", t.settings.goalWeight, units)}` : ""}`}
              colors={colors}
            />
          ) : (
            quiet("No weigh-ins yet.")
          )}
        </View>
      </>
    );
    actions = <Action label="Log weight" icon="add" onPress={() => go("/health/weight")} colors={colors} />;
  } else if (section.id === "tasks") {
    body = t.tasks.length
      ? t.tasks.slice(0, 4).map(({ task, late }) => (
          <Row
            key={task._id}
            icon="ellipse-outline"
            iconColor={late ? colors.danger : colors.faint}
            title={task.title}
            detail={late ? "Overdue" : task.list?.name}
            onPress={() => void updateTodoTask(task._id, { completed: true }).then(onDone, () => {})}
            right={<Text style={{ fontSize: 12, color: colors.faint }}>Done</Text>}
            colors={colors}
          />
        ))
      : quiet("Nothing due — nice.");
    actions = <Action label="New task" icon="add" onPress={() => go("/lists")} colors={colors} />;
  } else if (section.id === "gym") {
    // (This week, what's planned today — nothing yet — or the one under
    // way, then the last one.)
    const { week, last, active } = t.gym;
    const lastTotals = last ? sessionTotals(last) : null;
    body = (
      <>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>
          {week.sessions.length} <Text style={{ fontSize: 14, fontWeight: "400", color: colors.muted }}>workout{week.sessions.length === 1 ? "" : "s"} this week</Text>
        </Text>
        {active ? (
          <Row icon="barbell" iconColor={colors.success} title={active.name} detail="Under way" onPress={() => go("/gym/session" as Href)} colors={colors} />
        ) : (
          <Row icon="calendar-clear-outline" title="Nothing planned today" colors={colors} />
        )}
        {last && lastTotals && (
          <Row
            icon="checkmark-circle-outline"
            title={last.name}
            detail={`${dayLabel(last.finishedAt)} · ${durationLabel(lastTotals.seconds)} · ${lastTotals.sets} sets · ${Math.round(lastTotals.volume).toLocaleString()} lbs`}
            onPress={() => go(`/gym/sessions/${last._id}` as Href)}
            colors={colors}
          />
        )}
      </>
    );
    actions = active ? (
      <Action label="Resume" icon="play" onPress={() => go("/gym/session" as Href)} colors={colors} />
    ) : null;
  } else {
    body = quiet("Your files, notes, documents and plans, all in one place — on its way.");
  }

  return (
    <Animated.View key={section.id} entering={FadeInDown.duration(260)} style={{ borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
      <View style={{ marginBottom: 4, flexDirection: "row", alignItems: "center" }}>
        <Ionicons name={section.icon} size={16} color={colors.muted} />
        <Text style={{ marginLeft: 8, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.faint }}>{section.label}</Text>
      </View>
      {body}
      {(actions || open) && (
        <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {actions}
          {open}
        </View>
      )}
    </Animated.View>
  );
}

// --- The screen ------------------------------------------------------------

export function OrbitHome() {
  const router = useRouter();
  const { account } = useAccount();
  const { colors, dark } = useOrbitTheme();
  const t = useToday();
  const [units] = useUnits("weight");
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<SectionId>("calendar");
  const [asking, setAsking] = useState(false);
  // The selected section's own nodes, fanned out above it — away only while
  // the orbit is turned by hand (`wait`: after a turn brings it to the top).
  const [open, setOpen] = useState(true);
  const [wait, setWait] = useState(0);

  // The orbit's turn (degrees): the selected section at the top.
  const turn = useSharedValue(0);
  const turned = useRef(0);
  const still = useReducedMotion();
  function select(section: Section) {
    // (Letting go of a turn isn't a tap on what's under the finger.)
    if (Date.now() - draggedAt.current < 400) return;
    // (From where the orbit is turned to — it may still be settling from a
    // turn by hand, with the selection not caught up yet.)
    const from = ((Math.round(-turned.current / STEP) % ORBIT.length) + ORBIT.length) % ORBIT.length;
    if (section.id === ORBIT[from].id) {
      if (section.route) router.push(section.route);
      return;
    }
    // (Another: it turns to the top, and its nodes open as it gets there.)
    setWait(still ? 0 : 320);
    setOpen(true);
    const to = ORBIT.findIndex((s) => s.id === section.id);
    let delta = ((to - from) * STEP) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    turned.current -= delta;
    turn.value = still ? turned.current : withTiming(turned.current, { duration: 520, easing: Easing.out(Easing.cubic) });
    setSelected(section.id);
    tick();
  }
  const go = (route: Href) => router.push(route);

  // Turning it by hand: the orbit follows the finger round its centre, with
  // a tick as each section passes the top; let go, it springs on from the
  // speed it had to the section nearest the top, which is then the selected
  // one. (Nothing else on the page changes until then: redrawing the panel
  // and the ring mid-turn made it stutter.)
  const scrollRef = useRef<ScrollView>(null);
  const draggedAt = useRef(0);
  const dragging = () => {
    draggedAt.current = Date.now();
    setOpen(false);
  };
  const dragFrom = useSharedValue(0); // the finger's angle last time (radians)
  const showing = useSharedValue(0); // the section at the top while dragging
  const indexAt = (deg: number) => {
    "worklet";
    const n = ORBIT.length;
    return ((Math.round(-deg / STEP) % n) + n) % n;
  };
  // Where it's settling (straight away, for taps to turn on from), then —
  // once it's at rest — the section that's selected.
  function landing(at: number) {
    draggedAt.current = Date.now();
    turned.current = at;
  }
  function settle(index: number) {
    setSelected(ORBIT[index].id);
    setWait(0);
    setOpen(true);
  }

  const size = Math.min(width - 24, 400);
  const centre = size / 2;
  const radius = size * 0.39;
  const orb = size * 0.3;
  const ring = size * 0.43;
  const current = ORBIT.find((s) => s.id === selected)!;
  // Room kept above the orbit for the top section's nodes.
  const roomAbove = SHOW_SUB_NODES ? Math.max(0, SUB_REACH + SUB_SIZE / 2 - (centre - radius) - 4) : 0;
  const turning = Gesture.Pan()
    // (A tap on a section or the orb is still a tap; the page still scrolls
    // from everywhere else.)
    .minDistance(8)
    // (The page's scroll waits while the orbit is being turned.)
    .blocksExternalGesture(scrollRef as unknown as React.RefObject<React.ComponentType>)
    .onBegin((e) => {
      dragFrom.value = Math.atan2(e.y - centre, e.x - centre);
      showing.value = indexAt(turn.value);
    })
    .onStart(() => {
      runOnJS(dragging)();
    })
    .onUpdate((e) => {
      const a = Math.atan2(e.y - centre, e.x - centre);
      let d = a - dragFrom.value;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      dragFrom.value = a;
      turn.value += (d * 180) / Math.PI;
      const now = indexAt(turn.value);
      if (now !== showing.value) {
        showing.value = now;
        runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      // How fast it was turning (degrees a second), from the finger's speed
      // across the line to the centre; a short way further on, then the
      // nearest section.
      const x = e.x - centre;
      const y = e.y - centre;
      const r2 = Math.max(x * x + y * y, 400);
      const spin = (((x * e.velocityY - y * e.velocityX) / r2) * 180) / Math.PI;
      const at = Math.round((turn.value + spin * 0.15) / STEP) * STEP;
      const index = indexAt(at);
      turn.value = withSpring(at, { velocity: spin, damping: 22, stiffness: 170, mass: 1 }, (finished) => {
        if (finished) runOnJS(settle)(index);
      });
      if (index !== showing.value) runOnJS(tick)();
      runOnJS(landing)(at);
    });
  const focus = glance(selected, t, units);
  const name = account?.name.split(" ")[0] ?? "";
  const date = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
  const isAdmin = account?.role === "admin";
  const corner = (icon: keyof typeof Ionicons.glyphMap, label: string, route: Href) => (
    <Tap onPress={() => go(route)} hitSlop={6} accessibilityLabel={label} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 }} pressedStyle={{ backgroundColor: colors.pill }}>
      <Ionicons name={icon} size={21} color={colors.muted} />
    </Tap>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* The top: the time, and what's on */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 1.5, color: colors.muted }}>
              {date} · {minutesLabel(t.now)}
            </Text>
            <Animated.Text key={headline(t, name)} entering={FadeIn.duration(300)} style={{ marginTop: 4, fontSize: 28, lineHeight: 36, fontWeight: "700", color: colors.text }}>
              {headline(t, name)}
            </Animated.Text>
          </View>
          <View style={{ marginLeft: 12, flexDirection: "row", gap: 4 }}>
            {isAdmin && corner("construct-outline", "Developer", "/developer/home")}
            {corner("settings-outline", "Settings", "/settings-section" as Href)}
          </View>
        </View>

        {/* The orbit — turned by tapping a section, or by hand */}
        <GestureDetector gesture={turning}>
        <View style={{ width: size, height: centre + radius + 72, alignSelf: "center", marginTop: 8 + roomAbove }}>
          <View pointerEvents="none" style={{ position: "absolute", left: centre - radius, top: centre - radius, width: radius * 2, height: radius * 2, borderRadius: radius, borderWidth: 1.5, borderStyle: "dotted", borderColor: colors.orbit }} />
          <View style={{ position: "absolute", left: centre - ring / 2, top: centre - ring / 2, width: ring, height: ring, alignItems: "center", justifyContent: "center" }}>
            <Ring size={ring} value={focus.ring} colors={colors} />
            <OrbSphere size={orb} onPress={() => setAsking(true)} colors={colors} dark={dark} />
          </View>
          {ORBIT.map((section, index) => (
            <Node
              key={section.id}
              section={section}
              index={index}
              turn={turn}
              centre={centre}
              radius={radius}
              selected={section.id === selected}
              value={glance(section.id, t, units).value}
              onPress={() => select(section)}
              colors={colors}
            />
          ))}
          {SHOW_SUB_NODES && Array.from({ length: SUB_COUNT }, (_, k) => (
            <SubNode key={`${selected}-${k}`} k={k} open={open} wait={wait} x={centre} y={centre - radius} color={(current.soon ? null : sectionColor(current.id, dark)) ?? colors.faint} colors={colors} />
          ))}
        </View>
        </GestureDetector>
        <Text style={{ textAlign: "center", fontSize: 12, color: colors.muted }}>{focus.caption}</Text>

        {/* What matters in the selected section */}
        <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
          <Panel section={current} t={t} go={go} onDone={t.reload} colors={colors} />
        </View>
      </ScrollView>

      {/* The orb's quick actions (later: the voice assistant) */}
      <QuickActions visible={asking} onClose={() => setAsking(false)} />
    </SafeAreaView>
  );
}
