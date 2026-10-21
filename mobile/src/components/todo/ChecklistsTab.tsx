import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Fragment, useCallback, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Tap } from "@/src/components/ui/Tap";
import { getGroceryItems } from "@/src/services/groceryListApi";
import { createTodoList, getTodoOverview, type TodoList } from "@/src/services/todoApi";
import { sectionColor, useOrbitTheme } from "@/src/theme/orbit";

import { TextPromptModal } from "./TextPromptModal";
import { listAccent, useTodoTheme } from "./theme";

// The Checklists and Shopping tabs: both list checklists (plain tickable
// lines, no dates or status) — shopping lists on one, the rest on the
// other. The Shopping tab also leads with the Kitchen's grocery list.
// (The phone's; in Orbit's look, the Tasks section's violet.)
export function ChecklistsTab({ shopping }: { shopping: boolean }) {
  const router = useRouter();
  const theme = useTodoTheme();
  const { colors, dark } = useOrbitTheme();
  const [lists, setLists] = useState<TodoList[] | null>(null);
  const [groceryToBuy, setGroceryToBuy] = useState(0);
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getTodoOverview()
        .then((overview) =>
          setLists(
            overview.lists
              .filter((l) => l.type === "checklist" && !!l.shopping === shopping)
              .sort((a, b) => a.order - b.order),
          ),
        )
        .catch((error) => Alert.alert("Couldn’t load lists", error instanceof Error ? error.message : "Something went wrong."));
      if (shopping) {
        getGroceryItems()
          .then((items) => setGroceryToBuy(items.filter((item) => item.status === "toBuy").length))
          .catch(() => {});
      }
    }, [shopping]),
  );

  async function create(name: string) {
    setCreating(false);
    try {
      const list = await createTodoList(name, shopping ? "teal" : "green", null, "checklist", shopping);
      router.push({ pathname: "/lists/[id]", params: { id: list._id } });
    } catch (error) {
      Alert.alert("Couldn’t create list", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  const noun = shopping ? "shopping list" : "checklist";
  const card = { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: "hidden" as const };
  const tile = { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.pill, alignItems: "center" as const, justifyContent: "center" as const };
  const row = { flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 14, paddingVertical: 12, gap: 14 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      {/* The title on the page, with New beside it */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 }}>{shopping ? "Shopping" : "Checklists"}</Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: colors.muted }}>
            {shopping ? "Groceries and everything else to buy" : "Ideas, things to cook, what to pack"}
          </Text>
        </View>
        <Tap
          onPress={() => setCreating(true)}
          accessibilityLabel={`New ${noun}`}
          style={{ height: 40, flexDirection: "row", alignItems: "center", borderRadius: 14, paddingLeft: 10, paddingRight: 14, backgroundColor: colors.ink }}
        >
          <Ionicons name="add" size={20} color={colors.onInk} />
          <Text style={{ marginLeft: 4, fontSize: 15, fontWeight: "700", color: colors.onInk }}>New</Text>
        </Tap>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {shopping && (
          <>
            {/* The Kitchen's list: its icon in the Kitchen's colour */}
            <View style={card}>
              <Tap onPress={() => router.push("/grocery-list")} accessibilityRole="button" accessibilityLabel="Grocery List" style={row} pressedStyle={{ backgroundColor: colors.pill }}>
                <View style={tile}>
                  <Ionicons name="cart-outline" size={19} color={sectionColor("kitchen", dark) ?? colors.onPill} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>Grocery List</Text>
                  <Text style={{ marginTop: 2, fontSize: 13, color: colors.muted }} numberOfLines={1}>From the Kitchen — linked to your pantry</Text>
                </View>
                {groceryToBuy > 0 && <Text style={{ fontSize: 15, color: colors.faint }}>{groceryToBuy}</Text>}
                <Ionicons name="chevron-forward" size={18} color={colors.faint} />
              </Tap>
            </View>
            <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: colors.faint }}>
              MY SHOPPING LISTS
            </Text>
          </>
        )}

        {lists?.length === 0 && (
          <View style={{ alignItems: "center", borderRadius: 20, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, paddingHorizontal: 24, paddingVertical: 40 }}>
            <Ionicons name={shopping ? "bag-handle-outline" : "checkbox-outline"} size={36} color={colors.faint} />
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600", color: colors.text }}>No {noun}s yet</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, lineHeight: 20, color: colors.muted }}>
              {shopping
                ? "For non-grocery shopping: household, gifts, a list per store. Tap New to start one."
                : "For things you want to list, not track. Tap New to start one."}
            </Text>
          </View>
        )}
        {/* Your lists, one card — each icon in the list's own colour */}
        {!!lists?.length && (
          <View style={card}>
            {lists.map((list, i) => (
              <Fragment key={list._id}>
                {i > 0 && <View style={{ height: 1, marginLeft: 64, backgroundColor: colors.border }} />}
                <Tap
                  onPress={() => router.push({ pathname: "/lists/[id]", params: { id: list._id } })}
                  accessibilityRole="button"
                  accessibilityLabel={list.name}
                  style={[row, { minHeight: 60 }]}
                  pressedStyle={{ backgroundColor: colors.pill }}
                >
                  <View style={tile}>
                    <Ionicons name={shopping ? "bag-handle-outline" : "checkbox-outline"} size={19} color={listAccent(list.color, theme)} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "500", color: colors.text }} numberOfLines={1}>
                    {list.name}
                  </Text>
                  {!!list.openCount && <Text style={{ fontSize: 15, color: colors.faint }}>{list.openCount}</Text>}
                  <Ionicons name="chevron-forward" size={18} color={colors.faint} />
                </Tap>
              </Fragment>
            ))}
          </View>
        )}
      </ScrollView>

      <TextPromptModal
        visible={creating}
        title={`New ${noun}`}
        placeholder={shopping ? "e.g. Household" : "e.g. Things to cook"}
        onCancel={() => setCreating(false)}
        onSubmit={(name) => void create(name)}
      />
    </SafeAreaView>
  );
}

export default ChecklistsTab;
