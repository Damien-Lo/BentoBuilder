import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { KitchenIssues, KitchenTasks } from "@/src/components/planner/KitchenTasks";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { compactDate } from "@/src/components/web/fields";
import { KitchenPage } from "@/src/components/planner/KitchenPage";
import { Card, CardLink, WEB } from "@/src/components/web/ui";
import { minutesLabel } from "@/src/components/calendar/calendarUtils";

// Kitchen → Overview: what the kitchen needs doing, what's wrong with the
// plan, and what's booked — the Kitchen's assistant, in one place. All of it
// is worked out from the meal plan, the pantry and the Kitchen calendar.
//
// The phone's Kitchen tabs open on it (`inTabs`: no way back, it's a tab).
export function KitchenOverview({ inTabs = false }: { inTabs?: boolean }) {
  const router = useRouter();
  const plan = usePlanNeeds();
  const { today } = plan;
  const sessions = plan.sessions.slice(0, 6);

  return (
    <KitchenPage title="Kitchen" subtitle="What needs doing, from your meal plan, pantry and booked sessions" back={!inTabs}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
        <View style={{ flex: 3, minWidth: 320, gap: 16 }}>
          <Card title="Kitchen tasks" subtitle="The next seven days" padded={false}>
            <KitchenTasks plan={plan} days={7} />
          </Card>
        </View>

        <View style={{ flex: 2, minWidth: 300, gap: 16 }}>
          <Card title="Needs attention" action={<CardLink label="Prep & shopping" onPress={() => router.push("/kitchen/needs")} />} padded={false}>
            {!plan.ready ? (
              <View style={{ height: 12 }} />
            ) : plan.issues.length ? (
              <KitchenIssues issues={plan.issues} onPress={() => router.push("/kitchen/needs")} />
            ) : (
              <Text style={{ paddingHorizontal: 18, paddingBottom: 16, fontSize: 13, color: WEB.muted }}>
                <Ionicons name="checkmark-circle-outline" size={13} color={WEB.green} /> Nothing wrong with the plan as it stands.
              </Text>
            )}
          </Card>

          <Card title="Booked" subtitle="Prep sessions and shopping trips to come" action={<CardLink label="Week plan" onPress={() => router.push("/planner")} />} padded={false}>
            {plan.ready && sessions.length === 0 && <Text style={{ paddingHorizontal: 18, paddingBottom: 16, fontSize: 13, color: WEB.muted }}>None booked. Add one from the week plan.</Text>}
            <View style={{ paddingBottom: sessions.length ? 8 : 0 }}>
              {sessions.map((session) => {
                const count = session.kind === "shop" ? plan.buy.filter((n) => n.session === session.id).length : plan.prep.filter((n) => n.session === session.id).length;
                return (
                  <Pressable
                    key={session.id}
                    onPress={() => router.push({ pathname: "/calendar/event/[id]", params: { id: session.eventId, date: session.date } })}
                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 8 }}
                  >
                    <Ionicons name={session.kind === "shop" ? "cart-outline" : "flame-outline"} size={16} color={WEB.blue} />
                    <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, color: WEB.text }}>
                      {session.kind === "shop" ? "Shopping trip" : "Prep session"} · {session.date === today ? "today" : compactDate(session.date)} {minutesLabel(session.startMinutes)}
                    </Text>
                    <Text style={{ fontSize: 12, color: WEB.muted }}>
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

export default function KitchenOverviewScreen() {
  return <KitchenOverview />;
}
