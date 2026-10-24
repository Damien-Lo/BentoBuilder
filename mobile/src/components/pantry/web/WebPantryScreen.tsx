import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { useAccount } from "@/src/components/auth/AuthGate";

import { addDays } from "@/src/components/calendar/calendarUtils";
import { friendlyDate } from "@/src/components/todo/theme";
import {
  alwaysInMyIngredients,
  fromLibrary,
  libraryTagColors,
  inMyIngredients,
  setIngredientSaved,
  useIngredientLibrarySearch,
  withSaved,
} from "@/src/components/ingredients/foodLibrary";
import { Button, Empty, hoverable, PageTitle, Row, Segmented, WebPage } from "@/src/components/web/ui";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getPantryItems } from "@/src/services/pantryApi";
import type { PantryItem } from "@/src/types/pantry";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { todayStr } from "@/src/utils/mealPlan";

import { OrbitStat } from "./orbitWeb";

// The pantry in a desktop browser: everything in stock as one sortable,
// searchable table (the phone groups it by location and shows a shelf at a
// time), with your ingredients as a second table — and, searching, what
// else the food library has by that name, each with ✓ / + to put it in your
// list or take it out (as the phone's Ingredients page; foodLibrary.ts). In
// Orbit's look, in the Kitchen's colour.

type View_ = "stock" | "ingredients";
type Status = "all" | "soon" | "expired";
type SortKey = "name" | "location" | "expires" | "bought";

const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
// Names come back populated ({ name }) or as a bare id, depending on the call.
const nameOf = (value: unknown): string =>
  value && typeof value === "object" && "name" in value ? String((value as { name: unknown }).name ?? "") : "";

