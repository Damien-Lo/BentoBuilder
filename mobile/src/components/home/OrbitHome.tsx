import { Ionicons } from "@expo/vector-icons";
import { requireOptionalNativeModule } from "expo";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAccount } from "@/src/components/auth/AuthGate";
import { minutesLabel } from "@/src/components/calendar/calendarUtils";
import { mealLine } from "@/src/components/calendar/mealFood";
import { updateTodoTask } from "@/src/services/todoApi";

import { useToday, type Today } from "./useToday";

// The phone's home screen: the assistant — the orb — at the centre, and
// the app's sections on an orbit around it, each with its one number for
// today. The selected section sits at the top (Calendar, to start); tapping
// another turns the orbit to bring it up, and the panel below shows what
// matters in it now, with its quick actions — tap it again to open the
// section. The ring round the orb is the selected section's progress (the
// day so far, calories, tasks done). Tapping the orb opens quick actions —
// where the voice assistant will go.

type SectionId = "calendar" | "kitchen" | "nutrition" | "health" | "home" | "tasks";
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
  { id: "nutrition", label: "Nutrition", icon: "leaf-outline", route: "/health" },
  { id: "health", label: "Health", icon: "pulse-outline", route: "/health/weight" },
  { id: "home", label: "Home", icon: "home-outline", soon: true },
  { id: "tasks", label: "Tasks", icon: "checkmark-circle-outline", route: "/lists" },
];
const STEP = 360 / ORBIT.length;

const QUICK: { label: string; icon: keyof typeof Ionicons.glyphMap; route: Href }[] = [
  { label: "Plan a meal", icon: "restaurant-outline", route: "/planner" },
  { label: "Add to the grocery list", icon: "cart-outline", route: "/grocery-list" },
  { label: "New event", icon: "calendar-outline", route: "/calendar/edit" },
  { label: "New task", icon: "checkbox-outline", route: "/lists" },
  { label: "Log weight", icon: "scale-outline", route: "/health/weight" },
];

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
function glance(id: SectionId, t: Today): { value: string; ring: number; caption: string } {
  const kcal = Math.round(t.eaten.calories ?? 0);
  switch (id) {
    case "calendar": {
      const next = t.happening ?? t.upcoming[0];
      return { value: next ? minutesLabel(next.startMinutes) : "Free", ring: t.dayProgress, caption: `${Math.round(t.dayProgress * 100)}% of the day gone` };
    }
    case "kitchen":
      return {
        value: t.nextMeal ? t.nextMeal.title : t.expiring.length ? `${t.expiring.length} expiring` : "—",
        ring: t.mealsPlanned ? t.mealsEaten / t.mealsPlanned : 0,
        caption: t.mealsPlanned ? `${t.mealsEaten} of ${t.mealsPlanned} meals eaten` : "Nothing planned today",
      };
    case "nutrition":
      return { value: `${Math.round((kcal / t.goal) * 100)}%`, ring: Math.min(1, kcal / t.goal), caption: `${kcal.toLocaleString()} of ${t.goal.toLocaleString()} kcal` };
    case "health":
      return {
        value: t.latestWeight ? `${t.latestWeight.weight} lbs` : "—",
        ring: t.weightProgress,
        caption: t.latestWeight ? `${Math.round(t.weightProgress * 100)}% of the way to your goal` : "No weigh-ins yet",
      };
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

// --- The orb -------------------------------------------------------------

// A soft sphere, lit from the top left: in a browser a real gradient; on
// the phone (no gradient drawing in the app) many thin circles, each a
// shade lighter and a little further towards the light, which blend into
// one. It breathes slowly (unless motion is turned down).
// (The same light as the browser's gradient: from the edge, deep blue, to
// the bright spot at 36% across, 30% down.)
const STOPS: [number, string][] = [
  [0, "#EFF6FF"],
  [0.2, "#93C5FD"],
  [0.52, "#3B82F6"],
  [1, "#1E3A8A"],
];
// (A browser's gradient reaches to the far corner, so the near edge stays
// light: the same here.)
const REACH = 0.78;
function shade(r: number) {
  const i = Math.max(1, STOPS.findIndex(([at]) => at >= r));
  const [a, from] = STOPS[i - 1];
  const [b, to] = STOPS[i];
  const local = Math.max(0, Math.min(1, (r - a) / (b - a)));
  const mix = (j: number) => Math.round(parseInt(from.slice(j, j + 2), 16) * (1 - local) + parseInt(to.slice(j, j + 2), 16) * local);
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}
function Orb({ size, onPress }: { size: number; onPress: () => void }) {
  const still = useReducedMotion();
  const breath = useSharedValue(1);
  useEffect(() => {
    if (!still) breath.value = withRepeat(withTiming(1.035, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [still, breath]);
  const breathing = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const layers = 40;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Ask or add something">
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: shade(REACH), overflow: "hidden" },
          Platform.OS === "web"
            ? ({ boxShadow: "0 18px 50px rgba(37, 99, 235, 0.45)", backgroundImage: "radial-gradient(circle at 36% 30%, #EFF6FF 0%, #93C5FD 20%, #3B82F6 52%, #1E3A8A 100%)" } as object)
            : { shadowColor: "#2563EB", shadowOpacity: 0.5, shadowRadius: 26, shadowOffset: { width: 0, height: 12 } },
          breathing,
        ]}
      >
        {Platform.OS !== "web" &&
          Array.from({ length: layers }, (_, k) => {
            // From the outside in: each circle smaller, its centre nearer
            // the bright spot, its colour the gradient's at that distance.
            const r = 1 - k / layers;
            const d = size * r;
            const cx = size * (0.5 + (0.36 - 0.5) * (1 - r));
            const cy = size * (0.5 + (0.3 - 0.5) * (1 - r));
            return <View key={k} style={{ position: "absolute", width: d, height: d, borderRadius: d / 2, left: cx - d / 2, top: cy - d / 2, backgroundColor: shade(r * REACH) }} />;
          })}
      </Animated.View>
    </Pressable>
  );
}

// The selected section's progress, as a ring of short marks.
function Ring({ size, value }: { size: number; value: number }) {
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
            backgroundColor: i < filled ? "#0F172A" : "#DDE3EA",
            transform: [{ rotate: `${i * (360 / marks)}deg` }, { translateY: -size / 2 + 4 }],
          }}
        />
      ))}
    </View>
  );
}

