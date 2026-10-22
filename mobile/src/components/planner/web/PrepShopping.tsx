import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { durationLabel, minutesLabel, MONTHS_SHORT, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { KitchenIssues, KitchenTasks } from "@/src/components/planner/KitchenTasks";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { SessionBooker } from "@/src/components/planner/web/SessionBooker";
import { compactDate } from "@/src/components/web/fields";
import { KitchenPage } from "@/src/components/planner/KitchenPage";
import { PlanSubPage } from "@/src/components/planner/web/PlanFrame";
import { Button, Card, CardLink, Empty, hoverable, WEB } from "@/src/components/web/ui";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { parseLocalDate } from "@/src/utils/mealPlan";
import { needAmountLabel, type BuyNeed, type KitchenSession, type NeedSource, type PrepNeed } from "@/src/utils/planNeeds";
import { useOrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// What the plan needs made ahead and bought, in full: every item, the prep
// session or shopping trip it falls to, what it's for, and what's wrong.
// The week plan carries only a summary of this (NeedsSummaryCard); this is
// the page that opens from it.

type Plan = ReturnType<typeof usePlanNeeds>;

// The colours its rows are drawn in: Orbit's on the phone (an Orbit page),
// the desktop's otherwise.
function lookOf(o: OrbitColors | null, dark: boolean) {
  return o
    ? { text: o.text, body: o.icon, muted: o.muted, faint: o.faint, red: o.danger, amber: o.warning, green: o.success, hover: o.pill, band: o.pill, redBand: dark ? "rgba(248,113,113,0.12)" : "#FEF2F2", amberBand: dark ? "rgba(251,191,36,0.12)" : "#FFFBEB" }
    : { text: WEB.text, body: WEB.body, muted: WEB.muted, faint: WEB.faint, red: WEB.red, amber: WEB.amber, green: WEB.green, hover: "#F8FAFC", band: "#F8FAFC", redBand: "#FEF2F2", amberBand: "#FFFBEB" };
}
function useLook() {
  return lookOf(useOrbitPage(), useOrbitTheme().dark);
}

// (`inTabs`: in a tab of its own — no title or way back. On a phone, first,
// the kitchen's tasks for the week, from what was its Overview: the desktop
// keeps them on the Kitchen's Overview.)
export function WebPrepShoppingScreen({ inTabs = false }: { inTabs?: boolean } = {}) {
  const router = useRouter();
  const plan = usePlanNeeds();
  const { today } = plan;
  const wide = useWideWeb();
  // (The page itself is drawn in Orbit's look, on a phone and on the
  // desktop: see KitchenPage and PlanSubPage.)
  const { colors, dark } = useOrbitTheme();
  const look = lookOf(colors, dark);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  useFocusEffect(
    useCallback(() => {
      getRecipes().then(setRecipes).catch(() => {});
    }, []),
  );
  const [adding, setAdding] = useState<"prep" | "shop" | null>(null);

  // How long a session's prep would take against how long it is: each
  // recipe's prep and cook time, once a batch (rounded up). A guide only —
  // things cook side by side, and not every recipe has its times set.
  const prepLoad = (rows: PrepNeed[]) => {
    let minutes = 0;
    let untimed = 0;
    for (const need of rows) {
      const recipe = recipes.find((r) => r._id === need.recipeId);
      const each = (recipe?.prepTimeMinutes ?? 0) + (recipe?.cookTimeMinutes ?? 0);
      if (each > 0) minutes += each * Math.max(1, Math.ceil(need.batches - 0.01));
      else untimed += 1;
    }
    return { minutes, untimed };
  };

  // The meals the things to buy are for, soonest first, each with what it
  // needs. (Something two meals need shows under both, at the amount for both.)
  const [openMeals, setOpenMeals] = useState<string[]>([]);
  const mealsOf = (rows: BuyNeed[]) => {
    const meals: { date: string; label: string; menu: boolean; needs: BuyNeed[] }[] = [];
    for (const need of rows) {
      for (const f of need.for) {
        const at = meals.find((m) => m.date === f.date && m.label === f.label);
        if (at) {
          if (!at.needs.includes(need)) at.needs.push(need);
        } else meals.push({ date: f.date, label: f.label, menu: !!f.entryId?.startsWith("menu:"), needs: [need] });
      }
    }
    // (What's on days first, then what's on the menu.)
    return meals.sort((a, b) => Number(a.menu) - Number(b.menu) || a.date.localeCompare(b.date));
  };

  const sessionGroups = <T extends { session: string | null }>(kind: KitchenSession["kind"], list: T[]) =>
    [
      ...plan.sessions.filter((s) => s.kind === kind).map((session) => ({ session: session as KitchenSession | null, rows: list.filter((n) => n.session === session.id) })),
      // Needed before any session that could cover it.
      { session: null as KitchenSession | null, rows: list.filter((n) => !n.session) },
    ].filter((group) => group.session || group.rows.length);


  const title = "Prep & shopping";
  const subtitle = "Worked out from the meals you've planned, the pantry and your booked sessions. Nothing here is saved: change the plan and it changes.";
  // (On the desktop: under Plan, with the way back to it over the title.)
  // (A plain function, not a component: the page isn't drawn afresh each time.)
  const frame = (children: React.ReactNode) =>
    wide ? (
      <PlanSubPage title={title} subtitle={subtitle} crumb={!inTabs} right={<Button label="Week plan" icon="calendar-outline" onPress={() => router.push("/planner")} />}>
        {children}
      </PlanSubPage>
    ) : (
      <KitchenPage title={title} subtitle={subtitle} back={!inTabs} bare={inTabs} orbit>
        {children}
      </KitchenPage>
    );

  return frame(
    <>
      {(inTabs || !wide) && (
        <Card title="Kitchen tasks" subtitle="The next seven days" padded={false} style={{ marginBottom: 16 }}>
          <KitchenTasks plan={plan} days={7} />
        </Card>
      )}
      {plan.issues.length > 0 && (
        <Card title="Needs attention" padded={false} style={{ marginBottom: 16 }}>
          <KitchenIssues issues={plan.issues} />
        </Card>
      )}
      {/* (Side by side on a desktop; one under the other on a phone.) */}
      <View style={wide ? { flexDirection: "row", alignItems: "flex-start", gap: 16 } : { gap: 16 }}>
        <View style={wide ? { flex: 1 } : undefined}>
          <Card title="To prep" subtitle="Made ahead for the meals you've planned" action={<CardLink label="Add session" onPress={() => setAdding("prep")} />} padded={false}>
  {!plan.ready ? (
    <Empty icon="flame-outline" text="" />
  ) : plan.prep.length === 0 && !plan.sessions.some((s) => s.kind === "prep") ? (
    <Empty icon="flame-outline" text="Nothing to prep for what's planned" />
  ) : (
    <View style={{ paddingBottom: 8 }}>
      {sessionGroups("prep", plan.prep).map((group) => (
        <View key={group.session?.id ?? "none"}>
          <SessionHeading session={group.session} today={today} anySessions={plan.sessions.some((s) => s.kind === "prep")} missing="No prep session in time" load={group.rows.length ? prepLoad(group.rows) : undefined} />
          {group.rows.length === 0 && <Text style={{ paddingHorizontal: 18, paddingBottom: 8, fontSize: 12, color: look.faint }}>Nothing falls to this one yet</Text>}
          {group.rows.map((need) => (
            <NeedRow
              key={need.ingredientId}
              title={need.recipeName}
              detail={`${needAmountLabel(need.amount, need.unit)} of ${need.name}${Math.abs(need.batches - 1) > 0.01 ? ` · ${Math.round(need.batches * 10) / 10} batches` : ""}`}
              by={need.neededBy}
              today={today}
              uses={need.for}
              onPress={() => router.push({ pathname: "/recipes/[id]", params: { id: need.recipeId } })}
            />
          ))}
        </View>
      ))}
    </View>
  )}
</Card>
        </View>
        <View style={wide ? { flex: 1 } : undefined}>
          <Card
  title="To buy"
  subtitle="Short in the pantry for the plan and its prep"
  action={
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <CardLink label="Add trip" onPress={() => setAdding("shop")} />
    </View>
  }
  padded={false}
>
  {!plan.ready ? (
    <Empty icon="cart-outline" text="" />
  ) : plan.buy.length === 0 && !plan.sessions.some((s) => s.kind === "shop") ? (
    <Empty icon="cart-outline" text="The pantry covers what's planned" />
  ) : (
    <View style={{ paddingBottom: 8 }}>
      {sessionGroups("shop", plan.buy).map((group) => (
        <View key={group.session?.id ?? "none"}>
          <SessionHeading session={group.session} today={today} anySessions={plan.sessions.some((s) => s.kind === "shop")} missing="No shopping trip in time" />
          {group.rows.length === 0 && <Text style={{ paddingHorizontal: 18, paddingBottom: 8, fontSize: 12, color: look.faint }}>Nothing to get on this one yet</Text>}
          {/* A meal at a time — what it is and when, then (opened) what it needs. */}
          {mealsOf(group.rows).map((meal) => {
            const key = `${group.session?.id ?? "none"}|${meal.date}|${meal.label}`;
            const open = openMeals.includes(key);
            const listed = meal.needs.every(plan.onList);
            return (
              <View key={key}>
                <Pressable
                  onPress={() => setOpenMeals((prev) => (open ? prev.filter((k) => k !== key) : [...prev, key]))}
                  style={hoverable(({ hovered }: { hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 10, backgroundColor: hovered ? look.hover : "transparent" }))}
                >
                  <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={look.muted} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: look.text }}>
                      {meal.label}
                    </Text>
                    <Text style={{ marginTop: 1, fontSize: 12, color: look.muted }}>
                      {meal.menu ? "On the menu" : dayLabel(meal.date, today)} · {meal.needs.length} thing{meal.needs.length === 1 ? "" : "s"} to buy
                    </Text>
                  </View>
                  {/* (What the next trip needs is on the grocery list by itself; the rest waits.) */}
                  {listed ? <ListMark text="On your list" /> : <ListMark text="For a later trip" partial />}
                </Pressable>
                {open &&
                  meal.needs.map((need) => {
                    const others = [...new Set(need.for.filter((f) => f.date !== meal.date || f.label !== meal.label).map((f) => f.label))];
                    return (
                      <View key={`${need.ingredientId}-${need.unit}-${need.pieces}`} style={{ flexDirection: "row", alignItems: "center", paddingLeft: 40, paddingRight: 18, paddingVertical: 6 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, color: look.text }}>
                            {need.name} <Text style={{ color: look.muted }}>· {needAmountLabel(need.amount, need.unit)}</Text>
                          </Text>
                          {others.length > 0 && (
                            <Text numberOfLines={1} style={{ fontSize: 11, color: look.faint }}>
                              together with {others.join(", ")}
                            </Text>
                          )}
                        </View>
                        {!plan.onList(need) && <Text style={{ fontSize: 11, color: look.faint }}>later trip</Text>}
                      </View>
                    );
                  })}
              </View>
            );
          })}
        </View>
      ))}
      {/* Stock the plan is counting on that will be past its date by then. */}
      {plan.checks.length > 0 && (
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 18, paddingVertical: 6, backgroundColor: look.amberBand }}>
            <Ionicons name="help-circle-outline" size={13} color={look.amber} />
            <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "700", color: look.amber }}>In the pantry, but check: past its date</Text>
          </View>
          {plan.checks.map((check) => (
            <NeedRow key={check.ingredientId} title={check.name} detail={`dated ${compactDate(check.expired)}`} by={check.neededBy} today={today} uses={check.for} />
          ))}
        </View>
      )}
    </View>
  )}
