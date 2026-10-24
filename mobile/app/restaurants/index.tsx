import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  addToMine,
  confirmRemoveFromMine,
  errorText,
  Eyebrow,
  isMine,
  MineToggle,
  restaurantLine,
  RoundButton,
  StatusChip,
  useIsReviewer,
  useNearMe,
  usePublicRestaurants,
} from "@/src/components/restaurants/parts";
import { Tap } from "@/src/components/ui/Tap";
import { Button, Empty, hoverable, PageTitle, WebPage } from "@/src/components/web/ui";
import { getMyRestaurants, getReviewQueue, type Restaurant } from "@/src/services/restaurantApi";
import { OrbitPage, OrbitSection, SECTION_PALETTE, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Restaurants (Kitchen): yours — the ones you've saved or logged a visit to
// — and a search over every restaurant in Orbit, nearest first with "near
// me". One that isn't yours yet has a + to add it to your list; taking one
// out of your list (a swipe, or the button in a desktop browser) leaves it
// in Orbit for everyone. In the Kitchen's colours — in a desktop browser,
// a grid of cards. One's own still waiting for review (or turned down) says
// so; a reviewer sees how many are waiting for them, and the way there.
export default function RestaurantsPage() {
  return (
    <OrbitSection section="kitchen">
      <OrbitPage>
        <Restaurants />
      </OrbitPage>
    </OrbitSection>
  );
}

function Restaurants() {
  const router = useRouter();
  const wide = useWideWeb();
  const { colors: o } = useOrbitTheme();
  const [mine, setMine] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const nearMe = useNearMe();
  const searching = query.trim().length >= 2 || !!nearMe.near;
  const results = usePublicRestaurants(query, nearMe.near);
  const reviewer = useIsReviewer();
  const [toReview, setToReview] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getMyRestaurants()
        .then(setMine)
        .catch(() => {})
        .finally(() => setLoading(false));
      if (reviewer) {
        getReviewQueue()
          .then((queue) => setToReview(queue.restaurants.length + queue.dishes.length + queue.requests.length))
          .catch(() => setToReview(0));
      }
    }, [reviewer]),
  );
  const openReview = () => router.push("/restaurants/review");

  const myIds = useMemo(() => new Set(mine.map((r) => r._id)), [mine]);
  const sortedMine = useMemo(() => [...mine].sort((a, b) => a.name.localeCompare(b.name)), [mine]);

  const open = (r: Restaurant) => router.push({ pathname: "/restaurants/[id]", params: { id: r._id } });
  const addNew = () => router.push("/restaurants/add");

  function add(r: Restaurant) {
    setAdding(r._id);
    addToMine(r)
      .then((added) => {
        setMine((prev) => (prev.some((m) => m._id === added._id) ? prev : [...prev, added]));
        results.setFound((prev) => prev.map((x) => (x._id === added._id ? added : x)));
      })
      .catch((error) => Alert.alert("Couldn't add it", errorText(error)))
      .finally(() => setAdding(null));
  }
  const remove = (r: Restaurant) => confirmRemoveFromMine(r, () => setMine((prev) => prev.filter((m) => m._id !== r._id)));

  const shown = searching ? results.found : sortedMine;
  const heading = searching ? (nearMe.near && !query.trim() ? "Near you" : "In Orbit") : "Your restaurants";
  const emptyText = searching
    ? results.searching
      ? "Searching…"
      : "Nothing in Orbit by that name yet — add it, and it's there for everyone."
    : "No restaurants yet — search for one, or add it.";

  const searchBox = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1, maxWidth: wide ? 420 : undefined, height: wide ? 40 : 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface }}>
        <Ionicons name="search-outline" size={18} color={o.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search every restaurant in Orbit"
          placeholderTextColor={o.faint}
          autoCorrect={false}
          returnKeyType="search"
          style={[{ flex: 1, marginLeft: 10, fontSize: wide ? 14 : 16, color: o.text }, wide ? ({ outlineStyle: "none" } as object) : null]}
        />
        {results.searching && <ActivityIndicator size="small" color={o.faint} />}
        {!!query && (
          <Tap onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear the search" style={{ marginLeft: 6 }}>
            <Ionicons name="close-circle" size={18} color={o.faint} />
          </Tap>
        )}
      </View>
      {nearMe.available && (
        <Tap
          onPress={nearMe.toggle}
          disabled={nearMe.locating}
          accessibilityRole="button"
          accessibilityState={{ selected: !!nearMe.near }}
          style={{ height: wide ? 40 : 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: nearMe.near ? o.ink : o.border, backgroundColor: nearMe.near ? o.ink : o.surface }}
          pressedStyle={{ opacity: 0.8 }}
        >
          {nearMe.locating ? <ActivityIndicator size="small" color={o.muted} /> : <Ionicons name="navigate" size={16} color={nearMe.near ? o.onInk : o.ink} />}
          <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: nearMe.near ? o.onInk : o.text }}>Near me</Text>
        </Tap>
      )}
    </View>
  );

  if (wide) {
    return (
      <WebPage maxWidth={1180}>
        <PageTitle
          title="Restaurants"
          subtitle={`${mine.length} in your list · every restaurant in Orbit is shared by everyone`}
          right={
            <View style={{ flexDirection: "row", gap: 8 }}>
              {reviewer && toReview > 0 && <Button label={`To review (${toReview})`} icon="shield-checkmark-outline" onPress={openReview} />}
              <Button label="Add a restaurant" icon="add" kind="primary" onPress={addNew} />
            </View>
          }
        />
        <View style={{ marginBottom: 18 }}>{searchBox}</View>
        <Eyebrow text={heading} count={shown.length} />
        {loading && !searching ? (
          <ActivityIndicator color={o.muted} style={{ marginTop: 24 }} />
        ) : shown.length === 0 ? (
          <Empty icon="storefront-outline" text={emptyText} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            {shown.map((r) => {
              const yours = isMine(r, myIds);
              return (
                <Pressable
                  key={r._id}
                  onPress={() => open(r)}
                  style={hoverable(({ hovered }) => ({ flexGrow: 1, flexBasis: 300, maxWidth: 380, flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 18, borderWidth: 1, borderColor: hovered ? o.selectedRing : o.border, backgroundColor: o.surface }))}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.kitchen.tint }}>
                    <Ionicons name="storefront-outline" size={19} color={o.ink} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: o.text }}>
                      {r.name}
                    </Text>
                    <StatusChip status={r.status} reviewNote={r.reviewNote} withNote style={{ marginTop: 3 }} />
                    <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: o.muted }}>
                      {restaurantLine(r, searching)}
                    </Text>
                    {!!r.address && (
                      <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: o.faint }}>
                        {r.address}
                      </Text>
                    )}
                  </View>
                  {searching ? (
                    <MineToggle mine={yours} onAdd={() => add(r)} busy={adding === r._id} />
                  ) : (
                    // (No swiping with a mouse: taking it out is a button here.)
                    <Pressable onPress={() => remove(r)} accessibilityLabel={`Take ${r.name} out of your list`} hitSlop={8} style={hoverable(({ hovered }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? o.track : "transparent" }))}>
                      <Ionicons name="remove-circle-outline" size={18} color={o.faint} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
        {searching && !results.searching && (
          <View style={{ marginTop: 18, alignItems: "flex-start" }}>
            <Button label="Not here? Add it to Orbit" icon="add" onPress={addNew} />
          </View>
        )}
      </WebPage>
    );
  }

  const row = (r: Restaurant) => {
    const yours = isMine(r, myIds);
    return (
      <Tap
        onPress={() => open(r)}
        style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface }}
        pressedStyle={{ backgroundColor: o.pill }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: o.pill }}>
          <Ionicons name="storefront-outline" size={18} color={o.ink} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", color: o.text }}>
            {r.name}
          </Text>
          <StatusChip status={r.status} style={{ marginTop: 3 }} />
          <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: o.muted }}>
            {restaurantLine(r, searching)}
          </Text>
        </View>
        {searching ? <MineToggle mine={yours} onAdd={() => add(r)} busy={adding === r._id} /> : <Ionicons name="chevron-forward" size={20} color={o.faint} />}
      </Tap>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: o.canvas }} edges={["top", "left", "right"]}>
      {/* The way back and a new one, round, over a large title on the page itself */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
          <RoundButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/RecipesMainPage"))} />
          <View style={{ flex: 1 }} />
          <RoundButton icon="add" label="Add a restaurant" onPress={addNew} filled />
        </View>
        <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>Restaurants</Text>
        {reviewer && toReview > 0 && (
          <Tap onPress={openReview} accessibilityRole="button" style={{ marginTop: 12, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: SECTION_PALETTE.kitchen.tint }} pressedStyle={{ opacity: 0.75 }}>
            <Ionicons name="shield-checkmark-outline" size={16} color={o.ink} />
            <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "700", color: o.ink }}>To review ({toReview})</Text>
            <Ionicons name="chevron-forward" size={14} color={o.ink} style={{ marginLeft: 2 }} />
          </Tap>
        )}
        <View style={{ marginTop: 14 }}>{searchBox}</View>
      </View>

      {loading && !searching ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={o.muted} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => r._id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 60 }}
          ListHeaderComponent={<Eyebrow text={heading} count={shown.length} />}
          renderItem={({ item }) =>
            searching ? (
              row(item)
            ) : (
              <ReanimatedSwipeable
                friction={2}
                rightThreshold={40}
                renderLeftActions={() => (
                  <Tap onPress={() => remove(item)} accessibilityLabel={`Take ${item.name} out of your list`} style={{ marginBottom: 10, width: 80, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: o.danger }} pressedStyle={{ opacity: 0.8 }}>
                    <Ionicons name="remove-circle-outline" size={22} color="white" />
                  </Tap>
                )}
              >
                {row(item)}
              </ReanimatedSwipeable>
            )
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 12 }}>
              <Ionicons name="storefront-outline" size={40} color={o.faint} />
              <Text style={{ marginTop: 12, textAlign: "center", fontSize: 15, color: o.muted }}>{emptyText}</Text>
            </View>
          }
          ListFooterComponent={
            searching && !results.searching ? (
              <Tap onPress={addNew} accessibilityRole="button" style={{ marginTop: 8, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: o.faint, backgroundColor: o.pill }} pressedStyle={{ opacity: 0.75 }}>
                <Ionicons name="add" size={20} color={o.ink} />
                <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: o.onPill }}>Not here? Add it to Orbit</Text>
              </Tap>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