export function WebPantryScreen() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const today = todayStr();
  const soon = addDays(today, 7);
  const [items, setItems] = useState<PantryItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View_>("stock");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [location, setLocation] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "expires", dir: 1 });
  const isAdmin = useAccount().account?.role === "admin";
  // Library foods put in or taken out during this search: they keep their
  // place in the library's table, with their new tick.
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  const { results: libraryResults, setResults: setLibraryResults, loading: libraryLoading } = useIngredientLibrarySearch(
    view === "ingredients" ? search : "",
  );

  useFocusEffect(
    useCallback(() => {
      getPantryItems()
        .then((loadedItems) => {
          setItems(loadedItems);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
      getIngredients().then(setIngredients).catch(() => {});
    }, []),
  );

  const inStock = useMemo(() => items.filter((p) => !p.isFinished), [items]);
  const stateOf = (item: PantryItem): Status => {
    const d = dayOf(item.expiryDate);
    if (!d) return "all";
    return d < today ? "expired" : d <= soon ? "soon" : "all";
  };
  const expired = inStock.filter((p) => stateOf(p) === "expired");
  const expiring = inStock.filter((p) => stateOf(p) === "soon");
  const value = inStock.reduce((sum, p) => sum + (p.purchasePrice ?? 0), 0);
  const locations = [...new Set(inStock.map((p) => nameOf(p.storageLocation)).filter(Boolean))].sort();

  const q = search.trim().toLowerCase();
  const rows = inStock
    .filter((p) => (status === "all" ? true : stateOf(p) === status))
    .filter((p) => !location || nameOf(p.storageLocation) === location)
    .filter((p) => !q || `${p.ingredient?.name ?? ""} ${nameOf(p.ingredient?.brand)} ${nameOf(p.ingredient?.category)}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const pick = (p: PantryItem) =>
        sort.key === "name"
          ? (p.ingredient?.name ?? "").toLowerCase()
          : sort.key === "location"
            ? nameOf(p.storageLocation).toLowerCase()
            : sort.key === "bought"
              ? p.purchaseDate ?? ""
              : // No expiry date sorts last.
                p.expiryDate ?? "9999";
      return pick(a).localeCompare(pick(b)) * sort.dir || (a.ingredient?.name ?? "").localeCompare(b.ingredient?.name ?? "");
    });

  // Only your ingredients (the rest of `ingredients` is what the pantry
  // points at).
  const mine = ingredients.filter(inMyIngredients);
  const catalogue = mine
    .filter((i) => !toggledIds.has(i._id))
    .filter((i) => !q || `${i.name} ${nameOf(i.brand)} ${nameOf(i.category)}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const shownIds = new Set(catalogue.map((i) => i._id));
  const fromLibrary = q.length >= 2 ? (libraryResults ?? []).filter((food) => !shownIds.has(food._id)) : [];

  // A library food into your ingredients or out, at once — put back if the
  // server says no. (Your own, and the admin's catalog, stay.)
  async function toggleSaved(food: Ingredient) {
    if (alwaysInMyIngredients(food, isAdmin)) return;
    const saved = !inMyIngredients(food);
    const swap = (to: boolean) => {
      setIngredients((prev) => (to || prev.some((i) => i._id === food._id) ? withSaved(prev, food, to) : prev));
      setLibraryResults((prev) => prev && prev.map((i) => (i._id === food._id ? { ...i, saved: to } : i)));
    };
    setToggledIds((prev) => new Set(prev).add(food._id));
    swap(saved);
    try {
      await setIngredientSaved(food, saved);
    } catch (error) {
      swap(!saved);
      Alert.alert("Couldn't change your ingredients", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  const sortBy = (key: SortKey) => setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  return (
    <OrbitPage>
    <WebPage>
      <PageTitle
        title="Pantry"
        subtitle={view === "stock" ? "Everything in stock" : "Your ingredients, in stock or not — search to add more from the food library"}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Receipts" icon="receipt-outline" onPress={() => router.push("/receipts")} />
            <Button label="New ingredient" icon="nutrition-outline" onPress={() => router.push("/ingredients/add_manual")} />
            <Button label="Add to pantry" icon="add" kind="primary" onPress={() => router.push("/pantry/add_by_ingredient")} />
          </View>
        }
      />

      <Row gap={12}>
        <OrbitStat label="In stock" value={String(inStock.length)} sub={`across ${locations.length} location${locations.length === 1 ? "" : "s"}`} icon="basket-outline" />
        <OrbitStat label="Expired" value={String(expired.length)} sub="past their date" tone={expired.length ? "bad" : undefined} icon="alert-circle-outline" />
        <OrbitStat label="Expiring soon" value={String(expiring.length)} sub="within 7 days" tone={expiring.length ? "warn" : undefined} icon="time-outline" />
        <OrbitStat label="Stock value" value={value > 0 ? `$${value.toFixed(0)}` : "—"} sub="what the items in stock cost" icon="pricetag-outline" />
      </Row>

      {/* Filters */}
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 16, marginBottom: 12 }}>
        <Segmented
          options={[
            { value: "stock", label: "In stock" },
            { value: "ingredients", label: "All ingredients" },
          ]}
          value={view}
          onChange={setView}
        />
        <View style={{ flexDirection: "row", alignItems: "center", height: 36, width: 280, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
          <Ionicons name="search" size={15} color={c.faint} />
          <TextInput
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              if (value.trim().length < 2) setToggledIds(new Set());
            }}
            placeholder={view === "stock" ? "Search the pantry" : "Search ingredients and the food library"}
            placeholderTextColor={c.faint}
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: c.text, outlineStyle: "none" } as object}
          />
        </View>
        {view === "stock" && (
          <>
            <Segmented
              options={[
                { value: "all", label: "All" },
                { value: "soon", label: `Expiring (${expiring.length})` },
                { value: "expired", label: `Expired (${expired.length})` },
              ]}
              value={status}
              onChange={setStatus}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {[null, ...locations].map((name) => {
                const on = location === name;
                return (
                  <Pressable
                    key={name ?? "all"}
                    onPress={() => setLocation(name)}
                    style={hoverable(({ hovered }) => ({
                      height: 30,
                      paddingHorizontal: 13,
                      justifyContent: "center",
                      borderRadius: 15,
                      backgroundColor: on ? c.ink : hovered ? c.track : c.pill,
                    }))}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: on ? "700" : "600", color: on ? c.onInk : c.onPill }}>{name ?? "Everywhere"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* Table */}
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, overflow: "hidden" }}>
        {view === "stock" ? (
          <>
            <View style={{ flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <HeadCell label="Item" flex={2.4} sort={sort} sortKey="name" onSort={sortBy} />
              <HeadCell label="Category" flex={1.2} />
              <HeadCell label="Location" flex={1.1} sort={sort} sortKey="location" onSort={sortBy} />
              <HeadCell label="Quantity" flex={0.9} />
              <HeadCell label="Bought" flex={0.9} sort={sort} sortKey="bought" onSort={sortBy} />
              <HeadCell label="Expires" flex={1.1} sort={sort} sortKey="expires" onSort={sortBy} />
            </View>
            {loaded && rows.length === 0 && <Empty icon="basket-outline" text={inStock.length ? "Nothing matches those filters" : "The pantry is empty"} />}
            {rows.map((item) => {
              const state = stateOf(item);
              const expiry = dayOf(item.expiryDate);
              return (
                <Pressable
                  key={item._id}
                  onPress={() => router.push({ pathname: "/pantry/edit/[id]", params: { id: item._id } })}
                  style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", minHeight: 46, borderBottomWidth: 1, borderBottomColor: c.track, backgroundColor: hovered ? c.pill : c.surface }))}
                >
                  <Cell flex={2.4}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: c.text }}>
                      {item.ingredient?.name ?? "Item"}
                    </Text>
                    {!!nameOf(item.ingredient?.brand) && (
                      <Text numberOfLines={1} style={{ fontSize: 12, color: c.muted }}>
                        {nameOf(item.ingredient?.brand)}
                      </Text>
                    )}
                  </Cell>
                  <Cell flex={1.2} text={nameOf(item.ingredient?.category) || "—"} />
                  <Cell flex={1.1} text={nameOf(item.storageLocation) || "—"} />
                  <Cell flex={0.9} text={`${Math.round(item.quantityAvailable * 100) / 100} ${item.quantityUnit}`} strong />
                  <Cell flex={0.9} text={dayOf(item.purchaseDate) ? friendlyDate(dayOf(item.purchaseDate)!) : "—"} />
                  <Cell flex={1.1}>
                    {expiry ? (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {state !== "all" && <View style={{ width: 7, height: 7, borderRadius: 4, marginRight: 6, backgroundColor: state === "expired" ? c.danger : c.warning }} />}
                        <Text style={{ fontSize: 13, fontWeight: state === "all" ? "400" : "600", color: state === "expired" ? c.danger : state === "soon" ? c.warning : c.icon }}>
                          {friendlyDate(expiry)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 13, color: c.faint }}>No date</Text>
                    )}
                  </Cell>
                </Pressable>
              );
            })}
          </>
        ) : (
          <>
            <IngredientHead last="In stock" />
            {catalogue.length === 0 && <Empty icon="nutrition-outline" text={mine.length ? "None of your ingredients match" : "No ingredients yet: search the food library to add some"} />}
            {catalogue.map((ingredient) => {
              const stocked = inStock.filter((p) => p.ingredient?._id === ingredient._id).length;
              return (
                <IngredientRow
                  key={ingredient._id}
                  ingredient={ingredient}
                  onOpen={() => router.push({ pathname: "/ingredients/edit/[id]", params: { id: ingredient._id } })}
                  last={stocked > 0 ? <Ionicons name="checkmark-circle" size={16} color={c.success} /> : <Text style={{ fontSize: 13, color: c.faint }}>—</Text>}
                />
              );
            })}
          </>
        )}
      </View>
      <Text style={{ marginTop: 10, fontSize: 12, color: c.faint }}>
        {view === "stock" ? `${rows.length} of ${inStock.length} items` : `${catalogue.length} of your ${mine.length} ingredients`} · click a row to open it
      </Text>

      {/* Searching your ingredients: the rest of the food library's by that name */}
      {view === "ingredients" && q.length >= 2 && (libraryLoading || fromLibrary.length > 0) && (
        <>
          <Text style={{ marginTop: 22, marginBottom: 10, marginLeft: 2, fontSize: 12, fontWeight: "700", letterSpacing: 1.4, color: c.faint }}>
            {fromLibrary.length ? `MORE FROM THE FOOD LIBRARY · ${fromLibrary.length}` : "SEARCHING THE FOOD LIBRARY…"}
          </Text>
          {fromLibrary.length > 0 && (
            <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, overflow: "hidden" }}>
              <IngredientHead last="Your list" />
              {fromLibrary.map((food) => {
                const fixed = alwaysInMyIngredients(food, isAdmin);
                const saved = fixed || inMyIngredients(food);
                return (
                  <IngredientRow
                    key={food._id}
                    ingredient={food}
                    onOpen={() => router.push({ pathname: "/ingredients/edit/[id]", params: { id: food._id } })}
                    last={
                      <Pressable
                        onPress={() => void toggleSaved(food)}
                        disabled={fixed}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: saved, disabled: fixed }}
                        accessibilityLabel={saved ? `Remove ${food.name} from your ingredients` : `Add ${food.name} to your ingredients`}
                        style={hoverable(({ hovered }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: saved ? "transparent" : hovered ? c.track : c.pill }))}
                      >
                        <Ionicons name={saved ? "checkmark-circle" : "add"} size={16} color={saved ? c.ink : c.onPill} />
                        <Text style={{ fontSize: 12.5, fontWeight: "600", color: saved ? c.ink : c.onPill }}>{saved ? "Added" : "Add"}</Text>
                      </Pressable>
                    }
                  />
                );
              })}
            </View>
          )}
          {(libraryResults?.length ?? 0) >= 40 && <Text style={{ textAlign: "center", marginTop: 10, fontSize: 13, color: c.faint }}>Keep typing to narrow it down</Text>}
        </>
      )}
    </WebPage>
    </OrbitPage>
  );
}

