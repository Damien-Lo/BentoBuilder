import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FieldLabel, FormCard, FormInput } from "@/src/components/forms";
import { useWideForm } from "@/src/components/forms/wideForm";
import { Tap } from "@/src/components/ui/Tap";
import {
  createRestaurant,
  DuplicateRestaurantError,
  isSuggested,
  updateRestaurant,
  type Restaurant,
  type RestaurantInput,
} from "@/src/services/restaurantApi";
import { OrbitPage, SECTION_PALETTE, useOrbitTheme } from "@/src/theme/orbit";
import { canUseLocation, currentPosition, type Position } from "@/src/utils/location";
import { setPendingNewRestaurant } from "@/src/utils/pendingNewRestaurantStore";

import { addToMine, chainNameOf, errorText, restaurantLine, RoundButton, Sheet, SheetButton, showSuggested, StatusChip, useIsReviewer } from "./parts";

// Adding a restaurant to Orbit, or correcting one (app/restaurants/add and
// edit/[id]). Restaurants are shared: one record per real place, built up
// by everyone, so adding one first checks it isn't there already (the same
// name close by) and offers those instead; a correction is kept in its
// history with an optional note of what changed. Both are reviewed: a
// member's new restaurant waits for a reviewer (only they see it meanwhile,
// and can log it), and a member's correction to one that's in is sent as a
// suggestion — a reviewer's are made at once, as are one's own fixes to
// one's own still waiting.
//
// From the planner's add-to-plan flow (`fromPlanner`), the restaurant —
// the new one, or the one already in Orbit picked instead — is handed back
// for its dish-picker (pendingNewRestaurantStore) rather than opened here.

type Fields = { name: string; cuisine: string; chainName: string; address: string; website: string; phone: string };

const positionOf = (restaurant?: Restaurant | null): Position | null => {
  const [lng, lat] = restaurant?.location?.coordinates ?? [];
  return lat != null && lng != null ? { lat, lng } : null;
};
const samePlace = (a: Position | null, b: Position | null) => (a && b ? Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7 : a === b);