</Card>
        </View>
      </View>
      {adding && (
        <SessionBooker
          kind={adding}
          today={today}
          start={today}
          onClose={() => {
            setAdding(null);
            plan.reload();
          }}
        />
      )}
    </>,
  );
}

// One side of it on the week plan: how much there is, and only what's
// wrong. The rest is a click away.
export function NeedsSummaryCard({ side, plan, onOpen, onBook }: { side: "prep" | "buy"; plan: Plan; onOpen: () => void; onBook: () => void }) {
  const look = useLook();
  const rows = side === "prep" ? plan.prep : plan.buy;
  const issues = plan.issues.filter((issue) => issue.about === side || (side === "buy" && issue.kind === "past-date"));
  const sessions = plan.sessions.filter((s) => s.kind === (side === "prep" ? "prep" : "shop"));
  const next = sessions[0];
  const when = next ? `${next.date === plan.today ? "today" : compactDate(next.date)} at ${minutesLabel(next.startMinutes)}` : null;
  return (
    <Card
      title={side === "prep" ? "To prep" : "To buy"}
      subtitle={!plan.ready ? "" : rows.length ? `${rows.length} thing${rows.length === 1 ? "" : "s"}${when ? ` · next ${side === "prep" ? "session" : "trip"} ${when}` : ""}` : side === "prep" ? "Nothing to make ahead" : "The pantry covers what's planned"}
      action={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <CardLink label={side === "prep" ? "Add session" : "Add trip"} onPress={onBook} />
          <CardLink label="See all" onPress={onOpen} />
        </View>
      }
      padded={false}
    >
      {issues.length > 0 ? (
        <KitchenIssues issues={issues} onPress={onOpen} />
      ) : (
        plan.ready &&
        rows.length > 0 && (
          <Text style={{ paddingHorizontal: 18, paddingBottom: 14, fontSize: 12, color: look.faint }}>
            <Ionicons name="checkmark-circle-outline" size={12} color={look.green} /> Nothing wrong: every one has a {side === "prep" ? "session" : "trip"} in time
          </Text>
        )
      )}
    </Card>
  );
}

