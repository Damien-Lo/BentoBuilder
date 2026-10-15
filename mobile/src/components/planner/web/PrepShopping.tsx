import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { durationLabel, minutesLabel, MONTHS_SHORT, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { KitchenIssues } from "@/src/components/planner/KitchenTasks";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { SessionBooker } from "@/src/components/planner/web/SessionBooker";
import { compactDate } from "@/src/components/web/fields";
import { KitchenPage } from "@/src/components/planner/KitchenPage";
import { Button, Card, CardLink, Empty, WEB } from "@/src/components/web/ui";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { parseLocalDate } from "@/src/utils/mealPlan";
import { needAmountLabel, type BuyNeed, type KitchenSession, type NeedSource, type PrepNeed } from "@/src/utils/planNeeds";

// What the plan needs made ahead and bought, in full: every item, the prep
// session or shopping trip it falls to, what it's for, and what's wrong.
// The week plan carries only a summary of this (NeedsSummaryCard); this is
// the page that opens from it.

type Plan = ReturnType<typeof usePlanNeeds>;

export function WebPrepShoppingScreen() {
  const router = useRouter();
  const plan = usePlanNeeds();
  const { today } = plan;
  const wide = useWideWeb();
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


  return (
    <KitchenPage title="Prep & shopping" subtitle="Worked out from the meals you've planned, the pantry and your booked sessions. Nothing here is saved: change the plan and it changes." right={wide ? <Button label="Week plan" onPress={() => router.push("/planner")} /> : undefined}>
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
          {group.rows.length === 0 && <Text style={{ paddingHorizontal: 18, paddingBottom: 8, fontSize: 12, color: WEB.faint }}>Nothing falls to this one yet</Text>}
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
          {group.rows.length === 0 && <Text style={{ paddingHorizontal: 18, paddingBottom: 8, fontSize: 12, color: WEB.faint }}>Nothing to get on this one yet</Text>}
          {/* A meal at a time — what it is and when, then (opened) what it needs. */}
          {mealsOf(group.rows).map((meal) => {
            const key = `${group.session?.id ?? "none"}|${meal.date}|${meal.label}`;
            const open = openMeals.includes(key);
            const listed = meal.needs.every(plan.onList);
            return (
              <View key={key}>
                <Pressable
                  onPress={() => setOpenMeals((prev) => (open ? prev.filter((k) => k !== key) : [...prev, key]))}
                  style={({ hovered }: { hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 10, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}
                >
                  <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={WEB.muted} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: WEB.text }}>
                      {meal.label}
                    </Text>
                    <Text style={{ marginTop: 1, fontSize: 12, color: WEB.muted }}>
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
                          <Text style={{ fontSize: 13, color: WEB.text }}>
                            {need.name} <Text style={{ color: WEB.muted }}>· {needAmountLabel(need.amount, need.unit)}</Text>
                          </Text>
                          {others.length > 0 && (
                            <Text numberOfLines={1} style={{ fontSize: 11, color: WEB.faint }}>
                              together with {others.join(", ")}
                            </Text>
                          )}
                        </View>
                        {!plan.onList(need) && <Text style={{ fontSize: 11, color: WEB.faint }}>later trip</Text>}
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
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 18, paddingVertical: 6, backgroundColor: "#FFFBEB" }}>
            <Ionicons name="help-circle-outline" size={13} color={WEB.amber} />
            <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "700", color: WEB.amber }}>In the pantry, but check: past its date</Text>
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
    </KitchenPage>
  );
}

// One side of it on the week plan: how much there is, and only what's
// wrong. The rest is a click away.
export function NeedsSummaryCard({ side, plan, onOpen, onBook }: { side: "prep" | "buy"; plan: Plan; onOpen: () => void; onBook: () => void }) {
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
          <Text style={{ paddingHorizontal: 18, paddingBottom: 14, fontSize: 12, color: WEB.faint }}>
            <Ionicons name="checkmark-circle-outline" size={12} color={WEB.green} /> Nothing wrong: every one has a {side === "prep" ? "session" : "trip"} in time
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
  // With no sessions at all there's nothing to group under.
  if (!session && !anySessions) return null;
  const d = session ? parseLocalDate(session.date) : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 18, paddingVertical: 6, backgroundColor: session ? "#F8FAFC" : "#FEF2F2" }}>
      <Ionicons name={session ? "calendar-outline" : "alert-circle-outline"} size={13} color={session ? WEB.muted : WEB.red} />
      <Text numberOfLines={1} style={{ marginLeft: 6, fontSize: 12, fontWeight: "700", color: session ? WEB.body : WEB.red }}>
        {session && d ? `${session.date === today ? "Today" : `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`} · ${minutesLabel(session.startMinutes)}–${minutesLabel(session.endMinutes)}` : missing}
      </Text>
      {!!load &&
        (load.minutes > 0 || load.untimed > 0) &&
        (() => {
          const length = session ? session.endMinutes - session.startMinutes : null;
          const over = length != null && load.minutes > length;
          return (
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, textAlign: "right", fontSize: 11, fontWeight: over ? "700" : "400", color: over ? WEB.red : WEB.muted }}>
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
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons name={partial ? "ellipse-outline" : "checkmark-circle"} size={13} color={partial ? WEB.muted : WEB.green} />
      <Text style={{ marginLeft: 4, fontSize: 12, color: partial ? WEB.muted : WEB.green }}>{text}</Text>
    </View>
  );
}

function NeedRow({ title, detail, by, today, uses, onPress, warning, right }: { title: string; detail: string; by: string; today: string; uses: NeedSource[]; onPress?: () => void; warning?: string; right?: React.ReactNode }) {
  const d = parseLocalDate(by);
  const when = by === today ? "today" : `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}`;
  const meals = [...new Set(uses.map((u) => u.label))];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ hovered }: { hovered?: boolean }) => ({ paddingHorizontal: 18, paddingVertical: 8, backgroundColor: hovered && onPress ? "#F8FAFC" : "transparent" })}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: WEB.text }}>
          {title}
        </Text>
        <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: by === today ? "700" : "500", color: by === today ? WEB.red : WEB.muted }}>by {when}</Text>
        {!!onPress && <Ionicons name="chevron-forward" size={13} color={WEB.faint} style={{ marginLeft: 4 }} />}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text numberOfLines={1} style={{ flex: 1, marginTop: 1, fontSize: 12, color: WEB.muted }}>
          {detail}
        </Text>
        {right}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, color: WEB.faint }}>
        for {meals.slice(0, 2).join(", ")}
        {meals.length > 2 ? ` +${meals.length - 2} more` : ""}
      </Text>
      {!!warning && (
        <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 11, lineHeight: 15, color: WEB.red }}>
          <Ionicons name="alert-circle-outline" size={11} color={WEB.red} /> {warning}
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
