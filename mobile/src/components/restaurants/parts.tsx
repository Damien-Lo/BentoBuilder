import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useAccount } from "@/src/components/auth/AuthGate";
import { Tap } from "@/src/components/ui/Tap";
import {
  removeRestaurant,
  searchRestaurants,
  setRestaurantMine,
  type DishNutrition,
  type DishScore,
  type HistoryEntry,
  type Restaurant,
  type ReviewStatus,
} from "@/src/services/restaurantApi";
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { useOrbitTheme } from "@/src/theme/orbit";
import { canUseLocation, currentPosition, distanceLabel, type Position } from "@/src/utils/location";
import { useWideWeb } from "@/src/utils/useWideWeb";

// What the restaurant screens share (app/restaurants, the Recipes tab's
// restaurants page, the desktop's Eating out): how a restaurant and a dish
// are described, the search over every public restaurant with "near me",
// adding one to your list or taking it out, and the sheet a dish opens in.

type IconName = keyof typeof Ionicons.glyphMap;

export const errorText = (error: unknown, fallback = "Something went wrong.") => (error instanceof Error ? error.message : fallback);

// --- Describing a restaurant ------------------------------------------------

// Its chain's name, from a list (chainName) or its own page (chain, filled in).
export function chainNameOf(restaurant: Pick<Restaurant, "chain" | "chainName">): string {
  if (restaurant.chainName) return restaurant.chainName;
  return restaurant.chain && typeof restaurant.chain === "object" ? restaurant.chain.name : "";
}

