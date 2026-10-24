import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { PlanRecipeModal } from "@/src/components/recipes/PlanRecipeModal";
import { RecipeThumb } from "@/src/components/recipes/RecipeThumb";
import { showActions } from "@/src/components/todo/theme";
import { Button, Empty, hoverable, PageTitle, Segmented, WebPage } from "@/src/components/web/ui";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMeals, type Meal } from "@/src/services/mealApi";
import { addToMenu, getMenu, removeFromMenu, type MenuItem } from "@/src/services/menuApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { addToMine, confirmRemoveFromMine, errorText, isMine, MineToggle, restaurantLine, StatusChip, useNearMe, usePublicRestaurants } from "@/src/components/restaurants/parts";
import { getMyRestaurants, type Restaurant } from "@/src/services/restaurantApi";
import { loadSettings } from "@/src/services/settingsService";
import { nutrientColor, type MainNutrient } from "@/src/theme/nutrients";
import { OrbitPage, SECTION_PALETTE, useOrbitTheme } from "@/src/theme/orbit";
import { courseName, friendlyDayLabel, getMealKcal, getRecipeKcal, SLOT_MAP } from "@/src/utils/mealPlan";
import { photoUri } from "@/src/utils/photos";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

// Recipes, meals and eating out in a desktop browser: cards to browse and
// search, rather than the phone's one-column lists. Opening one goes to its
// existing page. The recipes are set out in groups — by category or by the
// meal they're for — each of which folds away; the ones that only make
// something for other recipes (a marinated fillet, a stock) are a group of
// their own at the end. They're shown as larger photo cards by default, or
// as compact cards, many to a row (the choice is remembered in this browser).
// In Orbit's look, in the Kitchen's orange.

type IconName = keyof typeof Ionicons.glyphMap;
type Kind = "recipes" | "meals" | "eating";
type GroupBy = "category" | "meal" | "none";
type View_ = "compact" | "photos";

const VIEW_KEY = "recipes.view";
function savedView(): View_ {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === "compact" ? "compact" : "photos";
  } catch {
    return "photos";
  }
}

const MEAL_GROUPS = ["breakfast", "lunch", "dinner", "snack"] as const;
const PREP_GROUP = "Prep";
const titled = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const nameOf = (value: unknown): string =>
  value && typeof value === "object" && "name" in value ? String((value as { name: unknown }).name ?? "") : "";