export function RestaurantForm({ restaurant, fromPlanner = false, canReview }: { restaurant?: Restaurant | null; fromPlanner?: boolean; canReview?: boolean }) {
  const router = useRouter();
  const layout = useWideForm();
  const { colors: o } = useOrbitTheme();
  const reviewer = useIsReviewer() || !!canReview;
  const editing = !!restaurant;
  const willSuggest = editing && !reviewer && restaurant?.status !== "pending";

  const [fields, setFields] = useState<Fields>(() => ({
    name: restaurant?.name ?? "",
    cuisine: restaurant?.cuisine ?? "",
    chainName: restaurant ? chainNameOf(restaurant) : "",
    address: restaurant?.address ?? "",
    website: restaurant?.website ?? "",
    phone: restaurant?.phone ?? "",
  }));
  const [location, setLocation] = useState<Position | null>(() => positionOf(restaurant));
  const [note, setNote] = useState("");
  const [locationOk, setLocationOk] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  // Adding one that may already be in Orbit: the ones it may be.
  const [duplicates, setDuplicates] = useState<Restaurant[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    canUseLocation()
      .then((ok) => !cancelled && setLocationOk(ok))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (field: keyof Fields) => (text: string) => setFields((prev) => ({ ...prev, [field]: text }));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/restaurants"));

  function locateMe() {
    setLocating(true);
    currentPosition()
      .then(setLocation)
      .catch((error) => Alert.alert("Couldn't find where you are", errorText(error)))
      .finally(() => setLocating(false));
  }

  const input = (): RestaurantInput => ({
    name: fields.name.trim(),
    cuisine: fields.cuisine.trim(),
    chainName: fields.chainName.trim(),
    address: fields.address.trim(),
    website: fields.website.trim(),
    phone: fields.phone.trim(),
    location,
  });

  // Done: back to the planner with it, or onto its page.
  function finish(result: Restaurant) {
    if (fromPlanner) {
      setPendingNewRestaurant(result);
      back();
      return;
    }
    router.replace({ pathname: "/restaurants/[id]", params: { id: result._id } });
  }

  async function add(force: boolean) {
    setSaving(true);
    try {
      const created = await createRestaurant(input(), force);
      setDuplicates(null);
      finish(created);
    } catch (error) {
      if (error instanceof DuplicateRestaurantError) setDuplicates(error.duplicates);
      else Alert.alert("Couldn't add it", errorText(error));
    } finally {
      setSaving(false);
    }
  }

  // One of the ones it may be: into your list, then on with it.
  async function pickExisting(existing: Restaurant) {
    setSaving(true);
    try {
      const mine = await addToMine(existing);
      setDuplicates(null);
      finish(mine);
    } catch (error) {
      Alert.alert("Couldn't add it to your list", errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!restaurant) return;
    const next = input();
    // Only what changed, so its history says just that.
    const changes: Partial<RestaurantInput> & { note?: string } = {};
    if (next.name !== restaurant.name) changes.name = next.name;
    if (next.cuisine !== (restaurant.cuisine ?? "")) changes.cuisine = next.cuisine;
    if (next.chainName !== chainNameOf(restaurant)) changes.chainName = next.chainName;
    if (next.address !== (restaurant.address ?? "")) changes.address = next.address;
    if (next.website !== (restaurant.website ?? "")) changes.website = next.website;
    if (next.phone !== (restaurant.phone ?? "")) changes.phone = next.phone;
    if (!samePlace(location, positionOf(restaurant))) changes.location = location;
    if (!Object.keys(changes).length) {
      back();
      return;
    }
    if (note.trim()) changes.note = note.trim();
    setSaving(true);
    try {
      const result = await updateRestaurant(restaurant._id, changes);
      if (isSuggested(result)) showSuggested(back);
      else back();
    } catch (error) {
      Alert.alert("Couldn't save the changes", errorText(error));
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (!fields.name.trim()) {
      Alert.alert("Name the restaurant", "Type the restaurant's name.");
      return;
    }
    void (editing ? saveEdit() : add(false));
  }

  const saveLabel = saving ? "Saving…" : willSuggest ? "Suggest" : editing ? "Save" : fromPlanner ? "Save & continue" : "Add";

  // Where it is: "use my location", or set — in the Kitchen's colour on a
  // desktop until it's decided (the one choice among the typed fields).
  const locationRow = (
    <View>
      <FieldLabel text="Its location" />
      {location ? (
        <View style={{ flexDirection: "row", alignItems: "center", height: 48, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface }}>
          <Ionicons name="location" size={18} color={o.success} />
          <Text style={{ flex: 1, marginLeft: 8, fontSize: 15, fontWeight: "600", color: o.text }}>Location set ✓</Text>
          <Tap onPress={() => setLocation(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear the location">
            <Text style={{ fontSize: 14, fontWeight: "600", color: o.accent }}>Clear</Text>
          </Tap>
        </View>
      ) : locationOk ? (
        <Tap
          onPress={locateMe}
          disabled={locating}
          accessibilityRole="button"
          style={{
            height: 48,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            borderWidth: 1,
            borderStyle: layout.wide ? "solid" : "dashed",
            borderColor: layout.wide ? o.fill : o.faint,
            backgroundColor: layout.wide ? SECTION_PALETTE.kitchen.tint : o.pill,
          }}
          pressedStyle={{ opacity: 0.75 }}
        >
          {locating ? <ActivityIndicator size="small" color={o.ink} /> : <Ionicons name="navigate-outline" size={18} color={o.ink} />}
          <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: "600", color: layout.wide ? o.ink : o.onPill }}>{locating ? "Finding you…" : "Use my location"}</Text>
        </Tap>
      ) : (
        <Text style={{ fontSize: 13, lineHeight: 18, color: o.muted }}>Type its address above — it&apos;s how others tell it apart from another of the same name.</Text>
      )}
      {locationOk && !location && <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: o.faint }}>When you&apos;re there: for &quot;near me&quot;, and so no one adds it twice.</Text>}
    </View>
  );

  const aboutCard = (
    <FormCard icon="storefront-outline" title="Restaurant" description={editing ? "What everyone in Orbit sees for it." : "One for each real place — everyone in Orbit can find it and log visits to it."}>
      <FieldLabel text="Name" required />
      <FormInput value={fields.name} onChangeText={set("name")} placeholder="e.g. Pho 24" autoCorrect={false} />
      <FieldLabel text="Cuisine" />
      <FormInput value={fields.cuisine} onChangeText={set("cuisine")} placeholder="e.g. Vietnamese" />
      <FieldLabel text="Part of a chain? e.g. Chipotle" />
      <FormInput value={fields.chainName} onChangeText={set("chainName")} placeholder="The chain's name (optional)" autoCorrect={false} />
      <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: o.faint }}>A chain&apos;s locations share one menu.</Text>
    </FormCard>
  );

  const whereCard = (
    <FormCard icon="location-outline" title="Where it is" description="So it shows up near you, and isn't added twice.">
      <FieldLabel text="Address" />
      <FormInput value={fields.address} onChangeText={set("address")} placeholder="e.g. 123 Main St, Atlanta" />
      {locationRow}
    </FormCard>
  );

  const contactCard = (
    <FormCard icon="call-outline" title="Contact (optional)">
      <FieldLabel text="Website" />
      <FormInput value={fields.website} onChangeText={set("website")} placeholder="e.g. pho24.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <FieldLabel text="Phone" />
      <FormInput value={fields.phone} onChangeText={set("phone")} placeholder="e.g. (404) 555-0123" keyboardType="phone-pad" />
    </FormCard>
  );

  const sharedNote = (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 4, marginBottom: 12, marginHorizontal: 4 }}>
      <Ionicons name="people-outline" size={15} color={o.faint} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 6, fontSize: 12, lineHeight: 17, color: o.muted }}>
        Restaurants are shared by everyone in Orbit.{" "}
        {willSuggest
          ? "Your changes are sent as a suggestion: a reviewer looks at them before they change for everyone."
          : editing
            ? restaurant?.status === "pending" && !reviewer
              ? "It's still waiting for review, so your changes are made straight away."
              : "Your changes are made now and kept in its history, so they can be undone."
            : reviewer
              ? "Your notes, ratings and prices for it stay yours."
              : "A reviewer checks a new one before others see it — you can log it straight away, and your notes, ratings and prices stay yours."}
      </Text>
    </View>
  );

  const noteCard = editing ? (
    <FormCard icon="chatbox-ellipses-outline" title="What changed (optional)">
      <FormInput value={note} onChangeText={setNote} placeholder="e.g. Moved across the street" maxLength={200} />
    </FormCard>
  ) : null;

  return (
    <OrbitPage>
      <SafeAreaView style={{ flex: 1, backgroundColor: o.canvas }} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView style={[{ flex: 1 }, layout.page]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* The way back and Save, round, over a large title on the page itself */}
          <View style={{ paddingHorizontal: 16, paddingTop: layout.wide ? 16 : 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4, minHeight: 40 }}>
              <RoundButton icon="chevron-back" label="Back" onPress={back} disabled={saving} />
              <View style={{ flex: 1 }} />
              <Tap disabled={saving} onPress={save} accessibilityRole="button" style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: 20, backgroundColor: o.ink, opacity: saving ? 0.5 : 1 }} pressedStyle={{ opacity: 0.8 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: o.onInk }}>{saveLabel}</Text>
              </Tap>
            </View>
            <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>{editing ? "Edit restaurant" : "Add a restaurant"}</Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!!restaurant && <StatusChip status={restaurant.status} reviewNote={restaurant.reviewNote} withNote style={{ marginBottom: 8, marginHorizontal: 4 }} />}
            {sharedNote}
            {/* (In a desktop browser: two columns.) */}
            {layout.wide ? (
              <View style={layout.columns}>
                <View style={layout.column}>
                  {aboutCard}
                  {contactCard}
                </View>
                <View style={layout.column}>
                  {whereCard}
                  {noteCard}
                </View>
              </View>
            ) : (
              <>
                {aboutCard}
                {whereCard}
                {contactCard}
                {noteCard}
              </>
            )}
            <View style={[{ marginTop: 8, flexDirection: "row" }, layout.actions]}>
              <SheetButton label={saveLabel} onPress={save} disabled={saving} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* It may already be in Orbit */}
      <Sheet
        visible={!!duplicates}
        title="This may already be in Orbit"
        subtitle="Tap it to add it to your list — or add yours as a different place."
        onClose={() => setDuplicates(null)}
        width={560}
        footer={<SheetButton kind="secondary" label="Add as a new restaurant" onPress={() => void add(true)} disabled={saving} />}
      >
        {(duplicates ?? []).map((d) => (
          <Tap
            key={d._id}
            onPress={() => void pickExisting(d)}
            disabled={saving}
            accessibilityRole="button"
            style={{ marginTop: 10, flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface }}
            pressedStyle={{ backgroundColor: o.pill }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.pill }}>
              <Ionicons name="storefront-outline" size={18} color={o.ink} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: o.text }}>{d.name}</Text>
              <StatusChip status={d.status} style={{ marginTop: 3 }} />
              <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 13, color: o.muted }}>
                {restaurantLine(d)}
              </Text>
              {!!d.address && (
                <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: o.faint }}>
                  {d.address}
                </Text>
              )}
            </View>
            {d.mine?.saved ? <Ionicons name="checkmark-circle" size={22} color={o.ink} /> : <Ionicons name="add-circle-outline" size={22} color={o.faint} />}
          </Tap>
        ))}
      </Sheet>
    </OrbitPage>
  );
}