// "Chipotle · Mexican · 12 dishes · 1.2 km" — whichever of those it has.
export function restaurantLine(restaurant: Restaurant, withDistance = false): string {
  const chain = chainNameOf(restaurant);
  const count = restaurant.dishCount ?? 0;
  return [
    chain && chain.toLowerCase() !== restaurant.name.toLowerCase() ? chain : "",
    restaurant.cuisine,
    `${count} ${count === 1 ? "dish" : "dishes"}`,
    withDistance ? distanceLabel(restaurant.distance) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// Yours: in your list (saved).
export const isMine = (restaurant: Restaurant, myIds: Set<string>) => myIds.has(restaurant._id) || !!restaurant.mine?.saved;

// --- Describing a dish --------------------------------------------------------

// Your average rating of a dish (your last 50), to one place.
export function averageScore(scores: DishScore[] | undefined): number | null {
  const recent = (scores ?? []).slice(-50);
  if (!recent.length) return null;
  return Math.round((recent.reduce((sum, s) => sum + s.value, 0) / recent.length) * 10) / 10;
}

const round = (value: number | null | undefined) => (value == null ? null : Math.round(value));

// "640 kcal · P 32 g · C 70 g · F 24 g", leaving out what isn't known.
export function macroText(nutrition: DishNutrition | null | undefined): string {
  if (!nutrition) return "";
  const parts = [
    nutrition.calories != null ? `${round(nutrition.calories)} kcal` : "",
    nutrition.protein != null ? `P ${round(nutrition.protein)} g` : "",
    nutrition.carbs != null ? `C ${round(nutrition.carbs)} g` : "",
    nutrition.fats != null ? `F ${round(nutrition.fats)} g` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

// Calories, then protein, carbs and fats each by its own colour's dot.
export function Macros({ nutrition, size = 12, style }: { nutrition: DishNutrition | null | undefined; size?: number; style?: StyleProp<ViewStyle> }) {
  const { colors: o, dark } = useOrbitTheme();
  const items: [MainNutrient, string, number | null][] = [
    ["protein", "P", round(nutrition?.protein)],
    ["carbs", "C", round(nutrition?.carbs)],
    ["fats", "F", round(nutrition?.fats)],
  ];
  const kcal = round(nutrition?.calories);
  if (kcal == null && items.every(([, , v]) => v == null)) {
    return <Text style={[{ fontSize: size, color: o.faint }, style as object]}>No nutrition yet</Text>;
  }
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 2 }, style]}>
      {kcal != null && (
        <Text style={{ fontSize: size, fontWeight: "700", color: o.text }}>
          {kcal} <Text style={{ fontWeight: "600", color: nutrientColor("calories", dark) }}>kcal</Text>
        </Text>
      )}
      {items.map(([key, letter, grams]) =>
        grams == null ? null : (
          <View key={key} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: nutrientColor(key, dark) }} />
            <Text style={{ marginLeft: 4, fontSize: size, color: o.muted }}>
              {letter} {grams} g
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

export const priceText = (price: number | null | undefined) => (price == null ? "" : `$${price.toFixed(2)}`);

// --- Its history -----------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  cuisine: "cuisine",
  address: "address",
  location: "location",
  googlePlaceId: "map link",
  website: "website",
  phone: "phone",
  chain: "chain",
  section: "section",
  nutrition: "nutrition",
  source: "where its numbers came from",
  fromLibrary: "library dish",
  isArchived: "on the menu",
};

export const historyWho = (entry: HistoryEntry) => (entry.by && typeof entry.by === "object" ? entry.by.name || "Someone" : "Someone");

// "Changed its name and address", or "Added" for the first one.
export function historyWhat(entry: HistoryEntry): string {
  const fields = Object.keys(entry.changes ?? {});
  if (!fields.length) return entry.note === "added" ? "Added it" : "Edited it";
  // (A reviewer's answer.)
  if (fields.length === 1 && fields[0] === "status") return entry.changes.status?.[1] === "approved" ? "Approved it" : "Didn't approve it";
  const names = fields.map((f) => FIELD_LABELS[f] ?? f);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `Changed its ${list}`;
}

// Who added it (its first history entry, when it's among the last 20).
export function addedByName(history: HistoryEntry[] | undefined): string | null {
  const added = (history ?? []).find((h) => h.note === "added" && !Object.keys(h.changes ?? {}).length);
  return added ? historyWho(added) : null;
}

export const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

// --- Reviews -------------------------------------------------------------------
// What a member adds waits for a reviewer (only they see it meanwhile, and
// can log it); a change to what's there is sent as a suggestion. A
// reviewer's own are made at once.

// Whether the person signed in reviews restaurants (the admin always does).
export function useIsReviewer(): boolean {
  const { account } = useAccount();
  return !!account?.reviewer || account?.role === "admin";
}

export const SUGGESTED_TEXT = "A reviewer will look at it before it changes for everyone. Until then, everyone (you too) sees it as it was.";

// The confirmation after a change was sent as a suggestion.
export function showSuggested(then?: () => void) {
  Alert.alert("Suggested", SUGGESTED_TEXT, [{ text: "OK", onPress: then }]);
}

// "Waiting for review" on one's own still waiting; "Not approved" (and why)
// on one's own turned down. Nothing for one that's in.
export function StatusChip({ status, reviewNote, withNote = false, style }: { status?: ReviewStatus; reviewNote?: string; withNote?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors: o, dark } = useOrbitTheme();
  if (status !== "pending" && status !== "rejected") return null;
  const waiting = status === "pending";
  const tone = waiting ? o.warning : o.danger;
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: waiting ? (dark ? "rgba(251,191,36,0.14)" : "#FEF3C7") : dark ? "rgba(248,113,113,0.14)" : "#FEE2E2" }}>
        <Ionicons name={waiting ? "time-outline" : "close-circle-outline"} size={12} color={tone} />
        <Text style={{ marginLeft: 4, fontSize: 11, fontWeight: "700", color: tone }}>{waiting ? "Waiting for review" : "Not approved"}</Text>
      </View>
      {withNote && !waiting && !!reviewNote && <Text style={{ flexShrink: 1, fontSize: 12, color: o.muted }}>“{reviewNote}”</Text>}
    </View>
  );
}