export function WebRecipesScreen() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [kind, setKind] = useState<Kind>("recipes");
  const [search, setSearch] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  // Eating out: every restaurant in Orbit matching the search (or near you),
  // as well as yours.
  const nearMe = useNearMe();
  const publicRestaurants = usePublicRestaurants(search, nearMe.near, kind === "eating");
  const [addingRestaurant, setAddingRestaurant] = useState<string | null>(null);
  const [conversions, setConversions] = useState<CustomUnitConversion[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [folded, setFolded] = useState<string[]>([]);
  const [view, setViewState] = useState<View_>(savedView);
  // The grids' width, so every card is one column wide — a group of one
  // the same size as the rest.
  const [gridWidth, setGridWidth] = useState(0);
  const measureGrid = (e: { nativeEvent: { layout: { width: number } } }) => setGridWidth(e.nativeEvent.layout.width);
  const columnWidth = (basis: number, gap: number) => {
    if (!gridWidth) return null;
    const columns = Math.max(1, Math.floor((gridWidth + gap) / (basis + gap)));
    return (gridWidth - gap * (columns - 1)) / columns;
  };
  // Each card's quick actions: on the menu, or onto a day.
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [planning, setPlanning] = useState<Recipe | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const loadMenu = useCallback(() => {
    getMenu().then(setMenu).catch(() => {});
  }, []);
  const onMenu = (recipe: Recipe) => menu.find((item) => item.state === "menu" && item.recipe?._id === recipe._id);
  function menuPressed(recipe: Recipe) {
    const item = onMenu(recipe);
    if (!item) {
      addToMenu({ recipe: recipe._id }).then(loadMenu, (err) => Alert.alert("Couldn't add it to the menu", err instanceof Error ? err.message : "Something went wrong."));
      return;
    }
    showActions(`${recipe.name} is on your menu`, [{ label: "Take it off the menu", destructive: true, onPress: () => void removeFromMenu(item._id).then(loadMenu, () => {}) }]);
  }
  const actionsFor = (recipe: Recipe) => <CardActions onMenu={!!onMenu(recipe)} onMenuPress={() => menuPressed(recipe)} onPlanPress={() => setPlanning(recipe)} />;
  const setView = (next: View_) => {
    setViewState(next);
    try {
      globalThis.localStorage?.setItem(VIEW_KEY, next);
    } catch {
      // (Not remembered, but still shown.)
    }
  };

  useFocusEffect(
    useCallback(() => {
      getRecipes().then(setRecipes).catch(() => {});
      getMeals().then(setMeals).catch(() => {});
      getMyRestaurants().then(setRestaurants).catch(() => {});
      getIngredients().then(setIngredients).catch(() => {});
      loadSettings().then((s) => setConversions(s.unitConversions)).catch(() => {});
      loadMenu();
    }, [loadMenu]),
  );

  const q = search.trim().toLowerCase();
  const has = (...parts: (string | undefined)[]) => !q || parts.filter(Boolean).join(" ").toLowerCase().includes(q);
  const byName = <T,>(list: T[], name: (item: T) => string) => [...list].sort((a, b) => name(a).localeCompare(name(b)));

  const shownRecipes = byName(recipes.filter((r) => has(r.name, r.description, nameOf(r.recipeCategory))), (r) => r.name);
  const shownMeals = byName(meals.filter((m) => has(m.name, ...(m.courses ?? []).map(courseName))), (m) => m.name);
  const myRestaurantIds = new Set(restaurants.map((r) => r._id));
  const shownRestaurants = nearMe.near ? [] : byName(restaurants.filter((r) => has(r.name, r.chainName ?? "", r.cuisine)), (r) => r.name);
  const otherRestaurants = publicRestaurants.found.filter((r) => nearMe.near || !myRestaurantIds.has(r._id));
  function addRestaurant(restaurant: Restaurant) {
    setAddingRestaurant(restaurant._id);
    addToMine(restaurant)
      .then((added) => setRestaurants((prev) => (prev.some((r) => r._id === added._id) ? prev : [...prev, added])))
      .catch((err) => Alert.alert("Couldn't add it", errorText(err)))
      .finally(() => setAddingRestaurant(null));
  }
  const restaurantTile = (restaurant: Restaurant, searched: boolean) => (
    <Tile
      key={restaurant._id}
      icon="storefront-outline"
      title={restaurant.name}
      tag={restaurantLine(restaurant, searched)}
      kcal={null}
      lines={[restaurant.address ?? ""]}
      badge={<StatusChip status={restaurant.status} style={{ marginTop: 4 }} />}
      onPress={() => router.push({ pathname: "/restaurants/[id]", params: { id: restaurant._id } })}
      actions={
        searched && !isMine(restaurant, myRestaurantIds) ? (
          <MineToggle mine={false} onAdd={() => addRestaurant(restaurant)} busy={addingRestaurant === restaurant._id} />
        ) : (
          // (No swiping with a mouse: taking it out of your list is a button.)
          <Pressable
            onPress={() => confirmRemoveFromMine(restaurant, () => setRestaurants((prev) => prev.filter((r) => r._id !== restaurant._id)))}
            accessibilityLabel={`Take ${restaurant.name} out of your list`}
            style={hoverable(({ hovered }) => ({ width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? c.pill : "transparent" }))}
          >
            <Ionicons name="remove-circle-outline" size={17} color={c.faint} />
          </Pressable>
        )
      }
    />
  );

  // The recipes in their groups, in the order shown.
  const idOf = (value: unknown) => (typeof value === "string" ? value : ((value as { _id?: string } | null)?._id ?? ""));
  const prep = new Set(ingredients.filter((i) => !i.isMealPrep && idOf(i.productionRecipe)).map((i) => idOf(i.productionRecipe)));
  const recipeGroups: { name: string; recipes: Recipe[] }[] = (() => {
    if (groupBy === "none") return [{ name: "", recipes: shownRecipes }];
    const served = shownRecipes.filter((r) => !prep.has(r._id));
    const made = shownRecipes.filter((r) => prep.has(r._id));
    const groups =
      groupBy === "meal"
        ? [
            ...MEAL_GROUPS.map((meal) => ({ name: titled(meal), recipes: served.filter((r) => r.mealCategory?.includes(meal)) })),
            { name: "Any meal", recipes: served.filter((r) => !r.mealCategory?.some((m) => (MEAL_GROUPS as readonly string[]).includes(m))) },
          ]
        : [...new Set(served.map((r) => nameOf(r.recipeCategory)))]
            .sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1))
            .map((category) => ({ name: category || "No category", recipes: served.filter((r) => nameOf(r.recipeCategory) === category) }));
    return [...groups, { name: PREP_GROUP, recipes: made }].filter((group) => group.recipes.length);
  })();

  const allFolded = recipeGroups.length > 0 && recipeGroups.every((group) => folded.includes(group.name));

  const add = kind === "recipes" ? "/recipes/add" : kind === "meals" ? "/meals/add" : "/restaurants/add";
  const count = kind === "recipes" ? shownRecipes.length : kind === "meals" ? shownMeals.length : shownRestaurants.length + otherRestaurants.length;


  return (
    <OrbitPage>
      <WebPage>
        <PageTitle
          title="Recipes & meals"
          subtitle={`${recipes.length} recipes · ${meals.length} meals · ${restaurants.length} places to eat out`}
          right={
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="Archive" icon="archive-outline" onPress={() => router.push("/archive")} />
              <Button
                label={kind === "recipes" ? "New recipe" : kind === "meals" ? "New meal" : "New restaurant"}
                icon="add"
                kind="primary"
                onPress={() => router.push(add)}
              />
            </View>
          }
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Segmented
            options={[
              { value: "recipes", label: "Recipes" },
              { value: "meals", label: "Meals" },
              { value: "eating", label: "Eating out" },
            ]}
            value={kind}
            onChange={setKind}
          />
          <View style={{ flexDirection: "row", alignItems: "center", height: 36, width: 340, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <Ionicons name="search-outline" size={16} color={c.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, ingredient course or dish"
              placeholderTextColor={c.faint}
              style={{ flex: 1, marginLeft: 8, fontSize: 14, color: c.text, outlineStyle: "none" } as object}
            />
          </View>
          {kind === "eating" && nearMe.available && (
            <Pressable
              onPress={nearMe.toggle}
              disabled={nearMe.locating}
              accessibilityState={{ selected: !!nearMe.near }}
              style={hoverable(({ hovered }) => ({ height: 36, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: nearMe.near ? c.ink : hovered ? c.selectedRing : c.border, backgroundColor: nearMe.near ? c.ink : c.surface }))}
            >
              <Ionicons name="navigate" size={14} color={nearMe.near ? c.onInk : c.ink} />
              <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: nearMe.near ? c.onInk : c.text }}>{nearMe.locating ? "Finding you…" : "Near me"}</Text>
            </Pressable>
          )}
          <Text style={{ fontSize: 12, color: c.faint }}>{count} shown</Text>
          {kind === "eating" && (
            <Pressable onPress={() => router.push("/restaurants")} style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", marginLeft: "auto", opacity: hovered ? 0.7 : 1 }))}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: c.accent }}>All restaurants</Text>
              <Ionicons name="chevron-forward" size={13} color={c.accent} style={{ marginLeft: 2 }} />
            </Pressable>
          )}
          {kind === "recipes" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {groupBy !== "none" && (
                <Pressable
                  onPress={() => setFolded(allFolded ? [] : recipeGroups.map((group) => group.name))}
                  accessibilityLabel={allFolded ? "Expand all groups" : "Collapse all groups"}
                  style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", marginRight: 8, opacity: hovered ? 0.7 : 1 }))}
                >
                  <Ionicons name={allFolded ? "chevron-expand" : "chevron-collapse"} size={14} color={c.accent} />
                  <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "600", color: c.accent }}>{allFolded ? "Expand all" : "Collapse all"}</Text>
                </Pressable>
              )}
              <Text style={{ fontSize: 12, color: c.muted }}>View</Text>
              <Segmented
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "photos", label: "Photos" },
                ]}
                value={view}
                onChange={setView}
              />
              <Text style={{ marginLeft: 6, fontSize: 12, color: c.muted }}>Group by</Text>
              <Segmented
                options={[
                  { value: "category", label: "Category" },
                  { value: "meal", label: "Meal" },
                  { value: "none", label: "None" },
                ]}
                value={groupBy}
                onChange={setGroupBy}
              />
            </View>
          )}
        </View>

        {!!planNotice && (
          <Pressable
            onPress={() => router.navigate("/planner")}
            style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", marginBottom: 16, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: hovered ? c.selectedRing : c.border, backgroundColor: c.surface }))}
          >
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.kitchen.tint }}>
              <Ionicons name="checkmark" size={15} color={c.ink} />
            </View>
            <Text style={{ flex: 1, marginLeft: 10, fontSize: 13, color: c.text }}>{planNotice}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.accent }}>Open week plan</Text>
            <Ionicons name="chevron-forward" size={13} color={c.accent} style={{ marginLeft: 2 }} />
          </Pressable>
        )}

        {count === 0 && <Empty icon="restaurant-outline" text={q ? "Nothing matches that search" : "Nothing here yet"} />}

        {kind === "recipes" &&
          recipeGroups.map((group) => {
            const closed = folded.includes(group.name);
            return (
              <View key={group.name || "all"} style={{ marginBottom: 22 }}>
                {!!group.name && (
                  <Pressable
                    onPress={() => setFolded((prev) => (closed ? prev.filter((n) => n !== group.name) : [...prev, group.name]))}
                    accessibilityLabel={`${closed ? "Show" : "Hide"} ${group.name}`}
                    style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 10, marginLeft: -6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: hovered ? c.pill : "transparent" }))}
                  >
                    <Ionicons name={closed ? "chevron-forward" : "chevron-down"} size={14} color={c.faint} />
                    <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: c.muted }}>{group.name}</Text>
                    <Text style={{ marginLeft: 8, fontSize: 12, color: c.faint }}>
                      {group.recipes.length}
                      {group.name === PREP_GROUP ? " · made ahead for other recipes" : ""}
                    </Text>
                  </Pressable>
                )}
                {!closed && (
                  <TileWidth.Provider value={view === "photos" ? columnWidth(250, 18) : columnWidth(270, 14)}>
                  <View onLayout={measureGrid} style={{ flexDirection: "row", flexWrap: "wrap", gap: view === "photos" ? 18 : 14 }}>
                    {group.recipes.map((recipe) => {
                      const kcal = getRecipeKcal(recipe, 1);
                      const n = recipe.nutrition;
                      const minutes = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
                      const scores = (recipe.scores ?? []).map((s) => Number((s as { value?: number }).value)).filter((v) => Number.isFinite(v));
                      const rating = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                      const tag = groupBy === "category" ? (recipe.mealCategory ?? []).map(titled).join(" · ") : nameOf(recipe.recipeCategory) || recipe.mealCategory?.[0];
                      const macros = n ? { protein: n.protein ?? 0, carbs: n.carbs ?? 0, fats: n.fats ?? 0 } : null;
                      const facts = [minutes ? `${minutes} min` : "", rating != null ? `rated ${rating.toFixed(1)}` : ""].filter(Boolean).join(" · ");
                      const open = () => router.push({ pathname: "/recipes/[id]", params: { id: recipe._id } });
                      if (view === "photos") return <PhotoTile key={recipe._id} photo={recipe.imageUrl} title={recipe.name} tag={tag} kcal={kcal} macros={macros} facts={facts} onPress={open} actions={actionsFor(recipe)} />;
                      return (
                        <Tile
                          key={recipe._id}
                          photo={recipe.imageUrl}
                          icon="book-outline"
                          title={recipe.name}
                          // (Not what its heading already says.)
                          tag={tag}
                          kcal={kcal}
                          kcalNote="a serving"
                          macros={macros}
                          lines={[[`${recipe.ingredientList?.length ?? 0} ingredients`, facts].filter(Boolean).join(" · ")]}
                          onPress={open}
                          actions={actionsFor(recipe)}
                        />
                      );
                    })}
                  </View>
                  </TileWidth.Provider>
                )}
              </View>
            );
          })}

        <TileWidth.Provider value={columnWidth(270, 14)}>
        <View onLayout={measureGrid} style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {kind === "meals" &&
            shownMeals.map((meal) => (
              <Tile
                key={meal._id}
                icon="restaurant-outline"
                title={meal.name}
                tag={`${meal.courses?.length ?? 0} course${meal.courses?.length === 1 ? "" : "s"}`}
                kcal={getMealKcal(meal, conversions)}
                kcalNote="the meal"
                lines={[(meal.courses ?? []).map(courseName).join(", ")]}
                onPress={() => router.push({ pathname: "/meals/[id]", params: { id: meal._id } })}
              />
            ))}

          {kind === "eating" && shownRestaurants.map((restaurant) => restaurantTile(restaurant, false))}
        </View>
        </TileWidth.Provider>

        {/* Every other restaurant in Orbit that matches (or the nearest) */}
        {kind === "eating" && (otherRestaurants.length > 0 || publicRestaurants.searching) && (
          <View style={{ marginTop: 22 }}>
            <Text style={{ marginBottom: 10, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: c.muted }}>
              {nearMe.near && !q ? "Near you" : "In Orbit"}
              <Text style={{ fontWeight: "500", letterSpacing: 0, textTransform: "none", color: c.faint }}>{publicRestaurants.searching ? "  searching…" : `  ${otherRestaurants.length}`}</Text>
            </Text>
            <TileWidth.Provider value={columnWidth(270, 14)}>
              <View onLayout={measureGrid} style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {otherRestaurants.map((restaurant) => restaurantTile(restaurant, true))}
              </View>
            </TileWidth.Provider>
          </View>
        )}

        {planning && (
          <PlanRecipeModal
            recipeId={planning._id}
            recipeName={planning.name}
            nutrition={planning.nutrition}
            visible
            onClose={() => setPlanning(null)}
            onPlanned={(date, slot) => {
              const day = friendlyDayLabel(date);
              setPlanNotice(`${planning.name} planned for ${day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day}, ${SLOT_MAP[slot].label.toLowerCase()}`);
              setTimeout(() => setPlanNotice(null), 6000);
            }}
          />
        )}
      </WebPage>
    </OrbitPage>
  );
}

