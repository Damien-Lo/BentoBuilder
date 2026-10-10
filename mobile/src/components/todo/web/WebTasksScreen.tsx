import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { getWebScale } from "@/src/components/web/scale";
import { loadSettings } from "@/src/services/settingsService";
import {
  createTodoGroup,
  createTodoList,
  createTodoProject,
  createTodoTask,
  deleteTodoGroup,
  getDeletedTasks,
  getListTasks,
  getSmartTasks,
  getTodoOverview,
  turnTaskIntoProject,
  updateTodoGroup,
  updateTodoList,
  updateTodoTask,
  type SmartListId,
  type TodoGroup,
  type TodoList,
  type TodoOverview,
  type TodoTask,
} from "@/src/services/todoApi";
import { todayStr } from "@/src/utils/mealPlan";

import { AddTaskBar, type NewTaskInput } from "../AddTaskBar";
import { openListOptions } from "../listActions";
import { PriorityPill, StatusPill, TaskNumber } from "../TaskBits";
import { TaskDetail } from "../TaskDetail";
import { TextPromptModal } from "../TextPromptModal";
import { friendlyDate, isOverdue, listAccent, longToday, showActions, SMART_LISTS, useTodoTheme } from "../theme";
import { WebProjectView } from "./WebProjectView";

// Tasks in a desktop browser, laid out like Microsoft To Do on the web:
// the lists down the left, the chosen list's tasks in the middle with the
// add bar on top, and the task you click opening in a panel on the right
// rather than as a page of its own. Same data and behaviour as the phone.

const LISTS_WIDTH = 270;
const DETAIL_WIDTH = 440;

type Row = { hovered?: boolean };