// A suggested change, field by field: "Name: Pho 24 → Phở 24"; nutrition as
// its calories, "Nutrition: 640 kcal → 720 kcal".
function valueText(field: string, value: unknown): string {
  if (value == null || value === "") return "none";
  if (field === "nutrition" && typeof value === "object") {
    const kcal = (value as DishNutrition).calories;
    return kcal != null ? `${Math.round(kcal)} kcal` : "no calories";
  }
  if (field === "location" && typeof value === "object") {
    const [lng, lat] = (value as { coordinates?: [number, number] }).coordinates ?? [];
    return lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "none";
  }
  if (field === "fromLibrary" && typeof value === "object") {
    const from = value as { amount?: number; unit?: string };
    return `${from.amount ?? "?"} ${from.unit ?? ""}`.trim();
  }
  if (field === "chain") return typeof value === "object" && value && "name" in value ? String((value as { name: unknown }).name) : "a chain";
  if (typeof value === "object") return "changed";
  return String(value);
}
const FIELD_TITLES: Record<string, string> = { googlePlaceId: "Map link", fromLibrary: "Library size", source: "Numbers from", isArchived: "On the menu" };
export function changeLines(changes: Record<string, unknown>, before: Record<string, unknown> | undefined): { field: string; before: string; after: string }[] {
  return Object.keys(changes ?? {}).map((field) => {
    const title = FIELD_TITLES[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
    return { field: title, before: valueText(field, before?.[field]), after: valueText(field, changes[field]) };
  });
}

// The lines of a change: "Name  Pho 24 → Phở 24".
export function ChangeLines({ changes, before, removal }: { changes: Record<string, unknown>; before?: Record<string, unknown>; removal?: boolean }) {
  const { colors: o } = useOrbitTheme();
  if (removal) return <Text style={{ fontSize: 13, fontWeight: "600", color: o.danger }}>Take it off the menu</Text>;
  const lines = changeLines(changes, before);
  if (!lines.length) return <Text style={{ fontSize: 13, color: o.faint }}>No differences</Text>;
  return (
    <View style={{ gap: 3 }}>
      {lines.map((line) => (
        <Text key={line.field} style={{ fontSize: 13, color: o.text }}>
          <Text style={{ fontWeight: "700" }}>{line.field}</Text>
          <Text style={{ color: o.muted }}>  {line.before}</Text>
          <Text style={{ color: o.faint }}> → </Text>
          <Text style={{ fontWeight: "600" }}>{line.after}</Text>
        </Text>
      ))}
    </View>
  );
}

// Who did it, from a filled-in user ({ name }), or "Someone".
export function personName(by: unknown): string {
  const name = by && typeof by === "object" ? (by as { name?: unknown }).name : null;
  return typeof name === "string" && name ? name : "Someone";
}

// --- Searching every public restaurant, and near me --------------------------------

// Whether "near me" can be offered here, and where one is once it's on.
export function useNearMe() {
  const [available, setAvailable] = useState(false);
  const [near, setNear] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    canUseLocation()
      .then((ok) => !cancelled && setAvailable(ok))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => {
    if (near) {
      setNear(null);
      return;
    }
    setLocating(true);
    currentPosition()
      .then(setNear)
      .catch((error) => Alert.alert("Couldn't find where you are", errorText(error)))
      .finally(() => setLocating(false));
  }, [near]);

  return { available, near, locating, toggle };
}

// Every public restaurant matching `query` (two letters or more), nearest
// first when `near` is given — or, with no query, the nearest. Asked a
// moment after typing stops; the latest search wins.
export function usePublicRestaurants(query: string, near: Position | null, enabled = true) {
  const [found, setFound] = useState<Restaurant[]>([]);
  const [searching, setSearching] = useState(false);
  const run = useRef(0);
  const nearRef = useRef(near);
  nearRef.current = near;
  const q = query.trim();
  const nearKey = near ? `${near.lat},${near.lng}` : "";
  const wanted = enabled && (q.length >= 2 || !!nearKey);

  useEffect(() => {
    const thisRun = ++run.current;
    if (!wanted) {
      setFound([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchRestaurants(q, nearRef.current)
        .then((results) => thisRun === run.current && setFound(Array.isArray(results) ? results : []))
        .catch(() => thisRun === run.current && setFound([]))
        .finally(() => thisRun === run.current && setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [wanted, q, nearKey]);

  return { found: wanted ? found : [], searching: wanted && searching, setFound };
}

// Into your list (it's public already: this only makes it yours).
export async function addToMine(restaurant: Restaurant): Promise<Restaurant> {
  const mine = await setRestaurantMine(restaurant._id, { saved: true });
  return { ...restaurant, mine: { ...restaurant.mine, ...mine, saved: true } };
}

// Out of your list, once confirmed; it stays in Orbit for everyone.
export function confirmRemoveFromMine(restaurant: Restaurant, onRemoved: () => void) {
  Alert.alert(`Take "${restaurant.name}" out of your list?`, "It stays in Orbit for everyone, and your past visits are kept. You can add it back from a search.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: () => {
        removeRestaurant(restaurant._id)
          .then(onRemoved)
          .catch((error) => Alert.alert("Couldn't remove it", errorText(error)));
      },
    },
  ]);
}

// The ✓ for one of yours, or a + to add it (like the food library's).
export function MineToggle({ mine, onAdd, busy }: { mine: boolean; onAdd: () => void; busy?: boolean }) {
  const { colors: o } = useOrbitTheme();
  if (mine) return <Ionicons name="checkmark-circle" size={24} color={o.ink} accessibilityLabel="In your list" />;
  return (
    <Tap onPress={onAdd} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add to your list" style={{ opacity: busy ? 0.4 : 1 }} pressedStyle={{ opacity: 0.5 }}>
      <Ionicons name="add-circle-outline" size={24} color={o.faint} />
    </Tap>
  );
}

// --- Bits of a page ------------------------------------------------------------

// A round button on the page itself (the way back, edit, add).
export function RoundButton({ icon, label, onPress, filled, disabled }: { icon: IconName; label: string; onPress: () => void; filled?: boolean; disabled?: boolean }) {
  const { colors: o } = useOrbitTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: filled ? o.ink : o.surface, borderWidth: filled ? 0 : 1, borderColor: o.border, opacity: disabled ? 0.5 : 1 }}
      pressedStyle={filled ? { opacity: 0.8 } : { backgroundColor: o.pill }}
    >
      <Ionicons name={icon} size={filled ? 24 : 21} color={filled ? o.onInk : o.text} />
    </Tap>
  );
}