// A prep session or shopping trip, as a heading over what falls to it.
function SessionHeading({
  session,
  today,
  anySessions,
  missing,
  load,
}: {
  session: KitchenSession | null;
  today: string;
  anySessions: boolean;
  missing: string;
  // For a prep session: about how long what falls to it takes, and how many of its recipes have no times set.
  load?: { minutes: number; untimed: number };
}) {
  const look = useLook();
  // With no sessions at all there's nothing to group under.
  if (!session && !anySessions) return null;
  const d = session ? parseLocalDate(session.date) : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 18, paddingVertical: 6, backgroundColor: session ? look.band : look.redBand }}>
      <Ionicons name={session ? "calendar-outline" : "alert-circle-outline"} size={13} color={session ? look.muted : look.red} />
      <Text numberOfLines={1} style={{ marginLeft: 6, fontSize: 12, fontWeight: "700", color: session ? look.body : look.red }}>
        {session && d ? `${session.date === today ? "Today" : `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`} · ${minutesLabel(session.startMinutes)}–${minutesLabel(session.endMinutes)}` : missing}
      </Text>
      {!!load &&
        (load.minutes > 0 || load.untimed > 0) &&
        (() => {
          const length = session ? session.endMinutes - session.startMinutes : null;
          const over = length != null && load.minutes > length;
          return (
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, textAlign: "right", fontSize: 11, fontWeight: over ? "700" : "400", color: over ? look.red : look.muted }}>
              {load.minutes > 0 ? `about ${durationLabel(load.minutes)}${over ? `, over its ${durationLabel(length!)}` : ""}` : ""}
              {load.untimed > 0 ? `${load.minutes > 0 ? " · " : ""}${load.untimed} with no times set` : ""}
            </Text>
          );
        })()}
    </View>
  );
}

