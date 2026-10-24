import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormInput } from "@/src/components/forms";
import { DishEditor } from "@/src/components/restaurants/DishEditor";
import { DishSheet } from "@/src/components/restaurants/DishSheet";
import {
  addedByName,
  averageScore,
  chainNameOf,
  errorText,
  Eyebrow,
  historyWhat,
  historyWho,
  Macros,
  priceText,
  RoundButton,
  SheetButton,
  shortDate,
  StatusChip,
  ChangeLines,
} from "@/src/components/restaurants/parts";
import { Tap } from "@/src/components/ui/Tap";
import { Button, Card, hoverable, WebPage } from "@/src/components/web/ui";
import { getMealPlanHistoryForRestaurant, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { getRestaurant, mapsUrl, setRestaurantMine, type ChangeRequest, type RestaurantDetail, type RestaurantDish } from "@/src/services/restaurantApi";
import { nutrientColor } from "@/src/theme/nutrients";
import { OrbitPage, OrbitSection, SECTION_PALETTE, useOrbitTheme } from "@/src/theme/orbit";
import { friendlyDayLabel } from "@/src/utils/mealPlan";
import { useWideWeb } from "@/src/utils/useWideWeb";

// A restaurant's page (Kitchen → Restaurants): where it is, its menu — each
// dish with its numbers, your rating and what you paid — your own notes, your
// past visits, and the changes everyone's made to it (restaurants are shared,
// corrected wiki-style). In the Kitchen's colours; in a desktop browser, the
// menu as a table with everything else in a column beside it. Reviewed: one's
// own still waiting (the restaurant, or a dish) says so — only they see it
// meanwhile — and one's suggested changes are listed until a reviewer's
// looked at them.
export default function RestaurantPage() {
  return (
    <OrbitSection section="kitchen">
      <OrbitPage>
        <RestaurantScreen />
      </OrbitPage>
    </OrbitSection>
  );
}

const withScheme = (url: string) => (/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);

function open(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open it", url));
}

// The menu in its sections (in the order the server gives them, by name),
// any dishes without one last.
function sectionsOf(dishes: RestaurantDish[]): { name: string; dishes: RestaurantDish[] }[] {
  const named = new Map<string, RestaurantDish[]>();
  const loose: RestaurantDish[] = [];
  for (const dish of dishes) {
    const section = dish.section?.trim();
    if (!section) loose.push(dish);
    else named.set(section, [...(named.get(section) ?? []), dish]);
  }
  const groups = [...named.entries()].map(([name, list]) => ({ name, dishes: list }));
  if (loose.length) groups.push({ name: groups.length ? "Other dishes" : "", dishes: loose });
  return groups;
}

// A visit's calories, from the copy of each dish it kept.
function visitKcal(visit: MealPlanEntry): number | null {
  const selections = visit.restaurantDishSelections ?? [];
  const known = selections.filter((s) => s.nutrition?.calories != null);
  if (!known.length) return null;
  return Math.round(known.reduce((sum, s) => sum + (s.nutrition?.calories ?? 0) * (s.quantity ?? 1), 0));
}

function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const wide = useWideWeb();
  const { colors: o, dark } = useOrbitTheme();

  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visits, setVisits] = useState<MealPlanEntry[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingMine, setSavingMine] = useState(false);
  const [openDishId, setOpenDishId] = useState<string | null>(null);
  const [addingDish, setAddingDish] = useState(false);
  // Past visits fold away on the phone (there can be many); the changes do everywhere.
  const [visitsOpen, setVisitsOpen] = useState(false);
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      getRestaurant(id)
        .then((found) => {
          if (cancelled) return;
          setRestaurant(found);
          setNotes(found.mine?.notes ?? "");
          setError(null);
        })
        .catch((err) => !cancelled && setError(errorText(err, "Couldn't load this restaurant.")));
      getMealPlanHistoryForRestaurant(id)
        .then((found) => !cancelled && setVisits(found))
        .catch(() => !cancelled && setVisits([]))
        .finally(() => !cancelled && setVisitsLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  const dishes = useMemo(() => restaurant?.dishes ?? [], [restaurant]);
  const groups = useMemo(() => sectionsOf(dishes), [dishes]);
  const sectionNames = useMemo(() => [...new Set(dishes.map((d) => d.section?.trim()).filter((s): s is string => !!s))], [dishes]);
  const openDish = dishes.find((d) => d._id === openDishId) ?? null;

  if (!restaurant) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: o.canvas }}>
        {error ? (
          <>
            <Ionicons name="alert-circle-outline" size={40} color={o.faint} />
            <Text style={{ marginTop: 12, textAlign: "center", color: o.muted }}>{error}</Text>
            <View style={{ marginTop: 16, flexDirection: "row", width: 220 }}>
              <SheetButton kind="secondary" label="All restaurants" onPress={() => router.replace("/restaurants")} />
            </View>
          </>
        ) : (
          <ActivityIndicator size="large" color={o.muted} />
        )}
      </SafeAreaView>
    );
  }

  const r = restaurant;
  const chain = chainNameOf(r);
  const saved = !!r.mine?.saved;
  const addedBy = (typeof r.addedBy === "object" && r.addedBy?.name) || addedByName(r.history);
  const notesChanged = notes.trim() !== (r.mine?.notes ?? "");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/restaurants"));
  const edit = () => router.push({ pathname: "/restaurants/edit/[id]", params: { id: r._id } });

  const changeDish = (dish: RestaurantDish) => setRestaurant((prev) => (prev ? { ...prev, dishes: prev.dishes.map((d) => (d._id === dish._id ? dish : d)) } : prev));
  const dropDish = (dishId: string) => {
    setOpenDishId(null);
    setRestaurant((prev) => (prev ? { ...prev, dishes: prev.dishes.filter((d) => d._id !== dishId) } : prev));
  };

  function toggleMine() {
    setSavingMine(true);
    setRestaurantMine(r._id, { saved: !saved })
      .then((mine) => setRestaurant((prev) => (prev ? { ...prev, mine: { ...prev.mine, ...mine } } : prev)))
      .catch((err) => Alert.alert("Couldn't change your list", errorText(err)))
      .finally(() => setSavingMine(false));
  }

  function saveNotes() {
    setSavingNotes(true);
    setRestaurantMine(r._id, { notes: notes.trim() })
      .then((mine) => setRestaurant((prev) => (prev ? { ...prev, mine: { ...prev.mine, ...mine } } : prev)))
      .catch((err) => Alert.alert("Couldn't save your notes", errorText(err)))
      .finally(() => setSavingNotes(false));
  }

  const card = { borderRadius: 18, borderWidth: 1, borderColor: o.border, backgroundColor: o.surface };
  const link = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <Tap key={label} onPress={onPress} accessibilityRole="link" style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }} pressedStyle={{ opacity: 0.6 }}>
      <Ionicons name={icon} size={16} color={o.accent} />
      <Text numberOfLines={1} style={{ flexShrink: 1, marginLeft: 8, fontSize: 14, fontWeight: "600", color: o.accent }}>
        {label}
      </Text>
    </Tap>
  );

  // Its name, what it is, and yours or not.
  const header = (
    <View>
      <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>{r.name}</Text>
      {(!!r.cuisine || !!chain) && <Text style={{ marginTop: 4, fontSize: 15, color: o.muted }}>{[r.cuisine, chain && chain.toLowerCase() !== r.name.toLowerCase() ? `Part of ${chain}` : chain ? "A chain" : ""].filter(Boolean).join(" · ")}</Text>}
      {!!r.address && <Text style={{ marginTop: 2, fontSize: 14, color: o.faint }}>{r.address}</Text>}
      {(r.status === "pending" || r.status === "rejected") && (
        <View style={{ marginTop: 10 }}>
          <StatusChip status={r.status} reviewNote={r.reviewNote} withNote />
          <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: o.muted }}>
            {r.status === "pending"
              ? "Only you can see it until a reviewer approves it — you can still log visits to it, and fix it meanwhile."
              : "A reviewer didn't approve it, so only you can see it. Your visits to it are kept."}
          </Text>
        </View>
      )}
      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Tap
          onPress={toggleMine}
          disabled={savingMine}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          style={{ height: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: saved ? o.ink : o.border, backgroundColor: saved ? o.ink : o.surface, opacity: savingMine ? 0.6 : 1 }}
          pressedStyle={{ opacity: 0.8 }}
        >
          <Ionicons name={saved ? "star" : "star-outline"} size={15} color={saved ? o.onInk : o.ink} />
          <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: saved ? o.onInk : o.text }}>{saved ? "In your list" : "Add to your list"}</Text>
        </Tap>
      </View>
    </View>
  );

  // Where it is and how to reach it, and who added it.
  const info = (
    <View>
      {link("map-outline", "Open in Google Maps", () => open(mapsUrl(r)))}
      {!!r.website && link("globe-outline", r.website.replace(/^https?:\/\//i, ""), () => open(withScheme(r.website ?? "")))}
      {!!r.phone && link("call-outline", r.phone, () => open(`tel:${(r.phone ?? "").replace(/[^\d+]/g, "")}`))}
      {!!chain && <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: o.faint }}>A {chain} location: its menu is the chain&apos;s, shared by all of them.</Text>}
      <Text style={{ marginTop: 6, fontSize: 12, color: o.faint }}>
        {addedBy ? `Added by ${addedBy}` : "Shared by everyone in Orbit"}
        {r.createdAt ? ` · ${shortDate(r.createdAt)}` : ""}
      </Text>
    </View>
  );

  const notesBox = (
    <View>
      <FormInput value={notes} onChangeText={setNotes} placeholder="Only you see these — e.g. The one near work; ask for extra sauce" multiline />
      {notesChanged && (
        <View style={{ marginTop: 10, flexDirection: "row" }}>
          <SheetButton label={savingNotes ? "Saving…" : "Save notes"} onPress={saveNotes} disabled={savingNotes} />
        </View>
      )}
    </View>
  );

  const addDishButton = (
    <Tap onPress={() => setAddingDish(true)} accessibilityRole="button" style={{ height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: o.faint, backgroundColor: o.pill }} pressedStyle={{ opacity: 0.75 }}>
      <Ionicons name="add" size={20} color={o.ink} />
      <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: "600", color: o.onPill }}>Add a dish</Text>
    </Tap>
  );

  // The menu on the phone: a card for each section.
  const phoneMenu = (
    <View style={{ marginTop: 24 }}>
      <Eyebrow text="Menu" count={dishes.length} />
      {dishes.length === 0 && <Text style={{ marginLeft: 4, marginBottom: 12, fontSize: 14, color: o.muted }}>No dishes yet — add the ones you know, and they&apos;re there for everyone.</Text>}
      {groups.map((group) => (
        <View key={group.name || "menu"} style={{ marginBottom: 14 }}>
          {!!group.name && <Text style={{ marginLeft: 4, marginBottom: 6, fontSize: 13, fontWeight: "700", color: o.icon }}>{group.name}</Text>}
          <View style={{ ...card, overflow: "hidden" }}>
            {group.dishes.map((dish, i) => {
              const average = averageScore(dish.mine?.scores);
              return (
                <Tap key={dish._id} onPress={() => setOpenDishId(dish._id)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: o.text }}>{dish.name}</Text>
                    <StatusChip status={dish.status} style={{ marginTop: 3 }} />
                    <Macros nutrition={dish.nutrition} style={{ marginTop: 3 }} />
                  </View>
                  <View style={{ marginLeft: 10, alignItems: "flex-end" }}>
                    {average != null && (
                      <Text style={{ fontSize: 13, fontWeight: "700", color: o.text }}>
                        {average}
                        <Text style={{ fontWeight: "500", color: o.faint }}> / 10</Text>
                      </Text>
                    )}
                    {dish.mine?.price != null && <Text style={{ marginTop: 1, fontSize: 12, color: o.muted }}>{priceText(dish.mine.price)}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={o.faint} style={{ marginLeft: 6 }} />
                </Tap>
              );
            })}
          </View>
        </View>
      ))}
      {addDishButton}
    </View>
  );

  // The menu on a desktop: a table, a row a dish, its sections as headings.
  const cell = (text: ReactNode, width: number | undefined, align: "left" | "right" = "right", color = o.text) => (
    <View style={width ? { width } : { flex: 1, minWidth: 0 }}>
      {typeof text === "string" || typeof text === "number" ? <Text numberOfLines={1} style={{ textAlign: align, fontSize: 13, color }}>{text}</Text> : text}
    </View>
  );
  const head = (text: string, width: number | undefined, align: "left" | "right" = "right", key?: "calories" | "protein" | "carbs" | "fats") => (
    <View style={width ? { width } : { flex: 1 }}>
      <Text style={{ textAlign: align, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: key ? nutrientColor(key, dark) : o.faint }}>{text.toUpperCase()}</Text>
    </View>
  );
  const num = (value: number | null | undefined, unit = "") => (value == null ? "—" : `${Math.round(value)}${unit}`);
  const tableMenu = (
    <Card title="Menu" subtitle={`${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"}${chain ? ` · ${chain}'s menu` : ""} · shared by everyone`} action={<Button label="Add a dish" icon="add" kind="primary" small onPress={() => setAddingDish(true)} />} padded={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: o.border, backgroundColor: o.canvas }}>
        {head("Dish", undefined, "left")}
        {head("kcal", 56, "right", "calories")}
        {head("Protein", 62, "right", "protein")}
        {head("Carbs", 56, "right", "carbs")}
        {head("Fat", 48, "right", "fats")}
        {head("Your rating", 84)}
        {head("You paid", 70)}
      </View>
      {dishes.length === 0 && <Text style={{ padding: 18, fontSize: 14, color: o.muted }}>No dishes yet — add the ones you know, and they&apos;re there for everyone.</Text>}
      {groups.map((group) => (
        <View key={group.name || "menu"}>
          {!!group.name && (
            <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: o.muted }}>{group.name.toUpperCase()}</Text>
            </View>
          )}
          {group.dishes.map((dish) => {
            const n = dish.nutrition ?? {};
            const average = averageScore(dish.mine?.scores);
            return (
              <Pressable
                key={dish._id}
                onPress={() => setOpenDishId(dish._id)}
                style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: 1, borderTopColor: o.border, backgroundColor: hovered ? SECTION_PALETTE.kitchen.tint : "transparent" }))}
              >
                {cell(
                  <View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontWeight: "600", color: o.text }}>
                        {dish.name}
                      </Text>
                      <StatusChip status={dish.status} />
                    </View>
                    {!!dish.mine?.notes && (
                      <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: o.faint }}>
                        {dish.mine.notes}
                      </Text>
                    )}
                  </View>,
                  undefined,
                  "left",
                )}
                {cell(num(n.calories), 56, "right", o.text)}
                {cell(num(n.protein, " g"), 62, "right", o.muted)}
                {cell(num(n.carbs, " g"), 56, "right", o.muted)}
                {cell(num(n.fats, " g"), 48, "right", o.muted)}
                {cell(average != null ? `${average} / 10` : "—", 84, "right", average != null ? o.text : o.faint)}
                {cell(priceText(dish.mine?.price) || "—", 70, "right", dish.mine?.price != null ? o.text : o.faint)}
              </Pressable>
            );
          })}
        </View>
      ))}
    </Card>
  );

  // Past visits: what was had, from the copy each kept.
  const visitList = visitsLoading ? (
    <ActivityIndicator color={o.muted} style={{ marginVertical: 12 }} />
  ) : visits.length === 0 ? (
    <Text style={{ fontSize: 14, color: o.faint }}>No visits logged yet.</Text>
  ) : (
    <View>
      {visits.map((visit, i) => {
        const isOpen = openVisitId === visit._id;
        const selections = visit.restaurantDishSelections ?? [];
        const kcal = visitKcal(visit);
        return (
          <View key={visit._id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: o.border }}>
            <Tap onPress={() => setOpenVisitId(isOpen ? null : visit._id)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: o.text }}>{friendlyDayLabel(visit.date)}</Text>
                <Text style={{ marginTop: 1, fontSize: 12, color: o.muted }}>
                  {selections.length} {selections.length === 1 ? "dish" : "dishes"}
                  {kcal != null ? ` · ${kcal} kcal` : ""}
                  {visit.status === "confirmed" ? "" : " · planned"}
                </Text>
              </View>
              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={o.faint} />
            </Tap>
            {isOpen && (
              <View style={{ paddingBottom: 10 }}>
                {selections.length === 0 && <Text style={{ fontSize: 13, color: o.faint }}>No dishes were noted.</Text>}
                {selections.map((s, j) => (
                  <View key={`${s.dish}-${j}`} style={{ flexDirection: "row", paddingVertical: 3 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: s.name ? o.text : o.faint }}>
                      {s.name ?? "A dish no longer on the menu"}
                      {(s.quantity ?? 1) !== 1 ? ` ×${s.quantity}` : ""}
                    </Text>
                    {s.nutrition?.calories != null && <Text style={{ fontSize: 12, color: o.muted }}>{Math.round(s.nutrition.calories * (s.quantity ?? 1))} kcal</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );

  // Everyone's changes to it, newest first.
  const changeList = (
    <View>
      {(r.history ?? []).length === 0 && <Text style={{ fontSize: 13, color: o.faint }}>No changes yet.</Text>}
      {(r.history ?? []).map((entry, i) => (
        <View key={`${entry.at}-${i}`} style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: o.border }}>
          <Text style={{ fontSize: 13, color: o.text }}>
            <Text style={{ fontWeight: "700" }}>{historyWho(entry)}</Text> · {historyWhat(entry).toLowerCase()}
          </Text>
          <Text style={{ marginTop: 1, fontSize: 12, color: o.faint }}>{shortDate(entry.at)}</Text>
          {!!entry.note && entry.note !== "added" && <Text style={{ marginTop: 3, fontSize: 13, fontStyle: "italic", color: o.muted }}>“{entry.note}”</Text>}
        </View>
      ))}
    </View>
  );

  // One's suggestions still waiting: what would change, and why.
  const suggestions = r.mySuggestions ?? [];
  const suggestionList = (
    <View>
      {suggestions.map((request, i) => {
        const dish = request.kind === "dish" ? dishes.find((d) => d._id === request.item) : null;
        return (
          <View key={request._id} style={{ paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: o.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "700", color: o.text }}>
                {request.kind === "restaurant" ? "This restaurant" : (dish?.name ?? "A dish")}
              </Text>
              <StatusChip status="pending" />
            </View>
            <ChangeLines changes={request.changes} before={request.before} removal={request.action === "remove"} />
            {!!request.note && <Text style={{ marginTop: 4, fontSize: 13, fontStyle: "italic", color: o.muted }}>“{request.note}”</Text>}
            {!!request.createdAt && <Text style={{ marginTop: 3, fontSize: 12, color: o.faint }}>Suggested {shortDate(request.createdAt)}</Text>}
          </View>
        );
      })}
    </View>
  );
  const addSuggestion = (request: ChangeRequest) => {
    setOpenDishId(null);
    setRestaurant((prev) => (prev ? { ...prev, mySuggestions: [request, ...(prev.mySuggestions ?? [])] } : prev));
  };

  const folding = (title: string, count: number, isOpen: boolean, toggle: () => void, body: ReactNode) => (
    <View style={{ marginTop: 22 }}>
      <Tap onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={{ paddingVertical: 4 }} pressedStyle={{ opacity: 0.6 }}>
        <Eyebrow text={title} count={count} right={<Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={o.muted} />} style={{ marginBottom: 4 }} />
      </Tap>
      {isOpen && <View style={{ ...card, paddingHorizontal: 14, paddingVertical: 6, marginTop: 6 }}>{body}</View>}
    </View>
  );

  const sheets = (
    <>
      {openDish && (
        <DishSheet restaurant={r} dish={openDish} sections={sectionNames} canReview={r.canReview} onClose={() => setOpenDishId(null)} onChanged={changeDish} onRemoved={dropDish} onSuggested={addSuggestion} />
      )}
      {addingDish && (
        <DishEditor
          restaurant={r}
          sections={sectionNames}
          canReview={r.canReview}
          onCancel={() => setAddingDish(false)}
          onSaved={(dish) => {
            setAddingDish(false);
            setRestaurant((prev) => (prev ? { ...prev, dishes: [...prev.dishes, dish] } : prev));
          }}
        />
      )}
    </>
  );

  if (wide) {
    return (
      <WebPage maxWidth={1280}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 8 }}>
          <RoundButton icon="chevron-back" label="Back" onPress={back} />
          <View style={{ flex: 1 }} />
          <Button label="Edit restaurant" icon="create-outline" onPress={edit} />
        </View>
        <View style={{ marginBottom: 18 }}>{header}</View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 18 }}>
          <View style={{ flex: 1, minWidth: 0 }}>{tableMenu}</View>
          <View style={{ width: 360, gap: 16 }}>
            <Card title="Where it is">{info}</Card>
            {suggestions.length > 0 && (
              <Card title="Your suggestions" subtitle="Waiting for a reviewer">
                {suggestionList}
              </Card>
            )}
            <Card title="Your notes" subtitle="Only you see these">
              {notesBox}
            </Card>
            <Card title="Past visits" subtitle={`${visits.length} logged`}>
              {visitList}
            </Card>
            <Card title="Changes" subtitle="Everyone's corrections, newest first" action={<Button small label={changesOpen ? "Hide" : `Show ${(r.history ?? []).length}`} onPress={() => setChangesOpen((v) => !v)} />}>
              {changesOpen ? changeList : <Text style={{ fontSize: 13, color: o.faint }}>{addedBy ? `Added by ${addedBy}.` : "Kept so any change can be undone."}</Text>}
            </Card>
          </View>
        </View>
        {sheets}
      </WebPage>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: o.canvas }} edges={["top", "left", "right"]}>
      {/* The way back and Edit, round, on the page itself (its name is the large title) */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4 }}>
        <RoundButton icon="chevron-back" label="Back" onPress={back} />
        <View style={{ flex: 1 }} />
        <RoundButton icon="create-outline" label="Edit restaurant" onPress={edit} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {header}
        <View style={{ marginTop: 16 }}>{info}</View>

        <View style={{ marginTop: 20 }}>
          <Eyebrow text="Your notes" />
          {notesBox}
        </View>

        {suggestions.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <Eyebrow text="Your suggestions" count={suggestions.length} />
            <View style={{ ...card, paddingHorizontal: 14, paddingVertical: 4 }}>{suggestionList}</View>
          </View>
        )}
        {phoneMenu}
        {folding("Past visits", visits.length, visitsOpen, () => setVisitsOpen((v) => !v), visitList)}
        {folding("Changes", (r.history ?? []).length, changesOpen, () => setChangesOpen((v) => !v), changeList)}
      </ScrollView>
      {sheets}
    </SafeAreaView>
  );
}