export function WebTasksScreen() {
  const router = useRouter();
  const theme = useTodoTheme();
  const [overview, setOverview] = useState<TodoOverview | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);
  // A smart list's id ("myday", …) or a list's own id.
  const [selected, setSelected] = useState<string>("myday");
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // The task open on the right, then any subtasks drilled into from it.
  const [detail, setDetail] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<"newList" | "newProject" | "newGroup" | "createGroup" | "renameGroup" | "rename" | null>(null);
  // The group being renamed.
  const [groupTarget, setGroupTarget] = useState<TodoGroup | null>(null);
  // A list or project being dragged to a group: where the pointer is, and
  // the group under it ("" = out of any group, null = nowhere to drop).
  const [drag, setDrag] = useState<{ list: TodoList; x: number; y: number; over: string | null } | null>(null);
  const zones = useRef(new Map<string, View | null>());
  // (A drag ends with a click on whatever is under the pointer; that one is ignored.)
  const justDragged = useRef(false);
  // Bumped when the project beside the open task changes (a reorder
  // renumbers it), so the panel reloads.
  const [panelReload, setPanelReload] = useState(0);
  const [weekStartDay, setWeekStartDay] = useState(1);
  useEffect(() => {
    loadSettings().then((s) => setWeekStartDay(s.weekStartDay)).catch(() => {});
  }, []);

  const smart = SMART_LISTS.find((s) => s.id === selected);
  const lists = (overview?.lists ?? [])
    .filter((l) => l.type !== "checklist")
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order);
  const list = smart ? null : lists.find((l) => l._id === selected) ?? null;
  const groups = [...(overview?.groups ?? [])].sort((a, b) => a.order - b.order);
  const groupName = (id: string | null | undefined) => groups.find((g) => g._id === id)?.name;
  // What sits in a group ("" = in none): its lists, then its projects.
  const inGroup = (id: string) =>
    lists
      .filter((l) => (l.group && groupName(l.group) !== undefined ? l.group : "") === id)
      .sort((a, b) => Number(a.type === "project") - Number(b.type === "project"));

  // Dragging a list or project by its row. It starts once the pointer has
  // moved a little, so a plain click still opens the row.
  function watchDrag(target: TodoList, down: { clientX: number; clientY: number; button?: number }) {
    if (target.isDefault || down.button) return;
    const scale = getWebScale();
    let started = false;
    const zoneAt = (y: number, x: number): string | null => {
      for (const [id, view] of zones.current) {
        const rect = (view as unknown as { getBoundingClientRect?: () => DOMRect } | null)?.getBoundingClientRect?.();
        if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
      }
      return null;
    };
    const move = (e: MouseEvent) => {
      if (!started && Math.abs(e.clientX - down.clientX) + Math.abs(e.clientY - down.clientY) < 6) return;
      started = true;
      document.body.style.userSelect = "none";
      setDrag({ list: target, x: e.clientX / scale, y: e.clientY / scale, over: zoneAt(e.clientY, e.clientX) });
    };
    const up = (e: MouseEvent) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      if (!started) return;
      document.body.style.userSelect = "";
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      setDrag(null);
      const over = zoneAt(e.clientY, e.clientX);
      if (over === null || over === (target.group ?? "")) return;
      updateTodoList(target._id, { group: over || null }).then(loadOverview, fail);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function groupMenu(group: TodoGroup) {
    const count = inGroup(group._id).length;
    showActions(group.name, [
      {
        label: "Rename group",
        onPress: () => {
          setGroupTarget(group);
          setPrompt("renameGroup");
        },
      },
      {
        label: "Delete group",
        destructive: true,
        onPress: () =>
          Alert.alert(`Delete "${group.name}"?`, count ? "What's in it is kept, and goes back to being in no group." : undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => void deleteTodoGroup(group._id).then(loadOverview, fail) },
          ]),
      },
    ]);
  }

  const rowFor = (l: TodoList, indent: boolean) => (
    <ListRow
      key={l._id}
      icon={l.isDefault ? "home-outline" : l.type === "project" ? "git-network-outline" : "list-outline"}
      color={listAccent(l.color, theme)}
      label={l.name}
      count={l.openCount ?? 0}
      on={selected === l._id}
      indent={indent}
      faded={drag?.list._id === l._id}
      onPress={() => {
        if (!justDragged.current) pick(l._id);
      }}
      onMouseDown={(e) => watchDrag(l, e)}
    />
  );
  // A zone's rows under "Lists" and "Projects", so the two kinds stay apart.
  const kinds = (members: TodoList[], indent: boolean) =>
    (
      [
        ["Lists", members.filter((l) => l.type !== "project")],
        ["Projects", members.filter((l) => l.type === "project")],
      ] as const
    ).map(([label, rows]) =>
      rows.length ? (
        <View key={label}>
          <Text style={{ marginTop: 6, marginBottom: 2, paddingLeft: indent ? 20 : 10, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: "#94A3B8" }}>{label.toUpperCase()}</Text>
          {rows.map((l) => rowFor(l, indent))}
        </View>
      ) : null,
    );
  const zoneStyle = (id: string) => ({
    borderRadius: 12,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: drag && drag.over === id && id !== (drag.list.group ?? "") ? "#DBEAFE" : "transparent",
  });

  const isProject = list?.type === "project";

  function listOptions(target: TodoList) {
    openListOptions({
      list: target,
      groups: overview?.groups ?? [],
      onRename: () => setPrompt("rename"),
      onNewGroup: () => setPrompt("newGroup"),
      onChanged: refresh,
      allowProject: true,
      onDeleted: () => {
        pick("myday");
        loadOverview();
      },
    });
  }

  // A task that has outgrown being one: it becomes a project, its subtasks
  // the project's tasks.
  function taskMenu(task: TodoTask) {
    showActions(task.title, [
      { label: "Open", onPress: () => setDetail([task._id]) },
      {
        label: "Turn into a project",
        onPress: () =>
          Alert.alert(
            `Turn "${task.title}" into a project?`,
            (task.subtaskCount > 0
              ? "The task becomes the project, and its subtasks become the project's tasks."
              : "It becomes an empty project you can add tasks and phases to.") +
              // (Time is booked against tasks, and this one stops being one.)
              (task.workBlocks.length > 0 ? ` The time booked on it (${task.workBlocks.length} block${task.workBlocks.length === 1 ? "" : "s"}) comes off the calendar.` : ""),
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Make it a project",
                onPress: () =>
                  void turnTaskIntoProject(task._id).then((project) => {
                    loadOverview();
                    pick(project._id);
                  }, fail),
              },
            ],
          ),
      },
    ]);
  }
  const accent = listAccent(smart?.color ?? list?.color, theme);
  const title = smart?.name ?? list?.name ?? "";

  const fail = (error: unknown) =>
    Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");

  const loadOverview = useCallback(() => {
    getTodoOverview().then(setOverview).catch(fail);
    getDeletedTasks().then((d) => setDeletedCount(d.length)).catch(() => {});
  }, []);

  const loadTasks = useCallback((which: string) => {
    const isSmart = SMART_LISTS.some((s) => s.id === which);
    (isSmart ? getSmartTasks(which as SmartListId) : getListTasks(which))
      .then((loaded) => {
        setTasks(loaded);
        setLoadedFor(which);
      })
      .catch(fail);
  }, []);

  const refresh = useCallback(() => {
    loadOverview();
    loadTasks(selected);
  }, [loadOverview, loadTasks, selected]);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview]),
  );
  useEffect(() => loadTasks(selected), [selected, loadTasks]);

  function pick(id: string) {
    setSelected(id);
    setDetail([]);
  }

  function patchLocal(taskId: string, changes: Partial<TodoTask>) {
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, ...changes } : t)));
  }

  function setCompleted(task: TodoTask, completed: boolean, completeSubtasks = false) {
    patchLocal(task._id, { completed });
    updateTodoTask(task._id, { completed, completeSubtasks }).then(refresh, (error) => {
      patchLocal(task._id, { completed: task.completed });
      fail(error);
    });
  }

  // Ticking off a task that still has open subtasks warns first.
  function toggleComplete(task: TodoTask) {
    if (!task.completed && task.openSubtaskCount > 0) {
      const n = task.openSubtaskCount;
      Alert.alert(
        "Complete with open subtasks?",
        `"${task.title}" still has ${n} open subtask${n === 1 ? "" : "s"}. Completing it will complete ${n === 1 ? "it" : "them"} too.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Complete all", onPress: () => setCompleted(task, true, true) },
        ],
      );
      return;
    }
    setCompleted(task, !task.completed);
  }

  function toggleImportant(task: TodoTask) {
    patchLocal(task._id, { important: !task.important });
    updateTodoTask(task._id, { important: !task.important }).then(refresh, (error) => {
      patchLocal(task._id, { important: task.important });
      fail(error);
    });
  }

  async function addTask(input: NewTaskInput) {
    try {
      await createTodoTask({
        title: input.title,
        list: smart ? undefined : selected,
        myDayDate: input.myDay ? todayStr() : null,
        important: smart?.id === "important",
        dueDate: input.dueDate,
        doDate: input.doDate,
        description: input.description,
      });
      refresh();
    } catch (error) {
      fail(error);
    }
  }

  const ready = loadedFor === selected;
  const open = tasks
    .filter((t) => !t.completed)
    .sort((a, b) =>
      smart?.id === "planned" ? (a.doDate ?? a.dueDate ?? "").localeCompare(b.doDate ?? b.dueDate ?? "") : 0,
    );
  const done = tasks.filter((t) => t.completed).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const openId = detail[detail.length - 1];

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#FFFFFF" }}>
      {/* Lists */}
      <View style={{ width: LISTS_WIDTH, borderRightWidth: 1, borderRightColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
        <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
          {SMART_LISTS.map((s) => (
            <ListRow
              key={s.id}
              icon={s.icon}
              color={listAccent(s.color, theme)}
              label={s.name}
              count={overview?.smartCounts[s.id] ?? 0}
              on={selected === s.id}
              onPress={() => pick(s.id)}
            />
          ))}

          <View style={{ height: 1, backgroundColor: "#E2E8F0", marginVertical: 10, marginHorizontal: 8 }} />

          {/* In no group */}
          <View
            ref={(view) => {
              zones.current.set("", view);
            }}
            style={zoneStyle("")}
          >
            {kinds(inGroup(""), false)}
          </View>

          {/* Groups, each with its lists and projects. Drag a row onto one. */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 2 }}>
            <View style={{ flex: 1 }}>
              <Heading label="Groups" />
            </View>
            <Pressable
              onPress={() => setPrompt("createGroup")}
              accessibilityLabel="New group"
              style={({ hovered }: Row) => ({ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#E2E8F0" : "transparent" })}
            >
              <Ionicons name="add" size={17} color="#64748B" />
            </Pressable>
          </View>
          {groups.length === 0 && (
            <Text style={{ paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, lineHeight: 17, color: "#94A3B8" }}>
              A group holds related lists and projects. Make one with +, then drag things into it.
            </Text>
          )}
          {groups.map((group) => {
            const members = inGroup(group._id);
            return (
              <View
                key={group._id}
                ref={(view) => {
                  zones.current.set(group._id, view);
                }}
                style={[zoneStyle(group._id), { marginBottom: 4 }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", height: 30, paddingLeft: 10 }}>
                  <Ionicons name="folder-outline" size={14} color="#64748B" />
                  <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: "700", color: "#475569" }}>
                    {group.name}
                  </Text>
                  <Pressable
                    onPress={() => groupMenu(group)}
                    accessibilityLabel={`${group.name} options`}
                    style={({ hovered }: Row) => ({ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#E2E8F0" : "transparent" })}
                  >
                    <Ionicons name="ellipsis-horizontal" size={14} color="#94A3B8" />
                  </Pressable>
                </View>
                {kinds(members, true)}
                {members.length === 0 && <Text style={{ paddingLeft: 32, paddingBottom: 6, fontSize: 12, color: "#94A3B8" }}>Drag a list or project here</Text>}
              </View>
            );
          })}

          <View style={{ height: 1, backgroundColor: "#E2E8F0", marginVertical: 10, marginHorizontal: 8 }} />

          <ListRow
            icon="trash-outline"
            color="#64748B"
            label="Recently deleted"
            count={deletedCount}
            on={false}
            onPress={() => router.push("/lists/deleted")}
          />
        </ScrollView>

        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" }}>
          {(
            [
              ["newList", "New list", "add"],
              ["newProject", "New project", "git-network-outline"],
            ] as const
          ).map(([kind, label, icon], index) => (
            <Pressable
              key={kind}
              onPress={() => setPrompt(kind)}
              style={({ hovered }: Row) => ({
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                borderLeftWidth: index ? 1 : 0,
                borderLeftColor: "#E2E8F0",
                backgroundColor: hovered ? "#EEF2F7" : "transparent",
              })}
            >
              <Ionicons name={icon} size={index ? 15 : 18} color="#2563EB" />
              <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: "#2563EB" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* A project has views of its own. */}
      {isProject && list && (
        <View style={{ flex: 1 }}>
          <WebProjectView
            project={list}
            tasks={ready ? tasks : []}
            groupName={groupName(list.group)}
            accent={accent}
            selectedTaskId={detail[0]}
            weekStartDay={weekStartDay}
            onOpenTask={(id) => setDetail([id])}
            onChanged={() => {
              refresh();
              setPanelReload((n) => n + 1);
            }}
            onOptions={() => listOptions(list)}
          />
        </View>
      )}

      {/* The chosen list's tasks */}
      <View style={{ flex: 1, backgroundColor: "#F8FAFC", display: isProject ? "none" : "flex" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 28, paddingTop: 24, paddingBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 26, fontWeight: "700", color: accent }}>
              {title}
            </Text>
            {smart?.id === "myday" && <Text style={{ marginTop: 2, fontSize: 13, color: "#64748B" }}>{longToday()}</Text>}
          </View>
          {list && (
            <Pressable
              onPress={() => listOptions(list)}
              accessibilityLabel="List options"
              style={({ hovered }: Row) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: hovered ? "#E2E8F0" : "transparent",
              })}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#475569" />
            </Pressable>
          )}
        </View>

        <View style={{ paddingHorizontal: 28 }}>
          <AddTaskBar accent={accent} checklist={false} defaults={{ myDay: smart?.id === "myday" }} onAdd={(input) => void addTask(input)} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 12, paddingBottom: 40 }}>
          {ready && open.length === 0 && done.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Ionicons name="checkmark-done-outline" size={40} color="#CBD5E1" />
              <Text style={{ marginTop: 10, fontSize: 15, fontWeight: "600", color: "#475569" }}>Nothing here yet</Text>
              <Text style={{ marginTop: 2, fontSize: 13, color: "#94A3B8" }}>Add a task above to get started.</Text>
            </View>
          )}

          {open.map((task) => (
            <TaskRow
              key={task._id}
              task={task}
              accent={accent}
              showList={!!smart}
              selected={detail[0] === task._id}
              onOpen={() => setDetail([task._id])}
              onToggle={() => toggleComplete(task)}
              onStar={() => toggleImportant(task)}
              onMenu={() => taskMenu(task)}
            />
          ))}

          {done.length > 0 && (
            <>
              <Pressable
                onPress={() => setShowCompleted((v) => !v)}
                style={({ hovered }: Row) => ({
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 14,
                  marginBottom: 8,
                  paddingHorizontal: 10,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: hovered ? "#E2E8F0" : "#EEF2F7",
                })}
              >
                <Ionicons name={showCompleted ? "chevron-down" : "chevron-forward"} size={14} color="#475569" />
                <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: "#475569" }}>Completed  {done.length}</Text>
              </Pressable>
              {showCompleted &&
                done.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    accent={accent}
                    showList={!!smart}
                    selected={detail[0] === task._id}
                    onOpen={() => setDetail([task._id])}
                    onToggle={() => toggleComplete(task)}
                    onStar={() => toggleImportant(task)}
                    onMenu={() => taskMenu(task)}
                  />
                ))}
            </>
          )}
        </ScrollView>
      </View>

      {/* The open task */}
      {openId && (
        <View style={{ width: DETAIL_WIDTH, borderLeftWidth: 1, borderLeftColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
          <TaskDetail
            key={openId}
            id={openId}
            mode="sheet"
            canGoBack={detail.length > 1}
            onOpenSubtask={(id) => setDetail((prev) => [...prev, id])}
            // Back up one level, or (deleted / failed to load) close.
            onExit={() => {
              setDetail((prev) => prev.slice(0, -1));
              refresh();
            }}
            onClose={() => setDetail([])}
            onChanged={refresh}
            refreshKey={panelReload}
          />
        </View>
      )}

      {/* What's being dragged, following the pointer */}
      {drag && (
        <View
          pointerEvents="none"
          style={{ position: "fixed", left: drag.x + 12, top: drag.y + 8, zIndex: 100, flexDirection: "row", alignItems: "center", height: 32, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#BFDBFE", boxShadow: "0 8px 20px rgba(15,23,42,0.18)" } as object}
        >
          <Ionicons name={drag.list.type === "project" ? "git-network-outline" : "list-outline"} size={15} color={listAccent(drag.list.color, theme)} />
          <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "600", color: "#0F172A" }}>{drag.list.name}</Text>
        </View>
      )}

      <TextPromptModal
        visible={prompt != null}
        title={
          prompt === "rename" ? (isProject ? "Rename project" : "Rename list") : prompt === "newProject" ? "New project" : prompt === "newGroup" || prompt === "createGroup" ? "New group" : prompt === "renameGroup" ? "Rename group" : "New list"
        }
        placeholder={prompt === "newProject" ? "Project name" : prompt === "newGroup" || prompt === "createGroup" || prompt === "renameGroup" ? "e.g. Work, Home, a client" : "List name"}
        initialValue={prompt === "rename" ? list?.name ?? "" : prompt === "renameGroup" ? groupTarget?.name ?? "" : ""}
        confirmLabel={prompt === "rename" || prompt === "renameGroup" ? "Save" : "Create"}
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => {
          const mode = prompt;
          setPrompt(null);
          if (mode === "rename" && list) {
            updateTodoList(list._id, { name }).then(refresh, fail);
          } else if (mode === "createGroup") {
            createTodoGroup(name).then(loadOverview, fail);
          } else if (mode === "renameGroup" && groupTarget) {
            updateTodoGroup(groupTarget._id, { name }).then(loadOverview, fail);
          } else if (mode === "newGroup" && list) {
            // A new group, with the open list or project as its first member.
            createTodoGroup(name)
              .then((group) => updateTodoList(list._id, { group: group._id }))
              .then(refresh, fail);
          } else if (mode === "newProject") {
            createTodoProject(name, "blue").then((created: TodoList) => {
              loadOverview();
              pick(created._id);
            }, fail);
          } else {
            createTodoList(name, "blue").then((created: TodoList) => {
              loadOverview();
              pick(created._id);
            }, fail);
          }
        }}
      />
    </View>
  );
}

function Heading({ label }: { label: string }) {
  return <Text style={{ marginBottom: 4, paddingHorizontal: 10, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#94A3B8" }}>{label.toUpperCase()}</Text>;
}

function ListRow({
  icon,
  color,
  label,
  count,
  on,
  indent,
  faded,
  onPress,
  onMouseDown,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  count: number;
  on: boolean;
  // Sits under a group's name.
  indent?: boolean;
  // Being dragged somewhere else.
  faded?: boolean;
  onPress: () => void;
  onMouseDown?: (e: { clientX: number; clientY: number; button?: number }) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      {...(onMouseDown ? ({ onMouseDown } as object) : null)}
      style={({ hovered }: Row) => ({
        flexDirection: "row",
        alignItems: "center",
        height: 38,
        paddingHorizontal: 10,
        marginLeft: indent ? 10 : 0,
        opacity: faded ? 0.4 : 1,
        borderRadius: 10,
        backgroundColor: on ? "#E0EAFF" : hovered ? "#EEF2F7" : "transparent",
      })}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 12, fontSize: 14, fontWeight: on ? "700" : "500", color: "#0F172A" }}>
        {label}
      </Text>
      {count > 0 && <Text style={{ fontSize: 12, color: "#64748B" }}>{count}</Text>}
    </Pressable>
  );
}

function TaskRow({
  task,
  accent,
  showList,
  selected,
  onOpen,
  onToggle,
  onStar,
  onMenu,
}: {
  task: TodoTask;
  accent: string;
  // In a smart list, say which list each task is from.
  showList: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onStar: () => void;
  onMenu: () => void;
}) {
  const overdue = !task.completed && !!task.dueDate && isOverdue(task.dueDate);
  const meta = [
    showList ? task.list?.name : null,
    task.subtaskCount > 0 ? `${task.subtaskCount - task.openSubtaskCount} of ${task.subtaskCount}` : null,
    task.workBlocks.length ? `${task.workBlocks.length} time${task.workBlocks.length === 1 ? "" : "s"} booked` : task.doDate ? `Do ${friendlyDate(task.doDate)}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onOpen}
      style={({ hovered }: Row) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: 54,
        marginBottom: 6,
        paddingLeft: 6,
        paddingRight: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? "#93C5FD" : "#E2E8F0",
        backgroundColor: selected ? "#EFF6FF" : hovered ? "#F1F5F9" : "#FFFFFF",
      })}
    >
      <Pressable
        onPress={onToggle}
        accessibilityLabel={task.completed ? "Mark as not done" : "Mark as done"}
        style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        {({ hovered }: Row) => (
          <Ionicons
            name={task.completed ? "checkmark-circle" : hovered ? "checkmark-circle-outline" : "ellipse-outline"}
            size={22}
            color={task.completed ? accent : hovered ? accent : "#94A3B8"}
          />
        )}
      </Pressable>

      <View style={{ flex: 1, paddingVertical: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: 15,
              color: task.completed ? "#94A3B8" : "#0F172A",
              textDecorationLine: task.completed ? "line-through" : "none",
            }}
          >
            {task.title}
          </Text>
          <TaskNumber number={task.number} />
        </View>
        <View style={{ marginTop: 3, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          {!task.completed && task.status !== "not_started" && <StatusPill status={task.status} />}
          {!task.completed && task.priority !== "medium" && <PriorityPill priority={task.priority} />}
          {meta.length > 0 && <Text style={{ fontSize: 12, color: "#64748B" }}>{meta.join("  ·  ")}</Text>}
          {!!task.dueDate && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="calendar-outline" size={12} color={overdue ? "#DC2626" : "#64748B"} />
              <Text style={{ marginLeft: 3, fontSize: 12, color: overdue ? "#DC2626" : "#64748B" }}>Due {friendlyDate(task.dueDate)}</Text>
            </View>
          )}
        </View>
      </View>

      <Pressable onPress={onMenu} accessibilityLabel="More" style={{ width: 30, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="ellipsis-horizontal" size={16} color="#94A3B8" />
      </Pressable>
      <Pressable
        onPress={onStar}
        accessibilityLabel={task.important ? "Remove importance" : "Mark as important"}
        style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name={task.important ? "star" : "star-outline"} size={19} color={task.important ? accent : "#94A3B8"} />
      </Pressable>
    </Pressable>
  );
}
