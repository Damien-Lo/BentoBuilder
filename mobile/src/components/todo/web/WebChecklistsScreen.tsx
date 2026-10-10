import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { getGroceryItems } from "@/src/services/groceryListApi";
import {
  createTodoList,
  createTodoTask,
  deleteTodoTask,
  getListTasks,
  getTodoOverview,
  updateTodoList,
  updateTodoTask,
  type TodoGroup,
  type TodoList,
  type TodoTask,
} from "@/src/services/todoApi";

import { AddTaskBar } from "../AddTaskBar";
import { openListOptions } from "../listActions";
import { TextPromptModal } from "../TextPromptModal";
import { listAccent, showActions, useTodoTheme } from "../theme";

// Checklists and Shopping on the desktop, laid out like Lists & projects:
// the lists down the left, the chosen one's items beside them. A checklist
// is plain tickable lines — no dates, status or detail — so there is no
// third column. The Shopping tab leads with the Kitchen's grocery list,
// which has a page of its own.

const LISTS_WIDTH = 270;
type Hover = { hovered?: boolean };

export function WebChecklistsScreen({ shopping }: { shopping: boolean }) {
  const router = useRouter();
  const theme = useTodoTheme();
  const [lists, setLists] = useState<TodoList[]>([]);
  const [groups, setGroups] = useState<TodoGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [groceryToBuy, setGroceryToBuy] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<TodoTask[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(true);
  const [prompt, setPrompt] = useState<{ kind: "new" } | { kind: "rename" } | { kind: "item"; item: TodoTask } | null>(null);

  const noun = shopping ? "shopping list" : "checklist";
  const fail = (error: unknown) => Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");

  const loadLists = useCallback(() => {
    getTodoOverview()
      .then((overview) => {
        setGroups(overview.groups);
        setLists(overview.lists.filter((l) => l.type === "checklist" && !!l.shopping === shopping).sort((a, b) => a.order - b.order));
        setLoaded(true);
      })
      .catch(fail);
    if (shopping) {
      getGroceryItems()
        .then((all) => setGroceryToBuy(all.filter((item) => item.status === "toBuy").length))
        .catch(() => {});
    }
  }, [shopping]);
  useFocusEffect(loadLists);

  // Something is always open: the one chosen, or else the first.
  const list = lists.find((l) => l._id === selected) ?? lists[0] ?? null;
  const listId = list?._id ?? null;
  const loadItems = useCallback(() => {
    if (!listId) return;
    getListTasks(listId)
      .then((loadedItems) => {
        setItems(loadedItems);
        setLoadedFor(listId);
      })
      .catch(fail);
  }, [listId]);
  useEffect(loadItems, [loadItems]);

  const refresh = () => {
    loadLists();
    loadItems();
  };
  const accent = listAccent(list?.color, theme);
  const ready = loadedFor === listId;
  const open = ready ? items.filter((t) => !t.completed) : [];
  const done = ready ? items.filter((t) => t.completed) : [];

  function toggle(item: TodoTask) {
    setItems((prev) => prev.map((t) => (t._id === item._id ? { ...t, completed: !item.completed } : t)));
    updateTodoTask(item._id, { completed: !item.completed }).then(loadLists, (error) => {
      fail(error);
      loadItems();
    });
  }

  function itemMenu(item: TodoTask) {
    showActions(item.title, [
      { label: "Rename", onPress: () => setPrompt({ kind: "item", item }) },
      {
        label: "Delete",
        destructive: true,
        onPress: () => {
          setItems((prev) => prev.filter((t) => t._id !== item._id));
          deleteTodoTask(item._id).then(loadLists, (error) => {
            fail(error);
            loadItems();
          });
        },
      },
    ]);
  }

  function clearDone() {
    Alert.alert(`Remove ${done.length} ticked item${done.length === 1 ? "" : "s"}?`, "They go to Recently deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setItems((prev) => prev.filter((t) => !t.completed));
          Promise.all(done.map((t) => deleteTodoTask(t._id))).then(loadLists, (error) => {
            fail(error);
            loadItems();
          });
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#FFFFFF" }}>
      {/* The lists */}
      <View style={{ width: LISTS_WIDTH, borderRightWidth: 1, borderRightColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
        <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
          {shopping && (
            <>
              <Pressable
                onPress={() => router.navigate("/grocery-list")}
                style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 52, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: hovered ? "#F1F5F9" : "#FFFFFF" })}
              >
                <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#F0FDF4" }}>
                  <Ionicons name="cart-outline" size={17} color="#16A34A" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>Grocery list</Text>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: "#64748B" }}>
                    Linked to your pantry
                  </Text>
                </View>
                {groceryToBuy > 0 && <Text style={{ marginRight: 4, fontSize: 12, color: "#64748B" }}>{groceryToBuy}</Text>}
                <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
              </Pressable>
              <Text style={{ marginTop: 16, marginBottom: 4, paddingHorizontal: 10, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#94A3B8" }}>MY SHOPPING LISTS</Text>
            </>
          )}
          {lists.map((l) => {
            const on = l._id === listId;
            return (
              <Pressable
                key={l._id}
                onPress={() => setSelected(l._id)}
                style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 38, paddingHorizontal: 10, borderRadius: 10, backgroundColor: on ? "#E0EAFF" : hovered ? "#EEF2F7" : "transparent" })}
              >
                <Ionicons name={shopping ? "bag-handle-outline" : "checkbox-outline"} size={18} color={listAccent(l.color, theme)} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 12, fontSize: 14, fontWeight: on ? "700" : "500", color: "#0F172A" }}>
                  {l.name}
                </Text>
                {!!l.openCount && <Text style={{ fontSize: 12, color: "#64748B" }}>{l.openCount}</Text>}
              </Pressable>
            );
          })}
          {loaded && lists.length === 0 && (
            <Text style={{ paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, lineHeight: 17, color: "#94A3B8" }}>
              {shopping ? "For shopping that isn't groceries: household, gifts, a list per store." : "For things you want to list, not track: ideas, things to cook, what to pack."}
            </Text>
          )}
        </ScrollView>
        <Pressable
          onPress={() => setPrompt({ kind: "new" })}
          style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 48, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: "#E2E8F0", backgroundColor: hovered ? "#EEF2F7" : "transparent" })}
        >
          <Ionicons name="add" size={19} color="#2563EB" />
          <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "600", color: "#2563EB" }}>New {noun}</Text>
        </Pressable>
      </View>

      {/* The chosen list's items */}
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {!list ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Ionicons name={shopping ? "bag-handle-outline" : "checkbox-outline"} size={40} color="#CBD5E1" />
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600", color: "#475569" }}>{loaded ? `No ${noun}s yet` : ""}</Text>
            {loaded && <Text style={{ marginTop: 4, fontSize: 13, color: "#94A3B8" }}>Start one with &quot;New {noun}&quot; on the left.</Text>}
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 48, maxWidth: 900 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 26, fontWeight: "700", color: accent }}>
                  {list.name}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 13, color: "#64748B" }}>
                  {ready ? `${open.length} to go${done.length ? ` · ${done.length} ticked` : ""}` : " "}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  openListOptions({
                    list,
                    groups,
                    onRename: () => setPrompt({ kind: "rename" }),
                    onChanged: refresh,
                    onDeleted: () => {
                      setSelected(null);
                      loadLists();
                    },
                    // Now on the other tab (or among the task lists).
                    onMoved: () => {
                      setSelected(null);
                      loadLists();
                    },
                  })
                }
                accessibilityLabel="List options"
                style={({ hovered }: Hover) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#E2E8F0" : "transparent" })}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#475569" />
              </Pressable>
            </View>

            <AddTaskBar accent={accent} checklist onAdd={(input) => void createTodoTask({ title: input.title, list: list._id }).then(refresh, fail)} />

            {open.map((item) => (
              <Item key={item._id} item={item} accent={accent} onToggle={() => toggle(item)} onMenu={() => itemMenu(item)} />
            ))}
            {ready && items.length === 0 && <Text style={{ marginTop: 28, textAlign: "center", fontSize: 14, color: "#94A3B8" }}>Nothing on this list yet. Type above to add to it.</Text>}

            {done.length > 0 && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 6 }}>
                  <Pressable onPress={() => setShowDone((v) => !v)} style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <Ionicons name={showDone ? "chevron-down" : "chevron-forward"} size={14} color="#64748B" />
                    <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", color: "#475569" }}>Ticked · {done.length}</Text>
                  </Pressable>
                  <Pressable onPress={clearDone} style={({ hovered }: Hover) => ({ height: 28, paddingHorizontal: 10, justifyContent: "center", borderRadius: 8, backgroundColor: hovered ? "#E2E8F0" : "transparent" })}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B" }}>Remove ticked</Text>
                  </Pressable>
                </View>
                {showDone && done.map((item) => <Item key={item._id} item={item} accent={accent} onToggle={() => toggle(item)} onMenu={() => itemMenu(item)} />)}
              </>
            )}
          </ScrollView>
        )}
      </View>

      <TextPromptModal
        visible={prompt != null}
        title={prompt?.kind === "new" ? `New ${noun}` : prompt?.kind === "item" ? "Rename item" : `Rename ${noun}`}
        placeholder={prompt?.kind === "item" ? "Item" : shopping ? "e.g. Household" : "e.g. Things to cook"}
        initialValue={prompt?.kind === "rename" ? list?.name ?? "" : prompt?.kind === "item" ? prompt.item.title : ""}
        confirmLabel={prompt?.kind === "new" ? "Create" : "Save"}
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => {
          const current = prompt;
          setPrompt(null);
          if (current?.kind === "new") {
            createTodoList(name, shopping ? "teal" : "green", null, "checklist", shopping).then((created) => {
              setSelected(created._id);
              loadLists();
            }, fail);
          } else if (current?.kind === "rename" && list) {
            updateTodoList(list._id, { name }).then(loadLists, fail);
          } else if (current?.kind === "item") {
            updateTodoTask(current.item._id, { title: name }).then(loadItems, fail);
          }
        }}
      />
    </View>
  );
}

function Item({ item, accent, onToggle, onMenu }: { item: TodoTask; accent: string; onToggle: () => void; onMenu: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", minHeight: 44, marginTop: 6, paddingLeft: 12, paddingRight: 6, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: hovered ? "#F8FAFC" : "#FFFFFF" })}
    >
      <Ionicons name={item.completed ? "checkbox" : "square-outline"} size={20} color={item.completed ? accent : "#94A3B8"} />
      <Text style={{ flex: 1, marginLeft: 12, paddingVertical: 10, fontSize: 14, color: item.completed ? "#94A3B8" : "#0F172A", textDecorationLine: item.completed ? "line-through" : "none" }}>{item.title}</Text>
      <Pressable
        onPress={onMenu}
        accessibilityLabel="More"
        style={({ hovered }: Hover) => ({ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#E2E8F0" : "transparent" })}
      >
        <Ionicons name="ellipsis-horizontal" size={16} color="#94A3B8" />
      </Pressable>
    </Pressable>
  );
}