// One thing to prep or buy: what, how much, by when, and for which meals.
// Whether a thing to buy is on the grocery list (or only some of it).
function ListMark({ text, partial }: { text: string; partial?: boolean }) {
  const look = useLook();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons name={partial ? "ellipse-outline" : "checkmark-circle"} size={13} color={partial ? look.muted : look.green} />
      <Text style={{ marginLeft: 4, fontSize: 12, color: partial ? look.muted : look.green }}>{text}</Text>
    </View>
  );
}

function NeedRow({ title, detail, by, today, uses, onPress, warning, right }: { title: string; detail: string; by: string; today: string; uses: NeedSource[]; onPress?: () => void; warning?: string; right?: React.ReactNode }) {
  const look = useLook();
  const d = parseLocalDate(by);
  const when = by === today ? "today" : `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`;
  const meals = [...new Set(uses.map((u) => u.label))];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={hoverable(({ hovered }: { hovered?: boolean }) => ({ paddingHorizontal: 18, paddingVertical: 8, backgroundColor: hovered && onPress ? look.hover : "transparent" }))}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: look.text }}>
          {title}
        </Text>
        <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: by === today ? "700" : "500", color: by === today ? look.red : look.muted }}>by {when}</Text>
        {!!onPress && <Ionicons name="chevron-forward" size={13} color={look.faint} style={{ marginLeft: 4 }} />}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text numberOfLines={1} style={{ flex: 1, marginTop: 1, fontSize: 12, color: look.muted }}>
          {detail}
        </Text>
        {right}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, color: look.faint }}>
        for {meals.slice(0, 2).join(", ")}
        {meals.length > 2 ? ` +${meals.length - 2} more` : ""}
      </Text>
      {!!warning && (
        <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 11, lineHeight: 15, color: look.red }}>
          <Ionicons name="alert-circle-outline" size={11} color={look.red} /> {warning}
        </Text>
      )}
    </Pressable>
  );
}

// "Today", "Tomorrow", else "Mon 19".
function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  const d = parseLocalDate(date);
  const t = parseLocalDate(today);
  t.setDate(t.getDate() + 1);
  if (d.getTime() === t.getTime()) return "Tomorrow";
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