// Calories, with the colour calories always have.
function Kcal({ kcal, note, top }: { kcal: number; note: string; top: number }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ marginTop: top, flexDirection: "row", alignItems: "baseline" }}>
      <Text style={{ fontSize: 18, fontWeight: "800", letterSpacing: -0.3, color: c.text }}>{Math.round(kcal)}</Text>
      <Text style={{ marginLeft: 4, fontSize: 13, fontWeight: "600", color: nutrientColor("calories", false) }}>kcal</Text>
      <Text style={{ marginLeft: 4, fontSize: 13, color: c.muted }}>{note}</Text>
    </View>
  );
}

// Protein, carbs and fats a serving, each by its own colour's dot.
type Macros = { protein: number; carbs: number; fats: number };
function MacroLine({ macros, right }: { macros: Macros; right: number }) {
  const { colors: c } = useOrbitTheme();
  const items: [MainNutrient, string, number][] = [
    ["protein", "P", macros.protein],
    ["carbs", "C", macros.carbs],
    ["fats", "F", macros.fats],
  ];
  return (
    <View style={{ marginTop: 4, marginRight: right, flexDirection: "row", alignItems: "center", gap: 10 }}>
      {items.map(([key, letter, grams]) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: nutrientColor(key, false) }} />
          <Text style={{ marginLeft: 4, fontSize: 12, color: c.muted }}>
            {letter} {Math.round(grams)} g
          </Text>
        </View>
      ))}
    </View>
  );
}