// --- The orbit -----------------------------------------------------------

function Node({ section, index, turn, centre, radius, selected, value, onPress }: { section: Section; index: number; turn: SharedValue<number>; centre: number; radius: number; selected: boolean; value: string; onPress: () => void }) {
  const box = 96;
  const dot = selected ? 62 : 54;
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
          backgroundColor: selected ? "#0F172A" : section.soon ? "#F1F5F9" : "#FFFFFF",
          borderWidth: selected ? 3 : 1,
          borderColor: selected ? "#93C5FD" : "#E2E8F0",
        }}
      >
        <Ionicons name={section.icon} size={selected ? 24 : 21} color={selected ? "#FFFFFF" : section.soon ? "#94A3B8" : "#334155"} />
      </Pressable>
      <Text numberOfLines={1} style={{ marginTop: 5, fontSize: 12, fontWeight: "600", color: section.soon ? "#94A3B8" : "#0F172A" }}>
        {section.label}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 11, color: "#64748B", maxWidth: box }}>
        {value}
      </Text>
    </Animated.View>
  );
}

// --- The panel for the selected section -----------------------------------

function Row({ icon, iconColor = "#64748B", title, detail, right, onPress }: { icon: keyof typeof Ionicons.glyphMap; iconColor?: string; title: string; detail?: string; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="flex-row items-center py-2.5 active:opacity-70">
      <Ionicons name={icon} size={18} color={iconColor} />
      <View className="ml-3 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-semibold text-slate-900">
          {title}
        </Text>
        {!!detail && (
          <Text numberOfLines={1} className="text-xs text-slate-500">
            {detail}
          </Text>
        )}
      </View>
      {right}
    </Pressable>
  );
}

function Action({ label, icon, onPress, primary }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} className={`flex-row items-center rounded-full px-3.5 py-2 ${primary ? "bg-slate-900 active:bg-slate-700" : "bg-slate-100 active:bg-slate-200"}`}>
      <Ionicons name={icon} size={15} color={primary ? "#FFFFFF" : "#334155"} />
      <Text className={`ml-1.5 text-[13px] font-semibold ${primary ? "text-white" : "text-slate-700"}`}>{label}</Text>
    </Pressable>
  );
}

