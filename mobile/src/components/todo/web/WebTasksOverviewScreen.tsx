import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { daysBetween } from "@/src/components/calendar/calendarUtils";
import { compactDate } from "@/src/components/web/fields";
import { Button, Card, CardLink, Empty, PageTitle, Row, Stat, WEB, WebPage } from "@/src/components/web/ui";
import {
  getListTasks,
  getSmartTasks,
  getTodoDashboard,
  getTodoOverview,
  type TodoDashboard,
  type TodoList,
  type TodoOverview,
  type TodoTask,
} from "@/src/services/todoApi";
import { todayStr } from "@/src/utils/mealPlan";

import { StatusPill } from "../TaskBits";
import { listAccent, longToday, useTodoTheme } from "../theme";
import { PROJECT_STATUS_META } from "./WebProjectView";

// The Tasks section's overview on the desktop: where everything stands at
// a glance — the counts, what's overdue and coming up, each project's
// progress, and the lists. Checklists and shopping lists aren't counted.
// Anything clicked opens in Lists & projects.

type Hover = { hovered?: boolean };

export function WebTasksOverviewScreen() {
  const router = useRouter();
  const theme = useTodoTheme();
  const today = todayStr();
  const [dashboard, setDashboard] = useState<TodoDashboard | null>(null);
  const [overview, setOverview] = useState<TodoOverview | null>(null);
  const [planned, setPlanned] = useState<TodoTask[]>([]);
  // Each project's tasks, for how far along it is.
  const [projectTasks, setProjectTasks] = useState<Record<string, TodoTask[]>>({});

  useFocusEffect(
    useCallback(() => {
      getTodoDashboard().then(setDashboard).catch(() => {});
      getSmartTasks("planned").then(setPlanned).catch(() => {});
      getTodoOverview()
        .then((loaded) => {
          setOverview(loaded);
          for (const project of loaded.lists.filter((l) => l.type === "project")) {
            getListTasks(project._id)
              .then((tasks) => setProjectTasks((prev) => ({ ...prev, [project._id]: tasks })))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, []),
  );

  const openList = (id: string) => router.navigate({ pathname: "/lists/tasks", params: { list: id } });
  const openTask = (task: TodoTask) => router.navigate({ pathname: "/lists/tasks", params: { list: task.list._id, task: task._id } });

  const lists = (overview?.lists ?? []).filter((l) => l.type !== "checklist");
  const projects = lists.filter((l) => l.type === "project");
  const plain = lists.filter((l) => l.type !== "project").sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order);
  const groupName = (id: string | null | undefined) => overview?.groups.find((g) => g._id === id)?.name;
  // Due (or planned for) the next two weeks, soonest first.
  const dateOf = (task: TodoTask) => task.dueDate ?? task.doDate ?? "";
  const soon = planned
    .filter((t) => !t.completed && dateOf(t) >= today && daysBetween(today, dateOf(t)) <= 14)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)))
    .slice(0, 8);
  const open = dashboard ? dashboard.total - dashboard.completed : 0;

  return (
    <WebPage>
      <PageTitle title="Overview" subtitle={longToday()} right={<Button label="Lists & projects" icon="list-outline" onPress={() => router.navigate("/lists/tasks")} />} />

      <Row>
        <Stat label="Open" value={String(open)} sub={dashboard ? `of ${dashboard.total} tasks` : undefined} icon="list-outline" />
        <Stat label="In progress" value={String(dashboard?.inProgress ?? 0)} icon="time-outline" />
        <Stat label="Overdue" value={String(dashboard?.overdue ?? 0)} tone={dashboard?.overdue ? "bad" : "default"} icon="warning-outline" />
        <Stat label="My Day" value={String(overview?.smartCounts.myday ?? 0)} sub="picked for today" icon="sunny-outline" />
        <Stat label="Completed" value={String(dashboard?.completed ?? 0)} sub={dashboard ? `${dashboard.completion}% overall` : undefined} tone="good" icon="checkmark-circle-outline" />
      </Row>

      <Row style={{ marginTop: 16, alignItems: "flex-start" }}>
        <Card title="Overdue" subtitle="Past their due date" style={{ flex: 1, minWidth: 300 }} padded={false}>
          {dashboard?.overdueTasks.length ? <TaskLines tasks={dashboard.overdueTasks} today={today} onOpen={openTask} /> : <Empty icon="checkmark-done-outline" text="Nothing overdue" />}
        </Card>
        <Card title="Coming up" subtitle="Due in the next two weeks" style={{ flex: 1, minWidth: 300 }} padded={false}>
          {soon.length ? <TaskLines tasks={soon} today={today} onOpen={openTask} /> : <Empty icon="calendar-clear-outline" text="Nothing due in the next two weeks" />}
        </Card>
        <Card title="Recently touched" subtitle="Open tasks you last worked on" style={{ flex: 1, minWidth: 300 }} padded={false}>
          {dashboard?.recent.length ? <TaskLines tasks={dashboard.recent} today={today} onOpen={openTask} /> : <Empty icon="list-outline" text="No open tasks" />}
        </Card>
      </Row>

      <Row style={{ marginTop: 16, alignItems: "flex-start" }}>
        <Card title="Projects" subtitle="How far along each one is" style={{ flex: 2, minWidth: 420 }} padded={false}>
          {projects.length === 0 ? (
            <Empty icon="git-network-outline" text="No projects yet. Start one from Lists & projects." />
          ) : (
            <View style={{ paddingBottom: 8 }}>
              {projects.map((project) => (
                <ProjectLine key={project._id} project={project} group={groupName(project.group)} tasks={projectTasks[project._id]} today={today} color={listAccent(project.color, theme)} onPress={() => openList(project._id)} />
              ))}
            </View>
          )}
        </Card>
        <Card title="Lists" action={<CardLink label="All lists" onPress={() => router.navigate("/lists/tasks")} />} style={{ flex: 1, minWidth: 280 }} padded={false}>
          <View style={{ paddingBottom: 8 }}>
            {plain.map((list) => (
              <Pressable
                key={list._id}
                onPress={() => openList(list._id)}
                style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 38, paddingHorizontal: 18, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}
              >
                <Ionicons name={list.isDefault ? "home-outline" : "list-outline"} size={16} color={listAccent(list.color, theme)} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: "500", color: WEB.text }}>
                  {list.name}
                </Text>
                {!!groupName(list.group) && <Text style={{ marginRight: 10, fontSize: 12, color: WEB.faint }}>{groupName(list.group)}</Text>}
                <Text style={{ fontSize: 12, color: WEB.muted }}>{list.openCount ?? 0} open</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      </Row>
    </WebPage>
  );
}

