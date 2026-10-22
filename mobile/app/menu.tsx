import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View, type DimensionValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PlanSubPage } from "@/src/components/planner/web/PlanFrame";
import { Tap } from "@/src/components/ui/Tap";
import { Button, Card, CardLink, hoverable } from "@/src/components/web/ui";
import { getMeals, type Meal } from "@/src/services/mealApi";
import { addToMenu, getMenu, menuName, removeFromMenu, updateMenuItem, type MenuItem } from "@/src/services/menuApi";
import { getRecipes, type Recipe } from "@/src/services/recipeApi";
import { OrbitSection, SECTION_PALETTE, useOrbitTheme } from "@/src/theme/orbit";
import { getMealKcal, getRecipeKcal } from "@/src/utils/mealPlan";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The menu on the phone (Kitchen → Plan → Menu): what you'd like to have
// soon, not yet on a day (see services/menuApi.ts). Added here; put on a day
// from Log's Add, where it's at the top. In Orbit's look, light or dark.
export default function MenuScreen() {
  return (
    <OrbitSection section="kitchen">
      <MenuPage />
    </OrbitSection>
  );
}

function MenuPage() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [query, setQuery] = useState("");
  const [showSomeday, setShowSomeday] = useState(false);

  const reload = useCallback(() => {
    getMenu().then(setMenu).catch(() => setMenu([]));
  }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      getRecipes().then(setRecipes).catch(() => {});
      getMeals().then(setMeals).catch(() => {});
    }, [reload]),
  );

  const fail = (error: unknown) => Alert.alert("Couldn't change the menu", error instanceof Error ? error.message : "Something went wrong.");
  const run = (job: Promise<unknown>) => void job.then(reload, fail);

  const on = (menu ?? []).filter((m) => m.state === "menu");
  const someday = (menu ?? []).filter((m) => m.state === "someday");
  const kcalOf = (item: MenuItem) => (item.recipe ? getRecipeKcal(item.recipe, 1) : item.meal ? getMealKcal(item.meal) : null);

  // Recipes and saved meals by name, not already on the menu.
  const q = query.trim().toLowerCase();
  const already = new Set(on.map((m) => m.recipe?._id ?? m.meal?._id));
  const found = q
    ? [
        ...recipes.filter((r) => !r.isArchived && !already.has(r._id) && r.name.toLowerCase().includes(q)).map((r) => ({ key: `r:${r._id}`, name: r.name, kind: "Recipe", add: () => addToMenu({ recipe: r._id }) })),
        ...meals.filter((m) => !m.isArchived && !already.has(m._id) && m.name.toLowerCase().includes(q)).map((m) => ({ key: `m:${m._id}`, name: m.name, kind: "Meal", add: () => addToMenu({ meal: m._id }) })),
      ].slice(0, 12)
    : [];

  const card = { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: "hidden" as const };
  const line = (i: number) => (i ? { borderTopWidth: 1, borderTopColor: c.border } : null);

  // In a desktop browser: the same menu with room (see below).
  const wide = useWideWeb();
  if (wide) {
    return (
      <PlanSubPage title="Menu" subtitle={on.length ? `${on.length} on the menu` : "What you'd like to have soon"} right={<Button label="Week plan" icon="calendar-outline" onPress={() => router.push("/planner")} />}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
          {/* What's on the menu, as tiles */}
          <View style={{ flex: 2, minWidth: 420 }}>
            {menu && !on.length && (
              <View style={{ alignItems: "center", borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.orbit, paddingHorizontal: 24, paddingVertical: 48 }}>
                <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.kitchen.tint }}>
                  <Ionicons name="reader-outline" size={26} color={c.ink} />
                </View>
                <Text style={{ marginTop: 14, fontSize: 16, fontWeight: "700", color: c.text }}>Nothing on the menu yet</Text>
                <Text style={{ marginTop: 4, maxWidth: 440, textAlign: "center", fontSize: 13.5, lineHeight: 19, color: c.muted }}>Add recipes you&apos;d like this week: what they need goes on the grocery list, and you put them on days when you know when.</Text>
              </View>
            )}
            {on.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {on.map((item) => {
                  const kcal = kcalOf(item);
                  return (
                    <View key={item._id} style={{ width: "calc((100% - 12px) / 2)" as DimensionValue, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.kitchen.tint }}>
                          <Ionicons name={item.recipe ? "restaurant-outline" : "fast-food-outline"} size={19} color={c.ink} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "700", color: c.text }}>
                            {menuName(item)}
                          </Text>
                          <Text style={{ marginTop: 2, fontSize: 12.5, color: c.muted }}>
                            {item.recipe ? "Recipe" : "Meal"} · {item.servings} serving{item.servings === 1 ? "" : "s"}
                            {kcal != null ? ` · ${Math.round(kcal)} kcal each` : ""}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => run(removeFromMenu(item._id))}
                          accessibilityLabel={`Take ${menuName(item)} off the menu`}
                          style={hoverable(({ hovered }) => ({ width: 28, height: 28, marginTop: -4, marginRight: -6, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? c.pill : "transparent" }))}
                        >
                          <Ionicons name="close" size={17} color={c.faint} />
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: "row", marginTop: 12 }}>
                        <Pressable
                          onPress={() => run(updateMenuItem(item._id, { state: "someday" }))}
                          style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: hovered ? c.track : c.pill }))}
                        >
                          <Ionicons name="time-outline" size={13} color={c.onPill} />
                          <Text style={{ fontSize: 12, fontWeight: "600", color: c.onPill }}>Someday</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {on.length > 0 && (
              <Text style={{ marginTop: 14, paddingHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: c.faint }}>
                To put one on a day, drag it from the menu beside the week in Log onto a meal. Once it&apos;s on a day, it moves to Someday.
              </Text>
            )}
          </View>

          {/* Adding to it, and what's kept for someday */}
          <View style={{ flex: 1, minWidth: 300, maxWidth: 420, gap: 16 }}>
            <Card title="Add to the menu" subtitle="A recipe or a saved meal" padded={false}>
              <View style={{ paddingHorizontal: 18, paddingBottom: q ? 6 : 16 }}>
                <View style={{ height: 42, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
                  <Ionicons name="search" size={16} color={c.muted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Find a recipe or meal…"
                    placeholderTextColor={c.faint}
                    style={{ flex: 1, marginLeft: 8, fontSize: 14, color: c.text, outlineStyle: "none" } as object}
                  />
                  {query.length > 0 && (
                    <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear">
                      <Ionicons name="close-circle" size={17} color={c.faint} />
                    </Pressable>
                  )}
                </View>
              </View>
              {!!q && (
                <View style={{ paddingBottom: 8 }}>
                  {found.map((f) => (
                    <Pressable
                      key={f.key}
                      onPress={() => (run(f.add()), setQuery(""))}
                      style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 9, backgroundColor: hovered ? c.pill : "transparent" }))}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={c.ink} />
                      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 14, color: c.text }}>
                        {f.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: c.faint }}>{f.kind}</Text>
                    </Pressable>
                  ))}
                  {!found.length && <Text style={{ paddingHorizontal: 18, paddingVertical: 8, fontSize: 13, color: c.faint }}>Nothing by that name</Text>}
                </View>
              )}
            </Card>

            {someday.length > 0 && (
              <Card title={`Someday · ${someday.length}`} subtitle="Kept for later" action={<CardLink label={showSomeday ? "Hide" : "Show"} onPress={() => setShowSomeday((s) => !s)} />} padded={false}>
                {showSomeday ? (
                  <View style={{ paddingBottom: 8 }}>
                    {someday.map((item) => (
                      <View key={item._id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 8 }}>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.text }}>
                          {menuName(item)}
                        </Text>
                        <Pressable onPress={() => run(addToMenu(item.recipe ? { recipe: item.recipe._id } : { meal: item.meal!._id }))} style={hoverable(({ hovered }) => ({ opacity: hovered ? 0.7 : 1 }))}>
                          <Text style={{ fontSize: 12.5, fontWeight: "600", color: c.accent }}>On the menu</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => run(removeFromMenu(item._id))}
                          accessibilityLabel={`Remove ${menuName(item)}`}
                          style={hoverable(({ hovered }) => ({ width: 26, height: 26, marginLeft: 8, marginRight: -6, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? c.pill : "transparent" }))}
                        >
                          <Ionicons name="close" size={15} color={c.faint} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ height: 6 }} />
                )}
              </Card>
            )}
          </View>
        </View>
      </PlanSubPage>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {/* The way back over a large title, on the page itself; then the box to add with */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
          <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace("/plan"))} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Tap>
        </View>
        <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Menu</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>{on.length ? `${on.length} on the menu` : "What you'd like to have soon"}</Text>
        <View style={{ marginTop: 14, height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
          <Ionicons name="add" size={20} color={c.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Add a recipe or meal…" placeholderTextColor={c.faint} style={{ flex: 1, marginLeft: 10, fontSize: 16, color: c.text }} />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear">
              <Ionicons name="close-circle" size={18} color={c.faint} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {!!q && (
          <View style={[card, { marginBottom: 16 }]}>
            {found.map((f, i) => (
              <Tap key={f.key} onPress={() => (run(f.add()), setQuery(""))} style={[{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 }, line(i)]} pressedStyle={{ backgroundColor: c.pill }}>
                <Ionicons name="add-circle-outline" size={20} color={c.accent} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 12, fontSize: 15, color: c.text }}>
                  {f.name}
                </Text>
                <Text style={{ fontSize: 12, color: c.faint }}>{f.kind}</Text>
              </Tap>
            ))}
            {!found.length && <Text style={{ paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: c.faint }}>Nothing by that name</Text>}
          </View>
        )}

        {menu && !on.length && !q && (
          <View style={{ alignItems: "center", borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.border, paddingHorizontal: 24, paddingVertical: 40 }}>
            <Ionicons name="reader-outline" size={36} color={c.faint} />
            <Text style={{ marginTop: 12, textAlign: "center", fontSize: 14, lineHeight: 20, color: c.muted }}>Add recipes you&apos;d like this week: what they need goes on the grocery list, and you put them on days when you know when.</Text>
          </View>
        )}

        {on.length > 0 && (
          <View style={card}>
            {on.map((item, i) => {
              const kcal = kcalOf(item);
              return (
                <View key={item._id} style={[{ paddingHorizontal: 16, paddingVertical: 12 }, line(i)]}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.text }}>
                      {menuName(item)}
                    </Text>
                    <Pressable onPress={() => run(removeFromMenu(item._id))} hitSlop={10} accessibilityLabel={`Take ${menuName(item)} off the menu`}>
                      <Ionicons name="close" size={18} color={c.faint} />
                    </Pressable>
                  </View>
                  <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ flex: 1, fontSize: 12, color: c.muted }}>
                      {item.servings} serving{item.servings === 1 ? "" : "s"}{kcal != null ? ` · ${Math.round(kcal)} kcal each` : ""}
                    </Text>
                    <Tap onPress={() => run(updateMenuItem(item._id, { state: "someday" }))} hitSlop={8} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: c.pill }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: c.onPill }}>Someday</Text>
                    </Tap>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {on.length > 0 && <Text style={{ marginTop: 12, paddingHorizontal: 4, fontSize: 12, lineHeight: 17, color: c.faint }}>To put one on a day, tap Add on a meal in Log: the menu&apos;s at the top. Once it&apos;s on a day, it moves to Someday.</Text>}

        {someday.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Pressable onPress={() => setShowSomeday((s) => !s)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 8 }}>
              <Ionicons name={showSomeday ? "chevron-down" : "chevron-forward"} size={16} color={c.muted} />
              <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: c.muted }}>Someday · {someday.length}</Text>
            </Pressable>
            {showSomeday && (
              <View style={card}>
                {someday.map((item, i) => (
                  <View key={item._id} style={[{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 }, line(i)]}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.text }}>
                      {menuName(item)}
                    </Text>
                    <Pressable onPress={() => run(addToMenu(item.recipe ? { recipe: item.recipe._id } : { meal: item.meal!._id }))} hitSlop={8}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: c.accent }}>On the menu</Text>
                    </Pressable>
                    <Pressable onPress={() => run(removeFromMenu(item._id))} hitSlop={10} style={{ marginLeft: 12 }} accessibilityLabel={`Remove ${menuName(item)}`}>
                      <Ionicons name="close" size={16} color={c.faint} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