// A recipe card's quick actions, at its bottom right: on the menu (ticked
// when it is, in the Kitchen's colour) and plan on a day.
function CardActions({ onMenu, onMenuPress, onPlanPress }: { onMenu: boolean; onMenuPress: () => void; onPlanPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  const button = (hovered: boolean | undefined, filled: boolean) => ({
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: filled ? c.ink : hovered ? c.selectedRing : SECTION_PALETTE.kitchen.tint,
    opacity: filled && hovered ? 0.88 : 1,
  });
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <Pressable onPress={onMenuPress} accessibilityLabel={onMenu ? "On your menu" : "Add to menu"} style={hoverable(({ hovered }) => button(hovered, onMenu))}>
        <Ionicons name={onMenu ? "checkmark" : "restaurant-outline"} size={15} color={onMenu ? c.onInk : c.ink} />
      </Pressable>
      <Pressable onPress={onPlanPress} accessibilityLabel="Plan on a day" style={hoverable(({ hovered }) => button(hovered, false))}>
        <Ionicons name="calendar-outline" size={15} color={c.ink} />
      </Pressable>
    </View>
  );
}

// One column's width in the grid the card is in (null until it's measured).
const TileWidth = createContext<number | null>(null);

function Tile({
  photo,
  icon,
  title,
  tag,
  kcal,
  kcalNote = "",
  macros,
  lines,
  onPress,
  actions,
  badge,
}: {
  // A photo, shown in place of the icon.
  photo?: string;
  icon: IconName;
  title: string;
  tag?: string;
  kcal: number | null;
  kcalNote?: string;
  macros?: Macros | null;
  lines: string[];
  onPress: () => void;
  // Quick actions, at the bottom right.
  actions?: ReactNode;
  // Under the title (a restaurant still waiting for review).
  badge?: ReactNode;
}) {
  const { colors: c } = useOrbitTheme();
  const width = useContext(TileWidth);
  const shown = lines.filter(Boolean);
  return (
    <Pressable
      onPress={onPress}
      style={hoverable(({ hovered }) => ({
        ...(width ? { width } : { flexGrow: 1, flexBasis: 270, maxWidth: 420 }),
        minHeight: 138,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: hovered ? c.selectedRing : c.border,
        backgroundColor: c.surface,
      }))}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <RecipeThumb
          imageUrl={photo}
          size={44}
          radius={12}
          fallback={
            <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.kitchen.tint }}>
              <Ionicons name={icon} size={19} color={c.ink} />
            </View>
          }
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "700", lineHeight: 19, color: c.text }}>
            {title}
          </Text>
          {!!tag && <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{tag}</Text>}
          {badge}
        </View>
      </View>
      {kcal != null && <Kcal kcal={kcal} note={kcalNote} top={12} />}
      {!!macros && <MacroLine macros={macros} right={actions && !shown.length ? 72 : 0} />}
      <View style={{ marginTop: kcal != null || macros ? 4 : 12 }}>
        {shown.map((line, i) => (
          <Text key={i} numberOfLines={1} style={{ fontSize: 12, lineHeight: 18, color: c.muted, marginRight: actions && i === shown.length - 1 ? 72 : 0 }}>
            {line}
          </Text>
        ))}
      </View>
      {actions && <View style={{ position: "absolute", right: 12, bottom: 12 }}>{actions}</View>}
    </Pressable>
  );
}