// The ingredients tables' header: the same columns for your ingredients and
// the library's, with the last one theirs (in stock, or in your list).
function IngredientHead({ last }: { last: string }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <HeadCell label="Ingredient" flex={2.4} />
      <HeadCell label="Category" flex={1.2} />
      <HeadCell label="Portion" flex={0.9} />
      <HeadCell label="Calories" flex={0.8} />
      <HeadCell label="Protein" flex={0.7} />
      <HeadCell label="Carbs" flex={0.7} />
      <HeadCell label="Fats" flex={0.7} />
      <HeadCell label={last} flex={0.8} />
    </View>
  );
}

// An ingredient: its name and brand, category, serving and what's in it —
// and `last`, the table's own last column. Clicked: its page.
function IngredientRow({ ingredient, onOpen, last }: { ingredient: Ingredient; onOpen: () => void; last: React.ReactNode }) {
  const { colors: c, dark } = useOrbitTheme();
  const isAdmin = useAccount().account?.role === "admin";
  const n = ingredient.nutrition ?? {};
  const g = (v: number | null | undefined) => (v != null ? `${Math.round(v * 10) / 10} g` : "—");
  return (
    <Pressable
      onPress={onOpen}
      style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", minHeight: 46, borderBottomWidth: 1, borderBottomColor: c.track, backgroundColor: hovered ? c.pill : c.surface }))}
    >
      <Cell flex={2.4}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontWeight: "600", color: c.text }}>
            {ingredient.name}
          </Text>
          {/* Saved from the library rather than made (an edit makes one's own copy, untagged). */}
          {fromLibrary(ingredient, isAdmin) && (
            <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.5, ...libraryTagColors(dark), borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden" }}>
              LIBRARY
            </Text>
          )}
        </View>
        {!!nameOf(ingredient.brand) && (
          <Text numberOfLines={1} style={{ fontSize: 12, color: c.muted }}>
            {nameOf(ingredient.brand)}
          </Text>
        )}
      </Cell>
      <Cell flex={1.2} text={nameOf(ingredient.category) || "—"} />
      <Cell flex={0.9} text={`${ingredient.defaultPortionAmount ?? 1} ${ingredient.defaultPortionUnit ?? ""}`} />
      <Cell flex={0.8} text={n.calories != null ? `${Math.round(n.calories)} kcal` : "—"} strong />
      <Cell flex={0.7} text={g(n.protein)} />
      <Cell flex={0.7} text={g(n.carbs)} />
      <Cell flex={0.7} text={g(n.fats)} />
      <Cell flex={0.8}>{last}</Cell>
    </Pressable>
  );
}

