import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";

import { Card, CardLink, WEB } from "@/src/components/web/ui";
import type { Meal } from "@/src/services/mealApi";
import { addToMenu, menuLeft, menuName, removeFromMenu, updateMenuItem, type MenuItem } from "@/src/services/menuApi";
import type { Recipe } from "@/src/services/recipeApi";
import { getMealKcal } from "@/src/utils/mealPlan";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

type Hover = { hovered?: boolean };

// The menu beside the week plan: what you'd like to have soon, not yet on a
// day (see services/menuApi.ts). Each item "on the menu" is shopped for —
// its servings not yet placed — and can be put on a day: "Place", then a
// meal on the week ("Place here"). "Someday" keeps one for later.
export function MenuCard({
  menu,
  recipes,
  meals,
  conversions,
  placing,
  onPlace,
  onChanged,
  compact = false,
  onOpen,
  style,
}: {
  menu: MenuItem[];
  recipes: Recipe[];
  meals: Meal[];
  conversions: CustomUnitConversion[];
  // The item being placed, if any.
  placing: string | null;
  onPlace: (item: MenuItem | null) => void;
  onChanged: () => void;
  // Beside the week: only what's on the menu, to place; the rest (adding,
  // someday, taking off) is in the full card, opened over the page.
  compact?: boolean;
  onOpen?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [showSomeday, setShowSomeday] = useState(false);
  const on = menu.filter((m) => m.state === "menu");
  const someday = menu.filter((m) => m.state === "someday");
  const kcalOf = (item: MenuItem) => (item.recipe ? (item.recipe.nutrition?.calories ?? null) : item.meal ? getMealKcal(item.meal, conversions) : null);
  const left = on.reduce((n, m) => n + menuLeft(m), 0);

  const fail = (error: unknown) => Alert.alert("Couldn't change the menu", error instanceof Error ? error.message : "Something went wrong.");
  const run = (job: Promise<unknown>) => void job.then(onChanged, fail);

  // Recipes and saved meals by name, not already on the menu.
  const q = query.trim().toLowerCase();
  const already = new Set(menu.filter((m) => m.state === "menu").map((m) => m.recipe?._id ?? m.meal?._id));
  const found = q
    ? [
        ...recipes.filter((r) => !r.isArchived && !already.has(r._id) && r.name.toLowerCase().includes(q)).map((r) => ({ key: `r:${r._id}`, name: r.name, add: () => addToMenu({ recipe: r._id }) })),
        ...meals.filter((m) => !m.isArchived && !already.has(m._id) && m.name.toLowerCase().includes(q)).map((m) => ({ key: `m:${m._id}`, name: m.name, add: () => addToMenu({ meal: m._id }) })),
      ].slice(0, 8)
    : [];

  return (
    <Card
      title="Menu"
      subtitle={on.length ? `${on.length} on the menu · ${left} serving${left === 1 ? "" : "s"} to place` : "What you'd like to have soon"}
      action={compact ? <CardLink label={on.length ? "Open" : "Add"} onPress={() => onOpen?.()} /> : <CardLink label={adding ? "Done" : "Add"} onPress={() => (setAdding((a) => !a), setQuery(""))} />}
      padded={false}
      style={style}
    >
      {adding && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Find a recipe or meal…"
            placeholderTextColor={WEB.faint}
            style={{ height: 34, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: WEB.border, fontSize: 13, color: WEB.text, outlineStyle: "none" } as object}
          />
          {found.map((f) => (
            <Pressable key={f.key} onPress={() => (run(f.add()), setQuery(""))} style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 4, borderRadius: 6, backgroundColor: hovered ? WEB.page : "transparent" })}>
              <Ionicons name="add-circle-outline" size={15} color={WEB.blue} />
              <Text numberOfLines={1} style={{ marginLeft: 6, flex: 1, fontSize: 13, color: WEB.text }}>
                {f.name}
              </Text>
            </Pressable>
          ))}
          {!!q && !found.length && <Text style={{ paddingTop: 6, fontSize: 12, color: WEB.faint }}>Nothing by that name</Text>}
        </View>
      )}

      {!on.length && !adding && <Text style={{ paddingHorizontal: 18, paddingBottom: 14, fontSize: 12, color: WEB.faint }}>Add recipes you&apos;d like this week: what they need goes on the grocery list, and you put them on days when you know when.</Text>}

      {/* (Beside the week, a long menu scrolls inside the card.) */}
      <ScrollView style={{ flexShrink: 1 }}>
      {on.map((item) => {
        const active = placing === item._id;
        const kcal = kcalOf(item);
        return (
          <View key={item._id} style={{ paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderTopColor: WEB.border, backgroundColor: active ? "#F5F3FF" : "transparent" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "600", color: WEB.text }}>
                {menuName(item)}
              </Text>
              <Pressable onPress={() => onPlace(active ? null : item)} style={({ hovered }: Hover) => ({ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: active ? "#7C3AED" : hovered ? "#EDE9FE" : "#F5F3FF" })}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: active ? "#FFFFFF" : "#7C3AED" }}>{active ? "Cancel" : "Place"}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
              <Text style={{ flex: 1, fontSize: 11, color: WEB.muted }}>
                {menuLeft(item)} of {item.servings} serving{item.servings === 1 ? "" : "s"} to place{kcal != null ? ` · ${Math.round(kcal)} kcal each` : ""}
              </Text>
              {!compact && (
                <>
                  <Pressable onPress={() => run(updateMenuItem(item._id, { state: "someday" }))}>
                    <Text style={{ fontSize: 11, color: WEB.faint }}>Someday</Text>
                  </Pressable>
                  <Pressable onPress={() => run(removeFromMenu(item._id))} accessibilityLabel={`Take ${menuName(item)} off the menu`} style={{ marginLeft: 8 }}>
                    <Ionicons name="close" size={13} color={WEB.faint} />
                  </Pressable>
                </>
              )}
            </View>
            {active && <Text style={{ marginTop: 4, fontSize: 11, color: "#7C3AED" }}>Pick a meal on the week: &quot;Place here&quot;.</Text>}
          </View>
        );
      })}

      </ScrollView>
      {someday.length > 0 && !compact && (
        <View style={{ borderTopWidth: 1, borderTopColor: WEB.border }}>
          <Pressable onPress={() => setShowSomeday((s) => !s)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 8 }}>
            <Ionicons name={showSomeday ? "chevron-down" : "chevron-forward"} size={13} color={WEB.muted} />
            <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: WEB.muted }}>Someday · {someday.length}</Text>
          </Pressable>
          {showSomeday &&
            someday.map((item) => (
              <View key={item._id} style={{ flexDirection: "row", alignItems: "center", paddingLeft: 37, paddingRight: 18, paddingVertical: 5 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: WEB.text }}>
                  {menuName(item)}
                </Text>
                <Pressable onPress={() => run(addToMenu(item.recipe ? { recipe: item.recipe._id } : { meal: item.meal!._id }))}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: WEB.blue }}>On the menu</Text>
                </Pressable>
                <Pressable onPress={() => run(removeFromMenu(item._id))} accessibilityLabel={`Remove ${menuName(item)}`} style={{ marginLeft: 8 }}>
                  <Ionicons name="close" size={13} color={WEB.faint} />
                </Pressable>
              </View>
            ))}
        </View>
      )}
      <View style={{ height: 6 }} />
    </Card>
  );
}

// The full menu, over the page: adding, someday, taking off — and placing,
// which closes it so the week can be clicked.
export function MenuOverlay(props: Omit<Parameters<typeof MenuCard>[0], "compact" | "onOpen"> & { onClose: () => void }) {
  const { onClose, onPlace, ...rest } = props;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(15,23,42,0.45)" }}>
        <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 520, maxHeight: "85%" }}>
          <ScrollView>
            <MenuCard
              {...rest}
              onPlace={(item) => {
                onPlace(item);
                if (item) onClose();
              }}
            />
          </ScrollView>
          <Pressable onPress={onClose} style={{ alignSelf: "flex-end", marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: WEB.border, backgroundColor: WEB.card }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: WEB.body }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
