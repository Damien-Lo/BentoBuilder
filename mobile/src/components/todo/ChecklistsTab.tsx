import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getGroceryItems } from "@/src/services/groceryListApi";
import { createTodoList, getTodoOverview, type TodoList } from "@/src/services/todoApi";

import { TextPromptModal } from "./TextPromptModal";
import { listAccent, useTodoTheme } from "./theme";

// The Checklists and Shopping tabs: both list checklists (plain tickable
// lines, no dates or status) — shopping lists on one, the rest on the
// other. The Shopping tab also leads with the Kitchen's grocery list.
export function ChecklistsTab({ shopping }: { shopping: boolean }) {
  const router = useRouter();
  const theme = useTodoTheme();
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
        .catch((error) => Alert.alert("Couldn\u2019t load lists", error instanceof Error ? error.message : "Something went wrong."));
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
      Alert.alert("Couldn\u2019t create list", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  const noun = shopping ? "shopping list" : "checklist";

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-5 py-3">
        <View className="flex-1">
          <Text className="text-3xl font-bold text-slate-950">{shopping ? "Shopping" : "Checklists"}</Text>
          <Text className="mt-0.5 text-sm text-slate-500">
            {shopping ? "Groceries and everything else to buy" : "Ideas, things to cook, what to pack"}
          </Text>
        </View>
        <Pressable
          onPress={() => setCreating(true)}
          accessibilityLabel={`New ${noun}`}
          className="h-10 flex-row items-center rounded-xl bg-blue-600 px-3 active:bg-blue-700"
        >
          <Ionicons name="add" size={20} color="white" />
          <Text className="ml-1 font-semibold text-white">New</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {shopping && (
          <>
            <Pressable
              onPress={() => router.push("/grocery-list")}
              className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3.5 active:bg-slate-50"
            >
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-green-50">
                <Ionicons name="cart-outline" size={20} color="#16A34A" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-slate-900">Grocery List</Text>
                <Text className="text-xs text-slate-500">From the Kitchen — linked to your pantry</Text>
              </View>
              {groceryToBuy > 0 && <Text className="mr-2 text-sm text-slate-400">{groceryToBuy}</Text>}
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </Pressable>
            <Text className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-widest text-slate-400">
              My shopping lists
            </Text>
          </>
        )}

        {lists?.length === 0 && (
          <View className="items-center rounded-3xl border border-dashed border-slate-300 px-6 py-10">
            <Ionicons name={shopping ? "bag-handle-outline" : "checkbox-outline"} size={36} color="#94A3B8" />
            <Text className="mt-3 text-base font-semibold text-slate-700">No {noun}s yet</Text>
            <Text className="mt-1 text-center text-sm leading-5 text-slate-500">
              {shopping
                ? "For non-grocery shopping: household, gifts, a list per store. Tap New to start one."
                : "For things you want to list, not track. Tap New to start one."}
            </Text>
          </View>
        )}
        {lists?.map((list) => (
          <Pressable
            key={list._id}
            onPress={() => router.push({ pathname: "/lists/[id]", params: { id: list._id } })}
            className="mb-2 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3.5 active:bg-slate-50"
          >
            <Ionicons name={shopping ? "bag-handle-outline" : "checkbox-outline"} size={22} color={listAccent(list.color, theme)} />
            <Text className="ml-3 flex-1 text-base font-medium text-slate-900" numberOfLines={1}>
              {list.name}
            </Text>
            {!!list.openCount && <Text className="mr-2 text-sm text-slate-400">{list.openCount}</Text>}
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
          </Pressable>
        ))}
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
