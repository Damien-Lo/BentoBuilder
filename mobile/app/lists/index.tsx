import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DraggableListRow } from "@/src/components/todo/DraggableListRow";
import { openListOptions } from "@/src/components/todo/listActions";
import { applyDrop, computeDrop, rowKey, type DragRow, type DropTarget, type RowLayout } from "@/src/components/todo/listDrag";
import { TextPromptModal } from "@/src/components/todo/TextPromptModal";
import { listAccent, showActions, SMART_LISTS, useTodoTheme } from "@/src/components/todo/theme";
import { getGroceryItems } from "@/src/services/groceryListApi";
import { loadSettings } from "@/src/services/settingsService";
import {
  createTodoGroup,
  createTodoList,
  deleteTodoGroup,
  getTodoOverview,
  reorderTodoLists,
  updateTodoGroup,
  updateTodoList,
  type TodoGroup,
  type TodoList,
  type TodoOverview,
} from "@/src/services/todoApi";

type Prompt =
  | { kind: "newList"; group: string | null }
  | { kind: "newGroup" }
  | { kind: "renameList"; list: TodoList }
  | { kind: "renameGroup"; group: TodoGroup };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// The Lists home — smart lists, then your own lists and groups, with
// "New List" / new group at the bottom (modelled on Microsoft To Do).
export default function ListsHomeScreen() {
  const router = useRouter();
  const theme = useTodoTheme();
  const accent = listAccent("blue", theme);
  const [overview, setOverview] = useState<TodoOverview | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [groceryToBuy, setGroceryToBuy] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const refresh = useCallback(() => {
    getTodoOverview()
      .then(setOverview)
      .catch((error) => Alert.alert("Couldn't load lists", error instanceof Error ? error.message : "Something went wrong."));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadSettings().then((s) => setDisplayName(s.displayName)).catch(() => {});
      getGroceryItems()
        .then((items) => setGroceryToBuy(items.filter((item) => item.status === "toBuy").length))
        .catch(() => {});
    }, [refresh]),
  );

  const fail = (error: unknown) =>
    Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");

  async function handlePromptSubmit(value: string) {
    const current = prompt;
    setPrompt(null);
    if (!current) return;
    try {
      if (current.kind === "newList") {
        const list = await createTodoList(value, "blue", current.group);
        router.push({ pathname: "/lists/[id]", params: { id: list._id } });
      } else if (current.kind === "newGroup") {
        await createTodoGroup(value);
      } else if (current.kind === "renameList") {
        await updateTodoList(current.list._id, { name: value });
      } else {
        await updateTodoGroup(current.group._id, { name: value });
      }
      refresh();
    } catch (error) {
      fail(error);
    }
  }

  // The app's standard card: white, rounded-2xl, slate-200 outline.
  const cardStyle = {
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    overflow: "hidden" as const,
  };

  const lists = overview?.lists ?? [];
  const groups = overview?.groups ?? [];
  const defaultList = lists.find((l) => l.isDefault);
  const byOrder = (a: TodoList, b: TodoList) => a.order - b.order;
  const ungrouped = lists.filter((l) => !l.isDefault && !l.group).sort(byOrder);
  const listsInGroup = (groupId: string) => lists.filter((l) => l.group === groupId).sort(byOrder);

  // --- Drag a list to reorder it or move it into/out of a group ---
  // Every draggable row and group header, top to bottom, with its measured
  // position inside the rows container — what computeDrop works from.
  const dragRows: DragRow[] = [
    ...ungrouped.map((l): DragRow => ({ kind: "list", id: l._id, group: null })),
    ...groups.flatMap((g): DragRow[] => [
      { kind: "group", id: g._id },
      ...(g.collapsed ? [] : listsInGroup(g._id).map((l): DragRow => ({ kind: "list", id: l._id, group: g._id }))),
    ]),
  ];
  const layouts = useRef<Record<string, RowLayout>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);

  const measure = (row: DragRow) => (event: { nativeEvent: { layout: { y: number; height: number } } }) => {
    layouts.current[rowKey(row)] = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height };
  };

  function handleDragMove(listId: string, translationY: number) {
    const own = layouts.current[`list:${listId}`];
    if (!own) return;
    const target = computeDrop(dragRows, layouts.current, listId, own.y + own.height / 2 + translationY);
    dropTargetRef.current = target;
    setDropTarget(target);
  }

  function handleDragEnd(listId: string) {
    const target = dropTargetRef.current;
    setDraggingId(null);
    setDropTarget(null);
    dropTargetRef.current = null;
    if (!target || !overview) return;
    const { lists: moved, items } = applyDrop(overview.lists, listId, target);
    if (items.length === 0) return;
    setOverview({ ...overview, lists: moved });
    reorderTodoLists(items).then(refresh, (error) => {
      fail(error);
      refresh();
    });
  }

  function draggableRow(list: TodoList, groupId: string | null, divider: boolean) {
    return (
      <DraggableListRow
        key={list._id}
        list={list}
        indented={groupId !== null}
        divider={divider}
        theme={theme}
        onLayout={measure({ kind: "list", id: list._id, group: groupId })}
        onPress={() => router.push({ pathname: "/lists/[id]", params: { id: list._id } })}
        onOptions={() =>
          openListOptions({
            list,
            groups,
            onRename: () => setPrompt({ kind: "renameList", list }),
            onChanged: refresh,
            onDeleted: refresh,
          })
        }
        onDragStart={() => setDraggingId(list._id)}
        onDragMove={(translationY) => handleDragMove(list._id, translationY)}
        onDragEnd={() => handleDragEnd(list._id)}
      />
    );
  }

  function toggleGroup(group: TodoGroup) {
    setOverview((prev) =>
      prev && { ...prev, groups: prev.groups.map((g) => (g._id === group._id ? { ...g, collapsed: !g.collapsed } : g)) },
    );
    updateTodoGroup(group._id, { collapsed: !group.collapsed }).catch(fail);
  }

  function groupOptions(group: TodoGroup) {
    showActions(group.name, [
      { label: "New list in this group", onPress: () => setPrompt({ kind: "newList", group: group._id }) },
      { label: "Rename group", onPress: () => setPrompt({ kind: "renameGroup", group }) },
      {
        label: "Delete group",
        destructive: true,
        onPress: () =>
          Alert.alert(`Delete "${group.name}"?`, "Its lists are kept — they just move out of the group.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => deleteTodoGroup(group._id).then(refresh, fail) },
          ]),
      },
    ]);
  }

  function listRow(list: TodoList, indented = false) {
    return (
      <Pressable
        key={list._id}
        onPress={() => router.push({ pathname: "/lists/[id]", params: { id: list._id } })}
        onLongPress={() =>
          openListOptions({
            list,
            groups,
            onRename: () => setPrompt({ kind: "renameList", list }),
            onChanged: refresh,
            onDeleted: refresh,
          })
        }
        className="active:bg-slate-50"
        style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: theme.rowDivider }}
      >
        <Ionicons name={list.isDefault ? "home-outline" : "list"} size={20} color={listAccent(list.color, theme)} />
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 14, fontSize: 16, color: theme.text }}>
          {list.name}
        </Text>
        {!!list.openCount && <Text style={{ fontSize: 15, color: theme.textFaint }}>{list.openCount}</Text>}
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right"]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: theme.headerBg,
          borderBottomWidth: 1,
          borderBottomColor: theme.cardBorder,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back to home"
          className="active:bg-slate-100"
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginRight: 4 }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        {initials(displayName) ? (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "#EFF6FF",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Text style={{ color: "#1D4ED8", fontSize: 15, fontWeight: "700" }}>
              {initials(displayName)}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: theme.title }} numberOfLines={1}>
            {displayName.trim() || "Lists"}
          </Text>
          {!!displayName.trim() && <Text style={{ marginTop: 2, fontSize: 14, color: theme.textMuted }}>Lists</Text>}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }} scrollEnabled={!draggingId}>
        {/* Smart lists */}
        <View style={cardStyle}>
          {SMART_LISTS.map((smart, i) => {
            const count = overview?.smartCounts[smart.id] ?? 0;
            return (
              <Pressable
                key={smart.id}
                onPress={() => router.push({ pathname: "/lists/[id]", params: { id: smart.id } })}
                className="active:bg-slate-50"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 52,
                  paddingHorizontal: 16,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: theme.rowDivider,
                }}
              >
                <Ionicons name={smart.icon} size={20} color={listAccent(smart.color, theme)} />
                <Text style={{ flex: 1, marginLeft: 14, fontSize: 16, color: theme.text }}>{smart.name}</Text>
                {count > 0 && <Text style={{ fontSize: 15, color: theme.textFaint }}>{count}</Text>}
              </Pressable>
            );
          })}
          {defaultList && listRow(defaultList)}
          {/* A shortcut to the Kitchen's grocery list — not a to-do list
              itself, just a way in from here. */}
          <Pressable
            onPress={() => router.push("/grocery-list")}
            className="active:bg-slate-50"
            style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: theme.rowDivider }}
          >
            <Ionicons name="cart-outline" size={20} color={listAccent("green", theme)} />
            <Text style={{ flex: 1, marginLeft: 14, fontSize: 16, color: theme.text }}>Grocery List</Text>
            {groceryToBuy > 0 && <Text style={{ fontSize: 15, color: theme.textFaint }}>{groceryToBuy}</Text>}
          </Pressable>
        </View>

        <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">My lists</Text>

        {/* Your lists, then groups — one flat column of rows so each row's
            measured position lines up for drag-and-drop. */}
        <View style={cardStyle}>
          {ungrouped.length === 0 && groups.length === 0 && (
            <Text style={{ paddingHorizontal: 16, paddingVertical: 16, fontSize: 15, color: theme.textFaint }}>
              No lists yet — tap New List to make one.
            </Text>
          )}
          {ungrouped.map((list, i) => draggableRow(list, null, i > 0))}

          {groups.map((group, gi) => {
            const groupLists = listsInGroup(group._id);
            const hovered = dropTarget?.hoverGroupId === group._id;
            return [
              <View
                key={`group-${group._id}`}
                onLayout={measure({ kind: "group", id: group._id })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 52,
                  paddingLeft: 16,
                  paddingRight: 4,
                  borderTopWidth: gi > 0 || ungrouped.length > 0 ? 1 : 0,
                  borderTopColor: theme.rowDivider,
                  backgroundColor: hovered ? "#EFF6FF" : "transparent",
                }}
              >
                <Ionicons name="albums-outline" size={20} color={hovered ? listAccent("blue", theme) : theme.icon} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 14, fontSize: 16, fontWeight: "700", color: theme.text }}>
                  {group.name}
                </Text>
                <Pressable
                  onPress={() => groupOptions(group)}
                  accessibilityLabel={`${group.name} options`}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={theme.textFaint} />
                </Pressable>
                <Pressable
                  onPress={() => toggleGroup(group)}
                  accessibilityLabel={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name={group.collapsed ? "chevron-forward" : "chevron-down"} size={20} color={theme.textFaint} />
                </Pressable>
              </View>,
              ...(group.collapsed
                ? []
                : groupLists.length === 0
                  ? [
                      <Text
                        key={`empty-${group._id}`}
                        style={{ marginLeft: 25, borderLeftWidth: 2, borderLeftColor: theme.separator, paddingLeft: 16, paddingVertical: 12, fontSize: 14, color: theme.textFaint }}
                      >
                        Drag a list here, or use ⋯ to add one.
                      </Text>,
                    ]
                  : groupLists.map((list) => draggableRow(list, group._id, false))),
            ];
          })}

          {/* Where the dragged list will land */}
          {draggingId && dropTarget?.indicatorY != null && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                top: dropTarget.indicatorY - 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: listAccent("blue", theme),
              }}
            />
          )}
        </View>
      </ScrollView>

      {/* New list / new group */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 28,
          borderTopWidth: 1,
          borderTopColor: theme.cardBorder,
          backgroundColor: theme.headerBg,
        }}
      >
        <Pressable
          onPress={() => setPrompt({ kind: "newList", group: null })}
          className="active:opacity-60"
          style={{ flex: 1, flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 8 }}
        >
          <Ionicons name="add" size={26} color={accent} />
          <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: "600", color: accent }}>New List</Text>
        </Pressable>
        <Pressable
          onPress={() => setPrompt({ kind: "newGroup" })}
          accessibilityLabel="New group"
          className="active:bg-slate-100"
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="duplicate-outline" size={22} color={accent} />
        </Pressable>
      </View>

      <TextPromptModal
        visible={prompt !== null}
        title={
          prompt?.kind === "newGroup"
            ? "New group"
            : prompt?.kind === "renameList"
              ? "Rename list"
              : prompt?.kind === "renameGroup"
                ? "Rename group"
                : "New list"
        }
        placeholder={prompt?.kind === "newGroup" || prompt?.kind === "renameGroup" ? "Group name" : "List name"}
        initialValue={
          prompt?.kind === "renameList" ? prompt.list.name : prompt?.kind === "renameGroup" ? prompt.group.name : ""
        }
        confirmLabel={prompt?.kind === "renameList" || prompt?.kind === "renameGroup" ? "Save" : "Create"}
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => void handlePromptSubmit(value)}
      />
    </SafeAreaView>
  );
}
