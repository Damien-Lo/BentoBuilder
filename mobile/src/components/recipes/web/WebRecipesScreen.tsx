import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { RecipeThumb } from "@/src/components/recipes/RecipeThumb";
import { Button, Empty, PageTitle, Segmented, WEB, WebPage } from "@/src/components/web/ui";
import { getIngredients, type Ingredient } from "@/src/services/ingredientApi";
import { getMeals, type Meal } from "@/src/services/mealApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { getRestaurantMeals, type RestaurantMeal } from "@/src/services/restaurantMealApi";
import { loadSettings } from "@/src/services/settingsService";
import { courseName, getMealKcal, getRecipeKcal } from "@/src/utils/mealPlan";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

// Recipes, meals and eating out in a desktop browser: cards to browse and
// search, rather than the phone's one-column lists. Opening one goes to its
// existing page. The recipes are set out in groups — by category or by the
// meal they're for — each of which folds away; the ones that only make
// something for other recipes (a marinated fillet, a stock) are a group of
// their own at the end.

type Hover = { hovered?: boolean };
type Kind = "recipes" | "meals" | "eating";
type GroupBy = "category" | "meal" | "none";

const MEAL_GROUPS = ["breakfast", "lunch", "dinner", "snack"] as const;
const PREP_GROUP = "Prep";
const titled = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const nameOf = (value: unknown): string =>
  value && typeof value === "object" && "name" in value ? String((value as { name: unknown }).name ?? "") : "";

export function WebRecipesScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("recipes");
  const [search, setSearch] = useState("");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantMeal[]>([]);
  const [conversions, setConversions] = useState<CustomUnitConversion[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [folded, setFolded] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      getRecipes().then(setRecipes).catch(() => {});
      getMeals().then(setMeals).catch(() => {});
      getRestaurantMeals().then(setRestaurants).catch(() => {});
      getIngredients().then(setIngredients).catch(() => {});
      loadSettings().then((s) => setConversions(s.unitConversions)).catch(() => {});
    }, []),
  );

  const q = search.trim().toLowerCase();
  const has = (...parts: (string | undefined)[]) => !q || parts.filter(Boolean).join(" ").toLowerCase().includes(q);
  const byName = <T,>(list: T[], name: (item: T) => string) => [...list].sort((a, b) => name(a).localeCompare(name(b)));

  const shownRecipes = byName(recipes.filter((r) => has(r.name, r.description, nameOf(r.recipeCategory))), (r) => r.name);
  const shownMeals = byName(meals.filter((m) => has(m.name, ...(m.courses ?? []).map(courseName))), (m) => m.name);
  const shownRestaurants = byName(restaurants.filter((r) => has(r.restaurantName, ...r.dishes.map((d) => d.name))), (r) => r.restaurantName);

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

  const add = kind === "recipes" ? "/recipes/add" : kind === "meals" ? "/meals/add" : "/restaurant-meals/add";
  const count = kind === "recipes" ? shownRecipes.length : kind === "meals" ? shownMeals.length : shownRestaurants.length;

  return (
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

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Segmented
          options={[
            { value: "recipes", label: "Recipes" },
            { value: "meals", label: "Meals" },
            { value: "eating", label: "Eating out" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <View style={{ flexDirection: "row", alignItems: "center", height: 36, width: 320, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF" }}>
          <Ionicons name="search" size={15} color={WEB.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, ingredient course or dish"
            placeholderTextColor={WEB.faint}
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: WEB.text, outlineStyle: "none" } as object}
          />
        </View>
        <Text style={{ fontSize: 12, color: WEB.faint }}>{count} shown</Text>
        {kind === "recipes" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            {groupBy !== "none" && (
              <Pressable onPress={() => setFolded(allFolded ? [] : recipeGroups.map((group) => group.name))} accessibilityLabel={allFolded ? "Expand all groups" : "Collapse all groups"} style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}>
                <Ionicons name={allFolded ? "chevron-expand" : "chevron-collapse"} size={14} color={WEB.blue} />
                <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "600", color: WEB.blue }}>{allFolded ? "Expand all" : "Collapse all"}</Text>
              </Pressable>
            )}
            <Text style={{ fontSize: 12, color: WEB.muted }}>Group by</Text>
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

      {count === 0 && <Empty icon="restaurant-outline" text={q ? "Nothing matches that search" : "Nothing here yet"} />}

      {kind === "recipes" &&
        recipeGroups.map((group) => {
          const closed = folded.includes(group.name);
          return (
            <View key={group.name || "all"} style={{ marginBottom: 18 }}>
              {!!group.name && (
                <Pressable
                  onPress={() => setFolded((prev) => (closed ? prev.filter((n) => n !== group.name) : [...prev, group.name]))}
                  accessibilityLabel={`${closed ? "Show" : "Hide"} ${group.name}`}
                  style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 10 }}
                >
                  <Ionicons name={closed ? "chevron-forward" : "chevron-down"} size={14} color={WEB.muted} />
                  <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: WEB.body }}>{group.name}</Text>
                  <Text style={{ marginLeft: 8, fontSize: 12, color: WEB.faint }}>
                    {group.recipes.length}
                    {group.name === PREP_GROUP ? " · made ahead for other recipes" : ""}
                  </Text>
                </Pressable>
              )}
              {!closed && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                  {group.recipes.map((recipe) => {
                  const kcal = getRecipeKcal(recipe, 1);
                  const n = recipe.nutrition;
                  const minutes = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
                  const scores = (recipe.scores ?? []).map((s) => Number((s as { value?: number }).value)).filter((v) => Number.isFinite(v));
                  const rating = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                  return (
                    <Tile
                      key={recipe._id}
                      photo={recipe.imageUrl}
                      icon="book-outline"
                      tint="#2563EB"
                      title={recipe.name}
                      // (Not what its heading already says.)
                      tag={groupBy === "category" ? (recipe.mealCategory ?? []).map(titled).join(" · ") : nameOf(recipe.recipeCategory) || recipe.mealCategory?.[0]}
                      kcal={kcal}
                      kcalNote="a serving"
                      lines={[
                        n ? `P ${Math.round(n.protein ?? 0)} g · C ${Math.round(n.carbs ?? 0)} g · F ${Math.round(n.fats ?? 0)} g` : "",
                        [`${recipe.ingredientList?.length ?? 0} ingredients`, minutes ? `${minutes} min` : "", rating != null ? `rated ${rating.toFixed(1)}` : ""].filter(Boolean).join(" · "),
                      ]}
                      onPress={() => router.push({ pathname: "/recipes/[id]", params: { id: recipe._id } })}
                    />
                  );
                  })}
                </View>
              )}
            </View>
          );
        })}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {kind === "meals" &&
          shownMeals.map((meal) => (
            <Tile
              key={meal._id}
              icon="fast-food-outline"
              tint="#0D9488"
              title={meal.name}
              tag={`${meal.courses?.length ?? 0} course${meal.courses?.length === 1 ? "" : "s"}`}
              kcal={getMealKcal(meal, conversions)}
              kcalNote="the meal"
              lines={[(meal.courses ?? []).map(courseName).join(", ")]}
              onPress={() => router.push({ pathname: "/meals/[id]", params: { id: meal._id } })}
            />
          ))}

        {kind === "eating" &&
          shownRestaurants.map((restaurant) => (
            <Tile
              key={restaurant._id}
              icon="storefront-outline"
              tint="#D97706"
              title={restaurant.restaurantName}
              tag={`${restaurant.dishes.length} dish${restaurant.dishes.length === 1 ? "" : "es"}`}
              kcal={null}
              lines={restaurant.dishes.slice(0, 3).map((d) => `${d.name}${d.nutrition?.calories != null ? ` · ${Math.round(d.nutrition.calories)} kcal` : ""}`)}
              onPress={() => router.push({ pathname: "/restaurant-meals/[id]", params: { id: restaurant._id } })}
            />
          ))}
      </View>
    </WebPage>
  );
}

