import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";

import { DragSource } from "@/src/components/web/dragDrop";
import { Button, Card, CardLink, hoverable } from "@/src/components/web/ui";
import type { Meal } from "@/src/services/mealApi";
import { addToMenu, menuName, removeFromMenu, updateMenuItem, type MenuItem } from "@/src/services/menuApi";
import type { Recipe } from "@/src/services/recipeApi";
import { SECTION_PALETTE, useOrbitTheme } from "@/src/theme/orbit";
import { getMealKcal } from "@/src/utils/mealPlan";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";


// The menu beside the week plan: what you'd like to have soon, not yet on a
// day (see services/menuApi.ts). Each item "on the menu" is shopped for —
// its servings not yet placed — and can be put on a day: "Place", then a
// meal on the week ("Place here"). "Someday" keeps one for later.
// (Desktop only: in Orbit's look, the item being placed in the Kitchen's
// orange.)
const TINT = SECTION_PALETTE.kitchen.tint;

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
  onDrag,
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
  // Beside the week, an item can be dragged onto a meal: when one is
  // picked up (and null when it's let go).
  onDrag?: (item: MenuItem | null) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors: c } = useOrbitTheme();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [showSomeday, setShowSomeday] = useState(false);
  const on = menu.filter((m) => m.state === "menu");
  const someday = menu.filter((m) => m.state === "someday");
  const kcalOf = (item: MenuItem) => (item.recipe ? (item.recipe.nutrition?.calories ?? null) : item.meal ? getMealKcal(item.meal, conversions) : null);

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
      // (Short, beside the link in the corner; how to place one goes under the list.)
      subtitle={on.length ? `${on.length} on the menu` : "What you'd like to have soon"}
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
            placeholderTextColor={c.faint}
            style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, fontSize: 13, color: c.text, outlineStyle: "none" } as object}
          />
          {found.map((f) => (
            <Pressable key={f.key} onPress={() => (run(f.add()), setQuery(""))} style={hoverable(({ hovered }) => ({ flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, backgroundColor: hovered ? c.pill : "transparent" }))}>
              <Ionicons name="add-circle-outline" size={15} color={c.ink} />
              <Text numberOfLines={1} style={{ marginLeft: 6, flex: 1, fontSize: 13, color: c.text }}>
                {f.name}
              </Text>
            </Pressable>
          ))}
          {!!q && !found.length && <Text style={{ paddingTop: 6, fontSize: 12, color: c.faint }}>Nothing by that name</Text>}
        </View>
      )}

      {!on.length && !adding && <Text style={{ paddingHorizontal: 18, paddingBottom: 14, fontSize: 12, lineHeight: 17, color: c.muted }}>Add recipes you&apos;d like this week: what they need goes on the grocery list, and you put them on days when you know when.</Text>}

      {!!on.length && onDrag && <Text style={{ paddingHorizontal: 18, marginTop: -4, fontSize: 12, color: c.faint }}>Drag one onto a meal</Text>}

      {/* (Beside the week, a long menu scrolls inside the card.) */}
      <ScrollView style={{ flexShrink: 1 }}>
      {on.map((item) => {
        const active = placing === item._id;
        const kcal = kcalOf(item);
        return (
          <DragSource
            key={item._id}
            payload={onDrag ? { menu: item } : null}
            onStart={() => onDrag?.(item)}
            onEnd={() => onDrag?.(null)}
            style={
              onDrag
                ? // (Beside the week: each its own card, to pick up and drag.)
                  ({ marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 12, borderColor: active ? c.selectedRing : c.border, backgroundColor: active ? TINT : c.surface, cursor: "grab" } as object)
                : { paddingHorizontal: 18, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: active ? TINT : "transparent" }
            }
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "600", color: c.text }}>
                {menuName(item)}
              </Text>
              {/* (Beside the week it's dragged onto a meal: tagged, like on the
                  grocery list. Opened, it's placed with a click.) */}
              {onDrag && !active ? (
                <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: TINT }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: c.ink }}>Menu</Text>
                </View>
              ) : (
                <Pressable onPress={() => onPlace(active ? null : item)} style={hoverable(({ hovered }) => ({ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: active ? c.ink : TINT, opacity: hovered ? 0.85 : 1 }))}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: active ? c.onInk : c.ink }}>{active ? "Cancel" : "Place"}</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
              <Text style={{ flex: 1, fontSize: 11, color: c.muted }}>
                {item.servings} serving{item.servings === 1 ? "" : "s"}{kcal != null ? ` · ${Math.round(kcal)} kcal each` : ""}
              </Text>
              {!compact && (
                <>
                  <Pressable onPress={() => run(updateMenuItem(item._id, { state: "someday" }))}>
                    <Text style={{ fontSize: 11, color: c.faint }}>Someday</Text>
                  </Pressable>
                  <Pressable onPress={() => run(removeFromMenu(item._id))} accessibilityLabel={`Take ${menuName(item)} off the menu`} style={{ marginLeft: 8 }}>
                    <Ionicons name="close" size={13} color={c.faint} />
                  </Pressable>
                </>
              )}
            </View>
            {active && <Text style={{ marginTop: 4, fontSize: 11, color: c.ink }}>Pick a meal on the week: &quot;Place here&quot;.</Text>}
          </DragSource>
        );
      })}

      </ScrollView>
      {someday.length > 0 && !compact && (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
          <Pressable onPress={() => setShowSomeday((s) => !s)} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 8 }}>
            <Ionicons name={showSomeday ? "chevron-down" : "chevron-forward"} size={13} color={c.muted} />
            <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: c.muted }}>Someday · {someday.length}</Text>
          </Pressable>
          {showSomeday &&
            someday.map((item) => (
              <View key={item._id} style={{ flexDirection: "row", alignItems: "center", paddingLeft: 37, paddingRight: 18, paddingVertical: 5 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: c.text }}>
                  {menuName(item)}
                </Text>
                <Pressable onPress={() => run(addToMenu(item.recipe ? { recipe: item.recipe._id } : { meal: item.meal!._id }))}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: c.accent }}>On the menu</Text>
                </Pressable>
                <Pressable onPress={() => run(removeFromMenu(item._id))} accessibilityLabel={`Remove ${menuName(item)}`} style={{ marginLeft: 8 }}>
                  <Ionicons name="close" size={13} color={c.faint} />
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
  const { colors: c } = useOrbitTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: c.scrim }}>
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
          <View style={{ alignSelf: "flex-end", marginTop: 10 }}>
            <Button label="Close" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
