import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormInput } from "@/src/components/forms";
import { ChangeLines, errorText, Eyebrow, Macros, personName, RoundButton, SheetButton, shortDate, useIsReviewer } from "@/src/components/restaurants/parts";
import { Button, Empty, PageTitle, WebPage } from "@/src/components/web/ui";
import { getReviewQueue, review, type ReviewQueue } from "@/src/services/restaurantApi";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Reviewing the public restaurants (reviewers only: the admin, and the
// members the admin's made reviewers): what members have added — new
// restaurants (with the dishes they put on them), new dishes on restaurants
// already in — and the changes they've suggested to what's there. Each is
// approved (it's in for everyone, or the change is made) or not, with a
// reason if wanted, which its adder sees. Answered ones leave the list.
// In the Kitchen's colours; in a desktop browser, the items side by side.
export default function ReviewPage() {
  return (
    <OrbitSection section="kitchen">
      <OrbitPage>
        <Review />
      </OrbitPage>
    </OrbitSection>
  );
}

type Kind = "restaurants" | "dishes" | "requests";
const EMPTY: ReviewQueue = { restaurants: [], dishes: [], requests: [] };

function Review() {
  const router = useRouter();
  const wide = useWideWeb();
  const { colors: o } = useOrbitTheme();
  const reviewer = useIsReviewer();
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!reviewer) return;
      let cancelled = false;
      getReviewQueue()
        .then((found) => {
          if (cancelled) return;
          setQueue(found);
          setError(null);
        })
        .catch((err) => !cancelled && setError(errorText(err, "Couldn't load what's waiting.")));
      return () => {
        cancelled = true;
      };
    }, [reviewer]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace("/restaurants"));

  // Approved or not: off the list.
  async function decide(kind: Kind, id: string, decision: "approve" | "reject", note?: string) {
    try {
      await review(kind, id, decision, note);
      setQueue((prev) => {
        const q = prev ?? EMPTY;
        if (kind === "restaurants") return { ...q, restaurants: q.restaurants.filter((r) => r._id !== id) };
        if (kind === "dishes") return { ...q, dishes: q.dishes.filter((d) => d._id !== id) };
        return { ...q, requests: q.requests.filter((r) => r._id !== id) };
      });
    } catch (err) {
      Alert.alert(decision === "approve" ? "Couldn't approve it" : "Couldn't turn it down", errorText(err));
    }
  }

  const q = queue ?? EMPTY;
  const total = q.restaurants.length + q.dishes.length + q.requests.length;
  const text = { fontSize: 13, color: o.muted };
  const who = (by: unknown, at?: string) => (
    <Text style={{ marginTop: 6, fontSize: 12, color: o.faint }}>
      {personName(by)}
      {at ? ` · ${shortDate(at)}` : ""}
    </Text>
  );

  const restaurantItems = q.restaurants.map((r) => (
    <Item key={r._id} onDecide={(decision, note) => decide("restaurants", r._id, decision, note)} approveLabel={r.dishes.length ? `Approve, with ${r.dishes.length} ${r.dishes.length === 1 ? "dish" : "dishes"}` : "Approve"}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: o.text }}>{r.name}</Text>
      {(!!r.cuisine || !!r.chain) && <Text style={{ ...text, marginTop: 2 }}>{[r.cuisine, r.chain?.name ? `Part of ${r.chain.name}` : ""].filter(Boolean).join(" · ")}</Text>}
      <Text style={{ ...text, marginTop: 2, color: r.address ? o.muted : o.faint }}>
        {r.address || "No address"}
        {r.location ? " · location set" : ""}
      </Text>
      {who(r.addedBy, r.createdAt)}
      {r.dishes.length > 0 && (
        <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: o.border }}>
          <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, color: o.faint }}>ADDED WITH IT</Text>
          {r.dishes.map((d) => (
            <View key={d._id} style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: o.text }}>{d.name}</Text>
              <Macros nutrition={d.nutrition} style={{ marginTop: 2 }} />
            </View>
          ))}
        </View>
      )}
    </Item>
  ));

  const dishItems = q.dishes.map((d) => (
    <Item key={d._id} onDecide={(decision, note) => decide("dishes", d._id, decision, note)}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: o.text }}>{d.name}</Text>
      <Text style={{ ...text, marginTop: 2 }}>{[d.restaurantName ? `On ${d.restaurantName}` : "On a restaurant", d.section].filter(Boolean).join(" · ")}</Text>
      <Macros nutrition={d.nutrition} size={13} style={{ marginTop: 6 }} />
      {who(d.addedBy, d.createdAt)}
    </Item>
  ));

  const requestItems = q.requests.map((r) => {
    const itemName = r.item?.name ?? (r.kind === "restaurant" ? r.restaurantName : null) ?? "Something no longer there";
    return (
      <Item key={r._id} onDecide={(decision, note) => decide("requests", r._id, decision, note)} approveLabel={r.action === "remove" ? "Approve: take it off" : "Approve the change"}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: o.text }}>{itemName}</Text>
        <Text style={{ ...text, marginTop: 2 }}>{r.kind === "restaurant" ? "A restaurant" : `A dish${r.restaurantName ? ` on ${r.restaurantName}` : ""}`}</Text>
        <View style={{ marginTop: 8 }}>
          <ChangeLines changes={r.changes} before={r.before} removal={r.action === "remove"} />
        </View>
        {!!r.note && <Text style={{ marginTop: 6, fontSize: 13, fontStyle: "italic", color: o.muted }}>“{r.note}”</Text>}
        {who(r.by, r.createdAt)}
      </Item>
    );
  });

  const section = (title: string, items: ReactNode[], empty: string) => (
    <View style={{ marginTop: 22 }}>
      <Eyebrow text={title} count={items.length} />
      {items.length === 0 ? (
        <Text style={{ marginLeft: 4, fontSize: 14, color: o.faint }}>{empty}</Text>
      ) : (
        <View style={wide ? { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "flex-start" } : { gap: 12 }}>{items}</View>
      )}
    </View>
  );

  const body = !reviewer ? (
    <View style={{ alignItems: "center", paddingVertical: 48 }}>
      <Ionicons name="shield-outline" size={40} color={o.faint} />
      <Text style={{ marginTop: 12, textAlign: "center", fontSize: 15, color: o.muted }}>Only reviewers see what&apos;s waiting for review.</Text>
    </View>
  ) : !queue ? (
    error ? (
      <Text style={{ marginTop: 24, textAlign: "center", color: o.muted }}>{error}</Text>
    ) : (
      <ActivityIndicator size="large" color={o.muted} style={{ marginTop: 40 }} />
    )
  ) : total === 0 ? (
    wide ? (
      <Empty icon="checkmark-done-outline" text="All caught up — nothing waiting for review." />
    ) : (
      <View style={{ alignItems: "center", paddingVertical: 48 }}>
        <Ionicons name="checkmark-done-outline" size={40} color={o.faint} />
        <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "700", color: o.text }}>All caught up</Text>
        <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, color: o.muted }}>Nothing is waiting for review.</Text>
      </View>
    )
  ) : (
    <>
      {section("New restaurants", restaurantItems, "No new restaurants waiting.")}
      {section("New dishes", dishItems, "No new dishes waiting.")}
      {section("Suggested changes", requestItems, "No suggested changes waiting.")}
    </>
  );

  const intro = "What members add is only theirs until it's approved; a change they suggest is made once it's approved. A reason you give for turning one down is shown to them.";

  if (wide) {
    return (
      <WebPage maxWidth={1180}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <RoundButton icon="chevron-back" label="Back" onPress={back} />
        </View>
        <PageTitle title="To review" subtitle={queue ? `${total} waiting · restaurants are shared by everyone in Orbit` : "Restaurants are shared by everyone in Orbit"} right={<Button label="Restaurants" icon="storefront-outline" onPress={() => router.push("/restaurants")} />} />
        <Text style={{ ...text, maxWidth: 720 }}>{intro}</Text>
        {body}
      </WebPage>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: o.canvas }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
          <RoundButton icon="chevron-back" label="Back" onPress={back} />
        </View>
        <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>To review</Text>
        {!!queue && <Text style={{ marginTop: 2, fontSize: 14, color: o.muted }}>{total} waiting</Text>}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={text}>{intro}</Text>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

// One thing waiting: what it is, then Approve, or Reject with a reason if wanted.
function Item({ children, onDecide, approveLabel = "Approve" }: { children: ReactNode; onDecide: (decision: "approve" | "reject", note?: string) => Promise<void>; approveLabel?: string }) {
  const { colors: o } = useOrbitTheme();
  const wide = useWideWeb();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (decision: "approve" | "reject", note?: string) => {
    setBusy(true);
    // (Answered, it leaves the list; if not, it can be tried again.)
    onDecide(decision, note).finally(() => setBusy(false));
  };

  return (
    <View style={[{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface }, wide && { flexGrow: 1, flexBasis: 440, maxWidth: 580 }]}>
      {children}
      {rejecting ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: "600", color: o.icon }}>Why not (optional, shown to them)</Text>
          <FormInput value={reason} onChangeText={setReason} placeholder="e.g. Already in Orbit as Pho 24 Midtown" maxLength={200} />
          <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
            <SheetButton kind="secondary" label="Cancel" onPress={() => setRejecting(false)} disabled={busy} />
            <SheetButton kind="danger" icon="close-circle-outline" label={busy ? "Sending…" : "Reject"} onPress={() => run("reject", reason.trim() || undefined)} disabled={busy} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
          <SheetButton kind="secondary" icon="close-outline" label="Reject" onPress={() => setRejecting(true)} disabled={busy} />
          <SheetButton icon="checkmark" label={busy ? "Approving…" : approveLabel} onPress={() => run("approve")} disabled={busy} />
        </View>
      )}
    </View>
  );
}