function Panel({ section, t, go, onDone }: { section: Section; t: Today; go: (route: Href) => void; onDone: () => void }) {
  const open = section.route ? <Action label={`Open ${section.label}`} icon="arrow-forward" primary onPress={() => go(section.route!)} /> : null;
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (section.id === "calendar") {
    const shown = t.later.slice(0, 4);
    body = shown.length ? (
      shown.map((e) => (
        <Row
          key={`${e._id}-${e.occurrenceDate}`}
          icon={e.meal ? "restaurant-outline" : "time-outline"}
          iconColor={e === t.happening ? "#2563EB" : "#64748B"}
          title={e.title}
          detail={`${e === t.happening ? "Now" : minutesLabel(e.startMinutes)} – ${minutesLabel(e.endMinutes)}${e.meal ? ` · ${mealLine(e)}` : ""}`}
        />
      ))
    ) : (
      <Text className="py-2 text-sm text-slate-500">Nothing else today.</Text>
    );
    actions = <Action label="New event" icon="add" onPress={() => go("/calendar/edit")} />;
  } else if (section.id === "kitchen") {
    const meals = t.meals.filter((e) => e.endMinutes > t.now).slice(0, 2);
    body = (
      <>
        {meals.map((e) => (
          <Row key={`${e._id}-${e.occurrenceDate}`} icon="restaurant-outline" iconColor="#10B981" title={`${e.title} · ${minutesLabel(e.startMinutes)}`} detail={mealLine(e)} />
        ))}
        {t.expiring.slice(0, 2).map((p) => (
          <Row
            key={p._id}
            icon="hourglass-outline"
            iconColor="#B45309"
            title={`${p.ingredient?.name ?? "Something"} ${(p.expiryDate ?? "").slice(0, 10) < t.today ? "is past its date" : `expires ${(p.expiryDate ?? "").slice(0, 10) === t.today ? "today" : (p.expiryDate ?? "").slice(5, 10).split("-").reverse().join("/")}`}`}
            onPress={() => go("/PantryMainPage")}
          />
        ))}
        {!meals.length && !t.expiring.length && <Text className="py-2 text-sm text-slate-500">No more meals planned today.</Text>}
      </>
    );
    actions = <Action label="Grocery list" icon="cart-outline" onPress={() => go("/grocery-list")} />;
  } else if (section.id === "nutrition") {
    const bar = (label: string, value: number | null | undefined, limit: number | null, color: string) => {
      const share = limit ? Math.min(1, (value ?? 0) / limit) : 0;
      return (
        <View key={label} className="mt-2.5">
          <View className="flex-row justify-between">
            <Text className="text-xs font-semibold text-slate-600">{label}</Text>
            <Text className="text-xs text-slate-500">
              {Math.round(value ?? 0)}
              {limit ? ` / ${limit}` : ""} g
            </Text>
          </View>
          <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <View style={{ width: `${share * 100}%`, backgroundColor: color }} className="h-full rounded-full" />
          </View>
        </View>
      );
    };
    const left = t.goal - Math.round(t.eaten.calories ?? 0);
    body = (
      <>
        <Text className="text-2xl font-bold text-slate-900">
          {Math.max(0, left).toLocaleString()} <Text className="text-sm font-normal text-slate-500">kcal {left >= 0 ? "left" : "over"}</Text>
        </Text>
        {bar("Protein", t.eaten.protein, t.settings.dailyProteinLimit, "#2563EB")}
        {bar("Carbs", t.eaten.carbs, t.settings.dailyCarbsLimit, "#F59E0B")}
        {bar("Fat", t.eaten.fats, t.settings.dailyFatsLimit, "#EC4899")}
      </>
    );
  } else if (section.id === "health") {
    body = t.latestWeight ? (
      <Row
        icon="scale-outline"
        title={`${t.latestWeight.weight} lbs`}
        detail={`${t.weightChange == null ? "Weighed" : `${t.weightChange > 0 ? "+" : ""}${t.weightChange} lbs this week · weighed`} ${t.latestWeight.date === t.today ? "today" : t.latestWeight.date}${t.settings.goalWeight ? ` · goal ${t.settings.goalWeight} lbs` : ""}`}
      />
    ) : (
      <Text className="py-2 text-sm text-slate-500">No weigh-ins yet.</Text>
    );
    actions = <Action label="Log weight" icon="add" onPress={() => go("/health/weight")} />;
  } else if (section.id === "tasks") {
    body = t.tasks.length ? (
      t.tasks.slice(0, 4).map(({ task, late }) => (
        <Row
          key={task._id}
          icon="ellipse-outline"
          iconColor={late ? "#DC2626" : "#94A3B8"}
          title={task.title}
          detail={late ? "Overdue" : task.list?.name}
          onPress={() => void updateTodoTask(task._id, { completed: true }).then(onDone, () => {})}
          right={<Text className="text-xs text-slate-400">Done</Text>}
        />
      ))
    ) : (
      <Text className="py-2 text-sm text-slate-500">Nothing due — nice.</Text>
    );
    actions = <Action label="New task" icon="add" onPress={() => go("/lists")} />;
  } else {
    body = <Text className="py-2 text-sm text-slate-500">Home planning — tasks and projects for the house — is on its way.</Text>;
  }

  return (
    <Animated.View key={section.id} entering={FadeInDown.duration(260)} className="rounded-3xl border border-slate-200 bg-white px-5 pb-4 pt-4">
      <View className="mb-1 flex-row items-center">
        <Ionicons name={section.icon} size={16} color="#64748B" />
        <Text className="ml-2 text-xs font-bold uppercase tracking-wider text-slate-400">{section.label}</Text>
      </View>
      {body}
      {(actions || open) && (
        <View className="mt-3 flex-row flex-wrap gap-2">
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
  const t = useToday();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<SectionId>("calendar");
  const [asking, setAsking] = useState(false);

  // The orbit's turn (degrees): the selected section at the top.
  const turn = useSharedValue(0);
  const turned = useRef(0);
  const still = useReducedMotion();
  function select(section: Section) {
    if (section.id === selected) {
      if (section.route) router.push(section.route);
      return;
    }
    const from = ORBIT.findIndex((s) => s.id === selected);
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

  const size = Math.min(width - 24, 400);
  const centre = size / 2;
  const radius = size * 0.39;
  const orb = size * 0.3;
  const ring = size * 0.43;
  const current = ORBIT.find((s) => s.id === selected)!;
  const focus = glance(selected, t);
  const name = account?.name.split(" ")[0] ?? "";
  const date = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
  const isAdmin = account?.role === "admin";

  return (
    <SafeAreaView className="flex-1 bg-[#F4F3F0]" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* The top: the time, and what's on */}
        <View className="flex-row items-start px-5 pt-3">
          <View className="flex-1">
            <Text className="text-xs font-semibold tracking-widest text-slate-500">
              {date} · {minutesLabel(t.now)}
            </Text>
            <Animated.Text key={headline(t, name)} entering={FadeIn.duration(300)} className="mt-1 text-[28px] font-bold leading-9 text-slate-950">
              {headline(t, name)}
            </Animated.Text>
          </View>
          <View className="ml-3 flex-row gap-1">
            {isAdmin && (
              <Pressable onPress={() => go("/developer/home")} hitSlop={6} className="h-10 w-10 items-center justify-center rounded-full active:bg-black/5" accessibilityLabel="Developer">
                <Ionicons name="construct-outline" size={20} color="#475569" />
              </Pressable>
            )}
            <Pressable onPress={() => go("/settings-section/kitchen")} hitSlop={6} className="h-10 w-10 items-center justify-center rounded-full active:bg-black/5" accessibilityLabel="Settings">
              <Ionicons name="settings-outline" size={21} color="#475569" />
            </Pressable>
          </View>
        </View>

        {/* The orbit */}
        <View style={{ width: size, height: centre + radius + 72, alignSelf: "center", marginTop: 8 }}>
          <View pointerEvents="none" style={{ position: "absolute", left: centre - radius, top: centre - radius, width: radius * 2, height: radius * 2, borderRadius: radius, borderWidth: 1.5, borderStyle: "dotted", borderColor: "#CBD5E1" }} />
          <View style={{ position: "absolute", left: centre - ring / 2, top: centre - ring / 2, width: ring, height: ring, alignItems: "center", justifyContent: "center" }}>
            <Ring size={ring} value={focus.ring} />
            <Orb size={orb} onPress={() => setAsking(true)} />
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
              value={glance(section.id, t).value}
              onPress={() => select(section)}
            />
          ))}
        </View>
        <Text className="text-center text-xs text-slate-500">{focus.caption}</Text>

        {/* What matters in the selected section */}
        <View className="mt-4 px-4">
          <Panel section={current} t={t} go={go} onDone={t.reload} />
        </View>
      </ScrollView>

      {/* The orb's quick actions (later: the voice assistant) */}
      <Modal visible={asking} transparent animationType="fade" onRequestClose={() => setAsking(false)}>
        <Pressable className="flex-1 justify-end bg-black/30" onPress={() => setAsking(false)}>
          <Pressable className="rounded-t-3xl bg-white px-5 pb-10 pt-5" onPress={() => {}}>
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-slate-200" />
            <Text className="text-lg font-bold text-slate-900">What would you like to do?</Text>
            <Text className="mb-3 mt-0.5 text-sm text-slate-500">Soon you&apos;ll be able to just ask.</Text>
            {QUICK.map((q) => (
              <Pressable
                key={q.label}
                onPress={() => {
                  setAsking(false);
                  go(q.route);
                }}
                className="flex-row items-center rounded-2xl px-2 py-3 active:bg-slate-50"
              >
                <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-50">
                  <Ionicons name={q.icon} size={18} color="#2563EB" />
                </View>
                <Text className="ml-3 flex-1 text-[15px] font-semibold text-slate-800">{q.label}</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