function Tile({
  photo,
  icon,
  tint,
  title,
  tag,
  kcal,
  kcalNote,
  lines,
  onPress,
}: {
  // A photo, shown in place of the icon.
  photo?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  tag?: string;
  kcal: number | null;
  kcalNote?: string;
  lines: string[];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: Hover) => ({
        flexGrow: 1,
        flexBasis: 270,
        maxWidth: 420,
        minHeight: 138,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: hovered ? "#93C5FD" : WEB.border,
        backgroundColor: WEB.card,
        boxShadow: hovered ? "0 6px 16px rgba(15,23,42,0.08)" : undefined,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <RecipeThumb
          imageUrl={photo}
          size={44}
          radius={10}
          fallback={
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${tint}1A` }}>
              <Ionicons name={icon} size={17} color={tint} />
            </View>
          }
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "700", lineHeight: 19, color: WEB.text }}>
            {title}
          </Text>
          {!!tag && <Text style={{ marginTop: 1, fontSize: 12, color: WEB.muted }}>{tag}</Text>}
        </View>
      </View>
      {kcal != null && (
        <Text style={{ marginTop: 12, fontSize: 13, color: WEB.muted }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: WEB.text }}>{Math.round(kcal)}</Text> kcal {kcalNote}
        </Text>
      )}
      <View style={{ marginTop: kcal != null ? 4 : 12 }}>
        {lines.filter(Boolean).map((line, i) => (
          <Text key={i} numberOfLines={1} style={{ fontSize: 12, lineHeight: 18, color: WEB.muted }}>
            {line}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}