// A recipe as a larger card: its photo across the top (or, without one, a
// plain panel with the recipe icon), then the name, meals, calories and
// macros underneath.
function PhotoTile({ photo, title, tag, kcal, macros, facts, onPress, actions }: { photo?: string; title: string; tag?: string; kcal: number | null; macros: Macros | null; facts: string; onPress: () => void; actions?: ReactNode }) {
  const { colors: c } = useOrbitTheme();
  const width = useContext(TileWidth);
  const uri = photoUri(photo);
  return (
    <Pressable
      onPress={onPress}
      style={hoverable(({ hovered }) => ({
        ...(width ? { width } : { flexGrow: 1, flexBasis: 250, maxWidth: 340 }),
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: hovered ? c.selectedRing : c.border,
        backgroundColor: c.surface,
      }))}
    >
      <View style={{ width: "100%", aspectRatio: 4 / 3, backgroundColor: c.pill }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={120} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.kitchen.tint }}>
              <Ionicons name="book-outline" size={26} color={c.ink} />
            </View>
            <Text style={{ marginTop: 8, fontSize: 12, color: c.faint }}>No photo yet</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 14 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "700", lineHeight: 19, color: c.text }}>
          {title}
        </Text>
        {!!tag && <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{tag}</Text>}
        {kcal != null && <Kcal kcal={kcal} note="a serving" top={10} />}
        {!!macros && <MacroLine macros={macros} right={actions ? 72 : 0} />}
        {!!facts && <Text style={{ marginTop: 3, fontSize: 12, color: c.faint, marginRight: actions ? 72 : 0 }}>{facts}</Text>}
        {actions && <View style={{ position: "absolute", right: 12, bottom: 12 }}>{actions}</View>}
      </View>
    </Pressable>
  );
}