function HeadCell({
  label,
  flex,
  sort,
  sortKey,
  onSort,
}: {
  label: string;
  flex: number;
  sort?: { key: SortKey; dir: 1 | -1 };
  sortKey?: SortKey;
  onSort?: (key: SortKey) => void;
}) {
  const { colors: c } = useOrbitTheme();
  const active = !!sortKey && sort?.key === sortKey;
  return (
    <Pressable
      disabled={!sortKey}
      onPress={() => sortKey && onSort?.(sortKey)}
      style={{ flex, flexDirection: "row", alignItems: "center", height: 38, paddingHorizontal: 14 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: active ? c.ink : c.muted }}>{label.toUpperCase()}</Text>
      {!!sortKey && (
        <Ionicons name={active ? (sort!.dir === 1 ? "arrow-up" : "arrow-down") : "swap-vertical"} size={11} color={active ? c.ink : c.orbit} style={{ marginLeft: 4 }} />
      )}
    </Pressable>
  );
}

function Cell({ flex, text, strong, children }: { flex: number; text?: string; strong?: boolean; children?: React.ReactNode }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ flex, paddingHorizontal: 14, paddingVertical: 6 }}>
      {children ?? (
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: strong ? "600" : "400", color: strong ? c.text : c.icon }}>
          {text}
        </Text>
      )}
    </View>
  );
}
