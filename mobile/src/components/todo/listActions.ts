import { Alert } from "react-native";

import {
  deleteTodoList,
  updateTodoList,
  type TodoGroup,
  type TodoList,
} from "@/src/services/todoApi";

import { showActions, TODO_LIST_COLORS } from "./theme";

// The options menu for one list — shared by a long-press on the Lists home
// and the "⋯" button inside the list. `onRename` opens the caller's own
// name prompt; everything else is handled here, then `onChanged` refreshes
// (or `onDeleted`, so an open list screen can close itself).
export function openListOptions({
  list,
  groups,
  onRename,
  onChanged,
  onDeleted,
  onMoved,
  allowProject,
  onNewGroup,
}: {
  list: TodoList;
  groups: TodoGroup[];
  onRename: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  // After the list moved to a different tab (defaults to onChanged).
  onMoved?: () => void;
  // Offer turning a plain list into a project — where projects have views
  // of their own (the desktop).
  allowProject?: boolean;
  // Offer "New group…" among the groups to move to: asks for its name.
  onNewGroup?: () => void;
}) {
  const isProject = list.type === "project";
  const noun = list.type === "checklist" ? "checklist" : isProject ? "project" : "list";
  const fail = (error: unknown) =>
    Alert.alert("Couldn't update the list", error instanceof Error ? error.message : "Something went wrong.");

  const pickColor = () =>
    showActions(
      "List colour",
      Object.entries(TODO_LIST_COLORS).map(([key, value]) => ({
        label: key === list.color ? `${value.name} ✓` : value.name,
        onPress: () => updateTodoList(list._id, { color: key }).then(onChanged, fail),
      })),
    );

  const moveToGroup = () =>
    showActions("Move to group", [
      ...groups.map((group) => ({
        label: group._id === list.group ? `${group.name} ✓` : group.name,
        onPress: () => updateTodoList(list._id, { group: group._id }).then(onChanged, fail),
      })),
      ...(list.group
        ? [{ label: "Remove from group", onPress: () => updateTodoList(list._id, { group: null }).then(onChanged, fail) }]
        : []),
      ...(onNewGroup ? [{ label: "New group…", onPress: onNewGroup }] : []),
    ]);

  const confirmDelete = () =>
    Alert.alert(`Delete "${list.name}"?`, `This deletes the ${list.type === "checklist" ? "checklist and all of its items" : `${noun} and all of its tasks`}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteTodoList(list._id).then(onDeleted, fail) },
    ]);

  showActions(list.name, [
    { label: `Rename ${noun}`, onPress: onRename },
    { label: "Change colour", onPress: pickColor },
    ...(list.type === "checklist"
      ? [
          {
            label: list.shopping ? "Move to Checklists" : "Move to Shopping",
            onPress: () => updateTodoList(list._id, { shopping: !list.shopping }).then(onMoved ?? onChanged, fail),
          },
          {
            label: "Turn into a task list",
            onPress: () => updateTodoList(list._id, { type: "tasks" }).then(onMoved ?? onChanged, fail),
          },
        ]
      : isProject
        ? [
            {
              // (Its phases are kept, should it become a project again.)
              label: "Turn into a plain list",
              onPress: () => updateTodoList(list._id, { type: "tasks" }).then(onMoved ?? onChanged, fail),
            },
          ]
        : !list.isDefault
        ? [
            ...(allowProject
              ? [
                  {
                    label: "Turn into a project",
                    onPress: () => updateTodoList(list._id, { type: "project" }).then(onMoved ?? onChanged, fail),
                  },
                ]
              : []),
            {
              label: "Turn into a checklist",
              onPress: () =>
                Alert.alert(
                  "Turn into a checklist?",
                  "Its items become plain tickable lines on the Checklists tab. They leave the overview, My Day, Important, Planned and the calendar. Their details are kept if you switch back.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Turn into checklist",
                      onPress: () =>
                        updateTodoList(list._id, { type: "checklist", group: null }).then(onMoved ?? onChanged, fail),
                    },
                  ],
                ),
            },
          ]
        : []),
    ...(!list.isDefault && list.type !== "checklist" && (groups.length > 0 || onNewGroup) ? [{ label: "Move to group", onPress: moveToGroup }] : []),
    ...(!list.isDefault ? [{ label: `Delete ${noun}`, onPress: confirmDelete, destructive: true }] : []),
  ]);
}
