import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Button, Empty, PageTitle, Segmented, WEB, WebPage } from "@/src/components/web/ui";
import { getMeals, type Meal } from "@/src/services/mealApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { getRestaurantMeals, type RestaurantMeal } from "@/src/services/restaurantMealApi";
import { loadSettings } from "@/src/services/settingsService";
import { courseName, getMealKcal, getRecipeKcal } from "@/src/utils/mealPlan";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

// Recipes, meals and eating out in a desktop browser: a wall of cards to
// browse and search, rather than the phone's one-column lists. Opening one
// goes to its existing page.

type Hover = { hovered?: boolean };
type Kind = "recipes" | "meals" | "eating";

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

  useFocusEffect(
    useCallback(() => {
      getRecipes().then(setRecipes).catch(() => {});
      getMeals().then(setMeals).catch(() => {});
      getRestaurantMeals().then(setRestaurants).catch(() => {});
      loadSettings().then((s) => setConversions(s.unitConversions)).catch(() => {});
    }, []),
  );

  const q = search.trim().toLowerCase();
  const has = (...parts: (string | undefined)[]) => !q || parts.filter(Boolean).join(" ").toLowerCase().includes(q);
  const byName = <T,>(list: T[], name: (item: T) => string) => [...list].sort((a, b) => name(a).localeCompare(name(b)));

  const shownRecipes = byName(recipes.filter((r) => has(r.name, r.description, nameOf(r.recipeCategory))), (r) => r.name);
  const shownMeals = byName(meals.filter((m) => has(m.name, ...(m.courses ?? []).map(courseName))), (m) => m.name);
  const shownRestaurants = byName(restaurants.filter((r) => has(r.restaurantName, ...r.dishes.map((d) => d.name))), (r) => r.restaurantName);

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
      </View>

      {count === 0 && <Empty icon="restaurant-outline" text={q ? "Nothing matches that search" : "Nothing here yet"} />}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {kind === "recipes" &&
          shownRecipes.map((recipe) => {
            const kcal = getRecipeKcal(recipe, 1);
            const n = recipe.nutrition;
            const minutes = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
            const scores = (recipe.scores ?? []).map((s) => Number((s as { value?: number }).value)).filter((v) => Number.isFinite(v));
            const rating = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
            return (
              <Tile
                key={recipe._id}
                icon="book-outline"
                tint="#2563EB"
                title={recipe.name}
                tag={nameOf(recipe.recipeCategory) || recipe.mealCategory?.[0]}
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
  icon,
  tint,
  title,
  tag,
  kcal,
  kcalNote,
  lines,
  onPress,
}: {
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
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: `${tint}1A` }}>
          <Ionicons name={icon} size={17} color={tint} />
        </View>
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