// A small heading over a card: "MENU · 12".
export function Eyebrow({ text, count, right, style }: { text: string; count?: number; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors: o } = useOrbitTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", marginBottom: 8 }, style]}>
      <Text style={{ flex: 1, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: o.faint }}>
        {text.toUpperCase()}
        {count != null && <Text style={{ color: o.orbit }}> · {count}</Text>}
      </Text>
      {right}
    </View>
  );
}

// A sheet over the page: slid up from the bottom on the phone; a card in
// the middle of the window in a desktop browser. `footer` stays put under
// what scrolls.
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 640,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const { colors: o } = useOrbitTheme();
  const wide = useWideWeb();

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: wide ? 18 : 16, paddingBottom: 8 }}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 22, fontWeight: "800", letterSpacing: -0.4, color: o.text }}>
          {title}
        </Text>
        {!!subtitle && <Text style={{ marginTop: 2, fontSize: 13, color: o.muted }}>{subtitle}</Text>}
      </View>
      <Tap
        hitSlop={8}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{ marginLeft: 12, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}
        pressedStyle={{ backgroundColor: o.pill }}
      >
        <Ionicons name="close" size={19} color={o.text} />
      </Tap>
    </View>
  );
  const body = (
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: footer ? 16 : 40, paddingTop: 4 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
  const foot = footer ? <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: wide ? 18 : 30, borderTopWidth: 1, borderTopColor: o.border }}>{footer}</View> : null;

  if (wide) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: o.scrim }}>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} accessibilityLabel="Close" />
          <View style={{ width: "100%", maxWidth: width, maxHeight: "92%", borderRadius: 22, borderWidth: 1, borderColor: o.border, backgroundColor: o.canvas, overflow: "hidden" }}>
            {header}
            {body}
            {foot}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: o.canvas }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {header}
        {body}
        {foot}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The sheet's buttons: the main one filled in the section's colour.
export function SheetButton({ label, onPress, kind = "primary", disabled, icon }: { label: string; onPress: () => void; kind?: "primary" | "secondary" | "danger"; disabled?: boolean; icon?: IconName }) {
  const { colors: o } = useOrbitTheme();
  const primary = kind === "primary";
  const color = primary ? o.onInk : kind === "danger" ? o.danger : o.onPill;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ flex: 1, height: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: primary ? o.ink : o.pill, opacity: disabled ? 0.5 : 1 }}
      pressedStyle={{ opacity: 0.8 }}
    >
      {!!icon && <Ionicons name={icon} size={18} color={color} style={{ marginRight: 6 }} />}
      <Text style={{ fontSize: 15, fontWeight: "600", color }}>{label}</Text>
    </Tap>
  );
}