function TaskLines({ tasks, today, onOpen }: { tasks: TodoTask[]; today: string; onOpen: (task: TodoTask) => void }) {
  return (
    <View style={{ paddingBottom: 8 }}>
      {tasks.map((task) => {
        const date = task.dueDate ?? task.doDate;
        const late = !!task.dueDate && task.dueDate < today;
        return (
          <Pressable
            key={task._id}
            onPress={() => onOpen(task)}
            style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", minHeight: 46, paddingHorizontal: 18, paddingVertical: 6, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: WEB.text }}>
                {task.title}
              </Text>
              <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: WEB.muted }}>
                {task.list.name}
                {task.subtaskCount > 0 ? ` · ${task.subtaskCount - task.openSubtaskCount}/${task.subtaskCount} subtasks` : ""}
              </Text>
            </View>
            <StatusPill status={task.status} />
            {!!date && <Text style={{ width: 86, textAlign: "right", fontSize: 12, fontWeight: late ? "700" : "500", color: late ? WEB.red : WEB.muted }}>{compactDate(date)}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function ProjectLine({ project, group, tasks, today, color, onPress }: { project: TodoList; group?: string; tasks?: TodoTask[]; today: string; color: string; onPress: () => void }) {
  const status = PROJECT_STATUS_META[project.projectStatus ?? "planning"];
  const total = tasks?.length ?? 0;
  const done = tasks?.filter((t) => t.completed).length ?? 0;
  const progress = total ? Math.round(tasks!.reduce((sum, t) => sum + (t.completed ? 100 : t.progress ?? 0), 0) / total) : 0;
  const left = project.targetDate ? daysBetween(today, project.targetDate) : null;
  return (
    <Pressable onPress={onPress} style={({ hovered }: Hover) => ({ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="git-network-outline" size={16} color={color} />
        <Text numberOfLines={1} style={{ flexShrink: 1, marginLeft: 10, fontSize: 14, fontWeight: "700", color: WEB.text }}>
          {project.name}
        </Text>
        {!!group && <Text style={{ marginLeft: 8, fontSize: 12, color: WEB.faint }}>{group}</Text>}
        <View style={{ flex: 1 }} />
        <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: status.bg }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: status.fg }}>{status.label}</Text>
        </View>
        <Text style={{ width: 150, textAlign: "right", fontSize: 12, fontWeight: left !== null && left < 0 ? "700" : "500", color: left !== null && left < 0 ? WEB.red : WEB.muted }}>
          {project.targetDate ? `${compactDate(project.targetDate)} · ${left! < 0 ? `${-left!} d late` : left === 0 ? "today" : `${left} d left`}` : "No target date"}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden" }}>
          <View style={{ width: `${progress}%`, height: 6, backgroundColor: color }} />
        </View>
        <Text style={{ width: 110, textAlign: "right", fontSize: 12, color: WEB.muted }}>{tasks ? `${done} of ${total} done · ${progress}%` : ""}</Text>
      </View>
    </Pressable>
  );
}
