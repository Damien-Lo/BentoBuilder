import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { minutesLabel, shortDateLabel } from "@/src/components/calendar/calendarUtils";
import { KitchenPage } from "@/src/components/planner/KitchenPage";
import { KitchenIssues, KitchenTasks } from "@/src/components/planner/KitchenTasks";
import type { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { Card, CardLink, hoverable } from "@/src/components/web/ui";
import { SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

type IconName = keyof typeof Ionicons.glyphMap;
type Plan = ReturnType<typeof usePlanNeeds>;
type Session = Plan["sessions"][number];

// Kitchen → Plan in a desktop browser: the phone's Plan, with room — the
// numbers at a glance, the three pages it gathers (the menu, prep &
// shopping, the grocery list), and under them what the old Overview showed:
// the kitchen's tasks for the week, what's wrong with the plan, and what's
// booked. In Orbit's look, in the Kitchen's orange.
export function WebPlanHub({ plan, toBuy, toLog, next, onMenu }: { plan: Plan; toBuy: number | undefined; toLog: number; next: Session | undefined; onMenu: number }) {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const go = (path: string) => router.push(path as Href);
  const sessions = plan.sessions.slice(0, 6);
  const when = (s: Session) => `${s.date === plan.today ? "Today" : shortDateLabel(s.date)} · ${minutesLabel(s.startMinutes)} – ${minutesLabel(s.endMinutes)}`;

  return (
    <KitchenPage title="Plan" subtitle="Getting ready for the meals you've planned" back={false} orbit>
      {/* What stands out now */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Stat label="To buy" value={toBuy} icon="cart-outline" colors={c} />
        <Stat label="To prep" value={plan.ready ? plan.prep.length : undefined} icon="flame-outline" colors={c} />
        <Stat label="To fix" value={plan.ready ? plan.issues.length : undefined} icon="alert-circle-outline" tone={plan.issues.length ? c.warning : undefined} colors={c} />
        <View style={{ flex: 2, minWidth: 260, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16 }}>
          <Ionicons name={next?.kind === "shop" ? "cart-outline" : next ? "flame-outline" : "calendar-outline"} size={18} color={c.muted} />
          <Text style={{ marginTop: 10, fontSize: 17, fontWeight: "700", color: c.text }} numberOfLines={1}>
            {next ? next.title : plan.ready ? "No prep or shopping booked" : " "}
          </Text>
          <Text style={{ marginTop: 3, fontSize: 12.5, color: c.muted }} numberOfLines={1}>
            {next ? `Next booked · ${when(next)}` : "Book one from the week plan"}
          </Text>
        </View>
      </View>

      {/* The pages */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        <PageTile
          icon="reader-outline"
          title="Menu"
          detail={!plan.ready ? "What you'd like to have soon" : onMenu ? `${onMenu} on the menu` : "Nothing on it yet"}
          onPress={() => go("/menu")}
          colors={c}
        />
        <PageTile icon="flame-outline" title="Prep & shopping" detail="Make-ahead, shopping trips, kitchen tasks" onPress={() => go("/kitchen/needs")} colors={c} />
        <PageTile
          icon="cart-outline"
          title="Grocery list"
          detail={toBuy === undefined ? "What to buy, and shopping mode" : toBuy ? `${toBuy} to buy${toLog ? ` · ${toLog} to put away` : ""}` : "Nothing to buy"}
          onPress={() => go("/grocery-list")}
          colors={c}
        />
      </View>

      {/* The week in the kitchen */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16, marginTop: 24 }}>
        <View style={{ flex: 3, minWidth: 320, gap: 16 }}>
          <Card title="Kitchen tasks" subtitle="The next seven days" padded={false}>
            <KitchenTasks plan={plan} days={7} />
          </Card>
        </View>

        <View style={{ flex: 2, minWidth: 300, gap: 16 }}>
          <Card title="Needs attention" action={<CardLink label="Prep & shopping" onPress={() => go("/kitchen/needs")} />} padded={false}>
            {!plan.ready ? (
              <View style={{ height: 12 }} />
            ) : plan.issues.length ? (
              <KitchenIssues issues={plan.issues} onPress={() => go("/kitchen/needs")} />
            ) : (
              <Text style={{ paddingHorizontal: 18, paddingBottom: 16, fontSize: 13, color: c.muted }}>
                <Ionicons name="checkmark-circle-outline" size={13} color={c.success} /> Nothing wrong with the plan as it stands.
              </Text>
            )}
          </Card>

          <Card title="Booked" subtitle="Prep sessions and shopping trips to come" action={<CardLink label="Week plan" onPress={() => go("/planner")} />} padded={false}>
            {plan.ready && sessions.length === 0 && <Text style={{ paddingHorizontal: 18, paddingBottom: 16, fontSize: 13, color: c.muted }}>None booked. Add one from the week plan.</Text>}
            <View style={{ paddingBottom: sessions.length ? 8 : 0 }}>
              {sessions.map((session) => {
                const count = session.kind === "shop" ? plan.buy.filter((n) => n.session === session.id).length : plan.prep.filter((n) => n.session === session.id).length;
                return (
                  <Pressable
                    key={session.id}
                    onPress={() => router.push({ pathname: "/calendar/event/[id]", params: { id: session.eventId, date: session.date } })}
                    style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 9, backgroundColor: hovered ? c.pill : "transparent" }))}
                  >
                    <Ionicons name={session.kind === "shop" ? "cart-outline" : "flame-outline"} size={16} color={c.ink} />
                    <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, color: c.text }} numberOfLines={1}>
                      {session.kind === "shop" ? "Shopping trip" : "Prep session"} · {when(session)}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.muted }}>
                      {count} {session.kind === "shop" ? "to buy" : "to make"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>
      </View>
    </KitchenPage>
  );
}

// A number at a glance (blank while it loads).
function Stat({ label, value, icon, tone, colors: c }: { label: string; value: number | undefined; icon: IconName; tone?: string; colors: OrbitColors }) {
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16 }}>
      <Ionicons name={icon} size={18} color={tone ?? c.muted} />
      <Text style={{ marginTop: 10, fontSize: 28, fontWeight: "800", color: tone ?? c.text }}>{value ?? " "}</Text>
      <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{label}</Text>
    </View>
  );
}

// One of the pages Plan gathers, as a tile (its icon on the Kitchen's tint).
function PageTile({ icon, title, detail, onPress, colors: c }: { icon: IconName; title: string; detail: string; onPress: () => void; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={hoverable(({ hovered }) => ({
        flex: 1,
        minWidth: 240,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: hovered ? c.selectedRing : c.border,
        backgroundColor: c.surface,
      }))}
    >
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: SECTION_PALETTE.kitchen.tint, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={21} color={c.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{title}</Text>
        <Text style={{ marginTop: 2, fontSize: 13, color: c.muted }} numberOfLines={1}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.faint} />
    </Pressable>
  );
}
