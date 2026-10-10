import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { addDays, daysBetween, MONTHS_SHORT, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { Choice, compactDate, DateField } from "@/src/components/web/fields";
import { Card, Empty, Segmented, WEB } from "@/src/components/web/ui";
import { themeColor } from "@/src/components/web/theme";
import {
  addProjectPhase,
  createTodoTask,
  deleteProjectPhase,
  renameProjectPhase,
  saveProjectPlan,
  updateTodoProject,
  updateTodoTask,
  type ProjectPhase,
  type ProjectStatus,
  type TaskStatus,
  type TodoList,
  type TodoTask,
  type TodoTaskChanges,
} from "@/src/services/todoApi";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

import { StatusPill, TaskNumber } from "../TaskBits";
import { TextPromptModal } from "../TextPromptModal";
import { showActions, TASK_STATUS_META, TASK_STATUSES } from "../theme";

// A dot for booked time: dark on the light theme, light on the dark one.
const BOOKED = themeColor("15,23,42", "226,232,240");

// A project on the desktop: a list planned as a whole. Three ways to look
// at it — Overview (the goal, where it stands, what's coming), Plan (its
// tasks by phase, in order, with dates) and Timeline (those tasks laid
// against the calendar). Its tasks are ordinary tasks: opening one shows
// the usual task panel beside this.

type Hover = { hovered?: boolean };
type Tab = "overview" | "plan" | "timeline";

const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; fg: string; bg: string }> = {
  planning: { label: "Planning", fg: "#475569", bg: "#F1F5F9" },
  active: { label: "Active", fg: "#1D4ED8", bg: "#DBEAFE" },
  on_hold: { label: "On hold", fg: "#B45309", bg: "#FEF3C7" },
  done: { label: "Done", fg: "#047857", bg: "#D1FAE5" },
};
const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_META) as ProjectStatus[];

// "No phase" in maps and lists.
const NONE = "none";

export function WebProjectView({
  project,
  tasks: loadedTasks,
  groupName,
  accent,
  selectedTaskId,
  weekStartDay,
  onOpenTask,
  onChanged,
  onOptions,
}: {
  project: TodoList;
  // Its top-level tasks, done ones included.
  tasks: TodoTask[];
  groupName?: string;
  accent: string;
  selectedTaskId?: string;
  weekStartDay: number;
  onOpenTask: (id: string) => void;
  // Something was saved: reload the project and its tasks.
  onChanged: () => void;
  onOptions: () => void;
}) {
  const today = todayStr();
  const [tab, setTab] = useState<Tab>("plan");
  // Shown at once while a change saves; replaced by what comes back.
  const [tasks, setTasks] = useState(loadedTasks);
  useEffect(() => setTasks(loadedTasks), [loadedTasks]);
  const [prompt, setPrompt] = useState<{ kind: "newPhase" } | { kind: "renamePhase"; phase: ProjectPhase } | null>(null);

  const phases = useMemo(() => [...(project.phases ?? [])].sort((a, b) => a.order - b.order), [project.phases]);
  const phaseIds = new Set(phases.map((p) => p._id));
  const phaseOf = (task: TodoTask) => (task.phase && phaseIds.has(task.phase) ? task.phase : NONE);
  const inPhase = (id: string) => tasks.filter((t) => phaseOf(t) === id).sort((a, b) => a.order - b.order);

  const fail = (error: unknown) => {
    Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong.");
    onChanged();
  };

  function patchTask(task: TodoTask, changes: TodoTaskChanges) {
    setTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, ...changes } : t)));
    updateTodoTask(task._id, changes).then(onChanged, fail);
  }

  // Ticking off a task that still has open subtasks warns first.
  function toggleDone(task: TodoTask) {
    const complete = (completeSubtasks: boolean) => {
      setTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, completed: !task.completed } : t)));
      updateTodoTask(task._id, { completed: !task.completed, completeSubtasks }).then(onChanged, fail);
    };
    if (!task.completed && task.openSubtaskCount > 0) {
      const n = task.openSubtaskCount;
      Alert.alert("Complete with open subtasks?", `"${task.title}" still has ${n} open subtask${n === 1 ? "" : "s"}. Completing it will complete ${n === 1 ? "it" : "them"} too.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Complete all", onPress: () => complete(true) },
      ]);
    } else complete(false);
  }

  // Saves where every task sits after one was moved.
  function savePlan(next: Map<string, TodoTask[]>) {
    const flat: TodoTask[] = [];
    // (Numbered straight through the plan, as the server does.)
    for (const [phase, list] of next) list.forEach((t) => flat.push({ ...t, phase: phase === NONE ? null : phase, order: flat.length }));
    setTasks(flat);
    saveProjectPlan(project._id, {
      tasks: [...next].map(([phase, list]) => ({ phase: phase === NONE ? null : phase, ids: list.map((t) => t._id) })),
    }).then(onChanged, fail);
  }
  const currentPlan = () => new Map<string, TodoTask[]>([NONE, ...phases.map((p) => p._id)].map((id) => [id, inPhase(id)]));

  function moveWithin(task: TodoTask, by: -1 | 1) {
    const plan = currentPlan();
    const list = plan.get(phaseOf(task))!;
    const index = list.findIndex((t) => t._id === task._id);
    const target = index + by;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    savePlan(plan);
  }

  function moveToPhase(task: TodoTask, phase: string) {
    const plan = currentPlan();
    plan.set(phaseOf(task), plan.get(phaseOf(task))!.filter((t) => t._id !== task._id));
    plan.get(phase)!.push(task);
    savePlan(plan);
  }

  function movePhase(phase: ProjectPhase, by: -1 | 1) {
    const order = phases.map((p) => p._id);
    const index = order.indexOf(phase._id);
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    saveProjectPlan(project._id, { phases: order }).then(onChanged, fail);
  }

  function taskMenu(task: TodoTask) {
    const here = phaseOf(task);
    showActions(task.title, [
      { label: "Open", onPress: () => onOpenTask(task._id) },
      {
        label: task.milestone ? "Make it an ordinary task" : "Make it a milestone",
        onPress: () => patchTask(task, { milestone: !task.milestone }),
      },
      ...phases.filter((p) => p._id !== here).map((p) => ({ label: `Move to ${p.name}`, onPress: () => moveToPhase(task, p._id) })),
      ...(here !== NONE ? [{ label: "Take out of its phase", onPress: () => moveToPhase(task, NONE) }] : []),
    ]);
  }

  function phaseMenu(phase: ProjectPhase) {
    const count = inPhase(phase._id).length;
    showActions(phase.name, [
      { label: "Rename", onPress: () => setPrompt({ kind: "renamePhase", phase }) },
      { label: "Move up", onPress: () => movePhase(phase, -1) },
      { label: "Move down", onPress: () => movePhase(phase, 1) },
      {
        label: "Delete phase",
        destructive: true,
        onPress: () =>
          Alert.alert(`Delete "${phase.name}"?`, count ? `Its ${count} task${count === 1 ? "" : "s"} stay in the project, in no phase.` : undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => void deleteProjectPhase(project._id, phase._id).then(onChanged, fail) },
          ]),
      },
    ]);
  }

  const done = tasks.filter((t) => t.completed).length;
  const progress = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + (t.completed ? 100 : t.progress ?? 0), 0) / tasks.length) : 0;
  const status = project.projectStatus ?? "planning";
  const statusMeta = PROJECT_STATUS_META[status];
  const late = !!project.targetDate && project.targetDate < today && status !== "done";

  return (
    <View style={{ flex: 1, backgroundColor: WEB.page }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 28, paddingTop: 20, paddingBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            {!!groupName && <Text style={{ marginBottom: 2, fontSize: 12, fontWeight: "600", color: WEB.muted }}>{groupName}  ›  Project</Text>}
            <Text numberOfLines={1} style={{ fontSize: 26, fontWeight: "700", color: accent }}>
              {project.name}
            </Text>
          </View>
          <Segmented
            options={[
              { value: "overview", label: "Overview" },
              { value: "plan", label: "Plan" },
              { value: "timeline", label: "Timeline" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Pressable
            onPress={onOptions}
            accessibilityLabel="Project options"
            style={({ hovered }: Hover) => ({ marginLeft: 8, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#E2E8F0" : "transparent" })}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#475569" />
          </Pressable>
        </View>

        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <Choice
            value={status}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_META[s].label, color: PROJECT_STATUS_META[s].fg }))}
            onChange={(next) => void updateTodoProject(project._id, { projectStatus: next }).then(onChanged, fail)}
            renderTrigger={(open) => (
              <Pressable onPress={open} style={{ flexDirection: "row", alignItems: "center", height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: statusMeta.bg }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: statusMeta.fg }}>{statusMeta.label}</Text>
                <Ionicons name="chevron-down" size={12} color={statusMeta.fg} style={{ marginLeft: 4 }} />
              </Pressable>
            )}
          />
          <DateField value={project.startDate} placeholder="Start date" weekStartDay={weekStartDay} onChange={(d) => void updateTodoProject(project._id, { startDate: d }).then(onChanged, fail)} />
          <Ionicons name="arrow-forward" size={14} color={WEB.faint} />
          <DateField
            value={project.targetDate}
            placeholder="Target date"
            danger={late}
            weekStartDay={weekStartDay}
            onChange={(d) => void updateTodoProject(project._id, { targetDate: d }).then(onChanged, fail)}
          />
          {late && <Text style={{ fontSize: 12, fontWeight: "600", color: WEB.red }}>past its target</Text>}
          <View style={{ flex: 1, minWidth: 160, maxWidth: 320, marginLeft: 6 }}>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ flex: 1, fontSize: 12, color: WEB.muted }}>
                {done} of {tasks.length} done
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: WEB.text }}>{progress}%</Text>
            </View>
            <View style={{ marginTop: 4, height: 6, borderRadius: 3, backgroundColor: "#E2E8F0", overflow: "hidden" }}>
              <View style={{ width: `${progress}%`, height: 6, backgroundColor: accent }} />
            </View>
          </View>
        </View>
      </View>

      {tab === "overview" && (
        <OverviewTab project={project} tasks={tasks} phases={phases} inPhase={inPhase} accent={accent} today={today} onOpenTask={onOpenTask} onChanged={onChanged} fail={fail} />
      )}

      {tab === "plan" && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 48 }}>
          {[...(inPhase(NONE).length || phases.length === 0 ? [null] : []), ...phases].map((phase) => {
            const id = phase?._id ?? NONE;
            const rows = inPhase(id);
            const finished = rows.filter((t) => t.completed).length;
            return (
              <View key={id} style={{ marginBottom: 18, backgroundColor: WEB.card, borderWidth: 1, borderColor: WEB.border, borderRadius: 14, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", alignItems: "center", height: 42, paddingLeft: 14, paddingRight: 6, backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderBottomColor: WEB.border }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: phase ? WEB.text : WEB.muted }}>{phase?.name ?? (phases.length ? "Not in a phase yet" : "Tasks")}</Text>
                  <Text style={{ flex: 1, marginLeft: 10, fontSize: 12, color: WEB.muted }}>
                    {finished} of {rows.length} done
                  </Text>
                  <Text style={{ width: COL.status, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: WEB.faint }}>STATUS</Text>
                  <Text style={{ width: COL.date, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: WEB.faint }}>START</Text>
                  <Text style={{ width: COL.date, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: WEB.faint }}>DUE</Text>
                  <View style={{ width: COL.actions, alignItems: "flex-end" }}>
                    {phase && (
                      <Pressable
                        onPress={() => phaseMenu(phase)}
                        accessibilityLabel={`${phase.name} options`}
                        style={({ hovered }: Hover) => ({ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#E2E8F0" : "transparent" })}
                      >
                        <Ionicons name="ellipsis-horizontal" size={16} color="#64748B" />
                      </Pressable>
                    )}
                  </View>
                </View>

                {rows.map((task, index) => (
                  <PlanRow
                    key={task._id}
                    task={task}
                    accent={accent}
                    today={today}
                    weekStartDay={weekStartDay}
                    selected={selectedTaskId === task._id}
                    first={index === 0}
                    last={index === rows.length - 1}
                    onOpen={() => onOpenTask(task._id)}
                    onToggle={() => toggleDone(task)}
                    onPatch={(changes) => patchTask(task, changes)}
                    onMove={(by) => moveWithin(task, by)}
                    onMenu={() => taskMenu(task)}
                  />
                ))}

                <AddRow
                  placeholder={phase ? `Add a task to ${phase.name}` : "Add a task"}
                  onAdd={(title, milestone) =>
                    void createTodoTask({ list: project._id, title, phase: phase?._id ?? null, milestone }).then(onChanged, fail)
                  }
                />
              </View>
            );
          })}

          <Pressable
            onPress={() => setPrompt({ kind: "newPhase" })}
            style={({ hovered }: Hover) => ({
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              height: 36,
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "#94A3B8",
              backgroundColor: hovered ? "#F1F5F9" : "transparent",
            })}
          >
            <Ionicons name="add" size={16} color="#475569" />
            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: "#475569" }}>Add a phase</Text>
          </Pressable>
        </ScrollView>
      )}

      {tab === "timeline" && (
        <TimelineTab project={project} tasks={tasks} phases={phases} inPhase={inPhase} accent={accent} today={today} selectedTaskId={selectedTaskId} onOpenTask={onOpenTask} />
      )}

      <TextPromptModal
        visible={prompt != null}
        title={prompt?.kind === "renamePhase" ? "Rename phase" : "New phase"}
        placeholder="e.g. Research, Drafting, Review"
        initialValue={prompt?.kind === "renamePhase" ? prompt.phase.name : ""}
        confirmLabel={prompt?.kind === "renamePhase" ? "Save" : "Add"}
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => {
          const current = prompt;
          setPrompt(null);
          if (current?.kind === "renamePhase") renameProjectPhase(project._id, current.phase._id, name).then(onChanged, fail);
          else addProjectPhase(project._id, name).then(onChanged, fail);
        }}
      />
    </View>
  );
}

// ── Plan ─────────────────────────────────────────────────────────────────────

const COL = { status: 124, date: 108, actions: 96 };

function PlanRow({
  task,
  accent,
  today,
  weekStartDay,
  selected,
  first,
  last,
  onOpen,
  onToggle,
  onPatch,
  onMove,
  onMenu,
}: {
  task: TodoTask;
  accent: string;
  today: string;
  weekStartDay: number;
  selected: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onPatch: (changes: TodoTaskChanges) => void;
  onMove: (by: -1 | 1) => void;
  onMenu: () => void;
}) {
  const overdue = !task.completed && !!task.dueDate && task.dueDate < today;
  return (
    <Pressable
      onPress={onOpen}
      style={({ hovered }: Hover) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: 44,
        paddingLeft: 4,
        paddingRight: 6,
        borderBottomWidth: 1,
        borderBottomColor: WEB.line,
        backgroundColor: selected ? "#EFF6FF" : hovered ? "#F8FAFC" : "#FFFFFF",
      })}
    >
      <Pressable onPress={onToggle} accessibilityLabel={task.completed ? "Mark as not done" : "Mark as done"} style={{ width: 38, height: 40, alignItems: "center", justifyContent: "center" }}>
        {({ hovered }: Hover) => (
          <Ionicons name={task.completed ? "checkmark-circle" : hovered ? "checkmark-circle-outline" : "ellipse-outline"} size={20} color={task.completed || hovered ? accent : "#94A3B8"} />
        )}
      </Pressable>

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingRight: 10 }}>
        {task.milestone && <Ionicons name="diamond" size={13} color={accent} style={{ marginRight: 7 }} />}
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, fontSize: 14, fontWeight: task.milestone ? "700" : "500", color: task.completed ? WEB.faint : WEB.text, textDecorationLine: task.completed ? "line-through" : "none" }}
        >
          {task.title}
        </Text>
        <View style={{ marginLeft: 7 }}>
          <TaskNumber number={task.number} />
        </View>
        {task.subtaskCount > 0 && (
          <Text style={{ marginLeft: 8, fontSize: 12, color: WEB.muted }}>
            {task.subtaskCount - task.openSubtaskCount}/{task.subtaskCount}
          </Text>
        )}
        {task.workBlocks.length > 0 && (
          <View style={{ marginLeft: 8, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="time-outline" size={12} color={WEB.muted} />
            <Text style={{ marginLeft: 2, fontSize: 12, color: WEB.muted }}>{task.workBlocks.length}</Text>
          </View>
        )}
      </View>

      <View style={{ width: COL.status, alignItems: "flex-start" }}>
        <Choice
          value={task.status}
          options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_META[s].label, color: TASK_STATUS_META[s].fg }))}
          onChange={(next: TaskStatus) => onPatch({ status: next })}
          renderTrigger={(open) => (
            <Pressable onPress={open}>
              <StatusPill status={task.status} />
            </Pressable>
          )}
        />
      </View>
      <View style={{ width: COL.date }}>
        {/* A milestone is a point in time: it has a date, not a span. */}
        {task.milestone ? <Text style={{ paddingHorizontal: 6, fontSize: 13, color: WEB.faint }}>—</Text> : <DateField bare value={task.startDate} placeholder="Start" weekStartDay={weekStartDay} onChange={(d) => onPatch({ startDate: d })} />}
      </View>
      <View style={{ width: COL.date }}>
        <DateField bare value={task.dueDate} placeholder={task.milestone ? "Date" : "Due"} danger={overdue} weekStartDay={weekStartDay} onChange={(d) => onPatch({ dueDate: d })} align="right" />
      </View>

      <View style={{ width: COL.actions, flexDirection: "row", justifyContent: "flex-end" }}>
        <RowIcon icon="arrow-up" label="Move up" disabled={first} onPress={() => onMove(-1)} />
        <RowIcon icon="arrow-down" label="Move down" disabled={last} onPress={() => onMove(1)} />
        <RowIcon icon="ellipsis-horizontal" label="More" onPress={onMenu} />
      </View>
    </Pressable>
  );
}

function RowIcon({ icon, label, disabled, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ hovered }: Hover) => ({ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.25 : 1, backgroundColor: hovered && !disabled ? "#E2E8F0" : "transparent" })}
    >
      <Ionicons name={icon} size={15} color="#64748B" />
    </Pressable>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string, milestone: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [milestone, setMilestone] = useState(false);
  const submit = () => {
    const text = title.trim();
    if (!text) return;
    onAdd(text, milestone);
    setTitle("");
    setMilestone(false);
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: 42, paddingLeft: 13, paddingRight: 8 }}>
      <Ionicons name={milestone ? "diamond-outline" : "add"} size={milestone ? 15 : 18} color="#94A3B8" />
      <TextInput
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        placeholder={milestone ? placeholder.replace("a task", "a milestone") : placeholder}
        placeholderTextColor="#94A3B8"
        style={{ flex: 1, marginLeft: 10, height: 34, fontSize: 14, color: WEB.text, outlineStyle: "none" } as object}
      />
      <Pressable
        onPress={() => setMilestone((v) => !v)}
        style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: milestone ? "#EFF6FF" : hovered ? "#F1F5F9" : "transparent" })}
      >
        <Ionicons name="diamond-outline" size={12} color={milestone ? WEB.blueDark : "#64748B"} />
        <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: "600", color: milestone ? WEB.blueDark : "#64748B" }}>Milestone</Text>
      </Pressable>
      {!!title.trim() && (
        <Pressable onPress={submit} style={({ hovered }: Hover) => ({ marginLeft: 6, height: 28, paddingHorizontal: 12, justifyContent: "center", borderRadius: 14, backgroundColor: hovered ? WEB.blueDark : WEB.blue })}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>Add</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({
  project,
  tasks,
  phases,
  inPhase,
  accent,
  today,
  onOpenTask,
  onChanged,
  fail,
}: {
  project: TodoList;
  tasks: TodoTask[];
  phases: ProjectPhase[];
  inPhase: (id: string) => TodoTask[];
  accent: string;
  today: string;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
  fail: (error: unknown) => void;
}) {
  const [goal, setGoal] = useState(project.description ?? "");
  useEffect(() => setGoal(project.description ?? ""), [project._id, project.description]);

  const open = tasks.filter((t) => !t.completed);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const soon = addDays(today, 14);
  const upcoming = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= soon).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const milestones = tasks.filter((t) => t.milestone).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const bookedMinutes = tasks.reduce((sum, t) => sum + t.workBlocks.reduce((s, b) => s + (b.endMinutes - b.startMinutes), 0), 0);
  const undated = open.filter((t) => !t.dueDate && !t.startDate).length;
  const daysLeft = project.targetDate ? daysBetween(today, project.targetDate) : null;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 48 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View style={{ flex: 1.3, minWidth: 360, gap: 16 }}>
          <Card title="Goal" subtitle="What this project is for, and what done looks like">
            <TextInput
              value={goal}
              onChangeText={setGoal}
              onBlur={() => goal.trim() !== (project.description ?? "") && void updateTodoProject(project._id, { description: goal.trim() }).then(onChanged, fail)}
              placeholder="Describe the outcome you're after…"
              placeholderTextColor="#94A3B8"
              multiline
              style={{ minHeight: 96, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", padding: 10, fontSize: 14, lineHeight: 20, color: WEB.text, textAlignVertical: "top" }}
            />
          </Card>

          <Card title="Phases" subtitle={phases.length ? "How far along each one is" : "Add phases on the Plan tab to group the work"} padded={false}>
            {phases.length === 0 ? (
              <Empty icon="layers-outline" text="No phases yet" />
            ) : (
              <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
                {phases.map((phase) => {
                  const rows = inPhase(phase._id);
                  const finished = rows.filter((t) => t.completed).length;
                  const pct = rows.length ? (finished / rows.length) * 100 : 0;
                  return (
                    <View key={phase._id} style={{ marginTop: 12 }}>
                      <View style={{ flexDirection: "row" }}>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: WEB.body }}>{phase.name}</Text>
                        <Text style={{ fontSize: 12, color: WEB.muted }}>
                          {finished} of {rows.length}
                        </Text>
                      </View>
                      <View style={{ marginTop: 5, height: 7, borderRadius: 4, backgroundColor: "#EEF2F7", overflow: "hidden" }}>
                        <View style={{ width: `${pct}%`, height: 7, backgroundColor: accent }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        </View>

        <View style={{ flex: 1, minWidth: 320, gap: 16 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {TASK_STATUSES.map((s) => (
              <Fact key={s} label={TASK_STATUS_META[s].label} value={String(tasks.filter((t) => t.status === s).length)} color={TASK_STATUS_META[s].fg} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Fact label="Overdue" value={String(overdue.length)} color={overdue.length ? WEB.red : undefined} />
            <Fact
              label={daysLeft == null ? "No target date" : daysLeft >= 0 ? "Days to target" : "Days past target"}
              value={daysLeft == null ? "—" : String(Math.abs(daysLeft))}
              color={daysLeft != null && daysLeft < 0 ? WEB.red : undefined}
            />
            <Fact label="Time booked" value={bookedMinutes ? `${Math.round((bookedMinutes / 60) * 10) / 10} h` : "—"} />
            <Fact label="No dates yet" value={String(undated)} />
          </View>

          <Card title="Milestones" subtitle="Deliverables and checkpoints" padded={false}>
            {milestones.length === 0 ? <Empty icon="diamond-outline" text="No milestones yet" /> : <TaskLines tasks={milestones} today={today} accent={accent} onOpenTask={onOpenTask} />}
          </Card>

          <Card title={overdue.length ? "Overdue and coming up" : "Coming up"} subtitle="Due in the next two weeks" padded={false}>
            {overdue.length + upcoming.length === 0 ? <Empty icon="calendar-outline" text="Nothing due in the next two weeks" /> : <TaskLines tasks={[...overdue, ...upcoming]} today={today} accent={accent} onOpenTask={onOpenTask} />}
          </Card>
        </View>
      </View>
    </ScrollView>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 110, backgroundColor: WEB.card, borderWidth: 1, borderColor: WEB.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: color ?? WEB.text }}>{value}</Text>
      <Text style={{ marginTop: 1, fontSize: 12, color: WEB.muted }}>{label}</Text>
    </View>
  );
}

function TaskLines({ tasks, today, accent, onOpenTask }: { tasks: TodoTask[]; today: string; accent: string; onOpenTask: (id: string) => void }) {
  return (
    <View style={{ paddingBottom: 8 }}>
      {tasks.map((task) => {
        const overdue = !task.completed && !!task.dueDate && task.dueDate < today;
        return (
          <Pressable
            key={task._id}
            onPress={() => onOpenTask(task._id)}
            style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 7, backgroundColor: hovered ? "#F8FAFC" : "transparent" })}
          >
            <Ionicons name={task.completed ? "checkmark-circle" : task.milestone ? "diamond" : "ellipse-outline"} size={14} color={task.completed ? WEB.green : task.milestone ? accent : WEB.faint} />
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 14, color: task.completed ? WEB.faint : WEB.text, textDecorationLine: task.completed ? "line-through" : "none" }}>
              {task.title}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: overdue ? "700" : "400", color: overdue ? WEB.red : WEB.muted }}>{task.dueDate ? compactDate(task.dueDate) : "No date"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const LABELS = 260;
const ROW = 34;

function TimelineTab({
  project,
  tasks,
  phases,
  inPhase,
  accent,
  today,
  selectedTaskId,
  onOpenTask,
}: {
  project: TodoList;
  tasks: TodoTask[];
  phases: ProjectPhase[];
  inPhase: (id: string) => TodoTask[];
  accent: string;
  today: string;
  selectedTaskId?: string;
  onOpenTask: (id: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);

  // A task's place on the calendar: a milestone is its one date; otherwise
  // start to due, or a single day when only one of them is set.
  const spanOf = (task: TodoTask): { from: string; to: string } | null => {
    if (task.milestone) {
      const at = task.dueDate ?? task.startDate;
      return at ? { from: at, to: at } : null;
    }
    const from = task.startDate ?? task.dueDate;
    const to = task.dueDate ?? task.startDate;
    return from && to ? { from: from <= to ? from : to, to: to >= from ? to : from } : null;
  };

  const dated = tasks.filter((t) => spanOf(t));
  const undated = tasks.filter((t) => !spanOf(t));
  const points = [today, project.startDate, project.targetDate, ...dated.flatMap((t) => [spanOf(t)!.from, spanOf(t)!.to])].filter((d): d is string => !!d).sort();
  // A few days of margin, and at least five weeks so it never looks cramped.
  const first = addDays(points[0], -3);
  const last = (() => {
    const end = addDays(points[points.length - 1], 4);
    return daysBetween(first, end) < 35 ? addDays(first, 35) : end;
  })();
  const days = daysBetween(first, last) + 1;
  const dayWidth = Math.max(16, Math.min(46, width > LABELS ? (width - LABELS) / days : 24));
  const x = (date: string) => daysBetween(first, date) * dayWidth;
  const allDays = Array.from({ length: days }, (_, i) => addDays(first, i));

  useEffect(() => {
    // Open with today a little in from the left.
    if (width > 0) scroller.current?.scrollTo({ x: Math.max(0, x(today) - 120), animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width > 0, project._id]);

  const sections = [...(inPhase(NONE).some((t) => spanOf(t)) || phases.length === 0 ? [null] : []), ...phases];
  const months: { key: string; label: string; left: number; width: number }[] = [];
  for (const day of allDays) {
    const key = day.slice(0, 7);
    const d = parseLocalDate(day);
    const lastMonth = months[months.length - 1];
    if (lastMonth?.key === key) lastMonth.width += dayWidth;
    else months.push({ key, label: `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`, left: x(day), width: dayWidth });
  }

  const barColor = (task: TodoTask) => (task.completed ? "#10B981" : task.status === "in_progress" ? accent : task.status === "on_hold" ? "#D97706" : "#94A3B8");

  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingBottom: 20 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 56)}>
      {tasks.length === 0 ? (
        <Empty icon="analytics-outline" text="Add tasks on the Plan tab, give them dates, and they'll be laid out here" />
      ) : (
        <View style={{ flex: 1, backgroundColor: WEB.card, borderWidth: 1, borderColor: WEB.border, borderRadius: 14, overflow: "hidden" }}>
          <ScrollView>
            <View style={{ flexDirection: "row" }}>
              {/* Names, down the left */}
              <View style={{ width: LABELS, borderRightWidth: 1, borderRightColor: WEB.border }}>
                <View style={{ height: 52, borderBottomWidth: 1, borderBottomColor: WEB.border, backgroundColor: "#F8FAFC" }} />
                {sections.map((phase) => {
                  const rows = inPhase(phase?._id ?? NONE).filter((t) => spanOf(t));
                  return (
                    <View key={phase?._id ?? NONE}>
                      <View style={{ height: ROW, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#F1F5F9" }}>
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: WEB.body }}>
                          {phase?.name ?? (phases.length ? "Not in a phase yet" : "Tasks")}
                        </Text>
                      </View>
                      {rows.map((task) => (
                        <Pressable
                          key={task._id}
                          onPress={() => onOpenTask(task._id)}
                          style={({ hovered }: Hover) => ({ height: ROW, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, backgroundColor: selectedTaskId === task._id ? "#EFF6FF" : hovered ? "#F8FAFC" : "#FFFFFF" })}
                        >
                          <Ionicons name={task.completed ? "checkmark-circle" : task.milestone ? "diamond" : "ellipse-outline"} size={13} color={task.completed ? WEB.green : task.milestone ? accent : WEB.faint} />
                          <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 13, color: task.completed ? WEB.faint : WEB.text }}>
                            {task.title}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>

              {/* The calendar, scrolling sideways */}
              <ScrollView ref={scroller} horizontal style={{ flex: 1 }} showsHorizontalScrollIndicator>
                <View style={{ width: days * dayWidth }}>
                  {/* Months, then days */}
                  <View style={{ height: 52, borderBottomWidth: 1, borderBottomColor: WEB.border, backgroundColor: "#F8FAFC" }}>
                    <View style={{ height: 24 }}>
                      {months.map((m) => (
                        <View key={m.key} style={{ position: "absolute", left: m.left, width: m.width, height: 24, justifyContent: "center", paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: WEB.border }}>
                          <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: WEB.body }}>
                            {m.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ height: 28, flexDirection: "row" }}>
                      {allDays.map((day) => {
                        const d = parseLocalDate(day);
                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                        const isToday = day === today;
                        // Narrow days only name the Mondays.
                        const show = dayWidth >= 26 || d.getDay() === 1 || isToday;
                        return (
                          <View key={day} style={{ width: dayWidth, alignItems: "center", justifyContent: "center", backgroundColor: isToday ? "#DBEAFE" : weekend ? "#F1F5F9" : "transparent" }}>
                            {show && (
                              <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: isToday ? "700" : "500", color: isToday ? WEB.blueDark : WEB.muted }}>
                                {dayWidth >= 26 ? `${WEEKDAYS_SHORT[d.getDay()][0]} ${d.getDate()}` : d.getDate()}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Weekend shading, today, and the target date, behind the rows */}
                  <View pointerEvents="none" style={{ position: "absolute", top: 52, bottom: 0, left: 0, right: 0 }}>
                    {allDays.map((day) => {
                      const d = parseLocalDate(day).getDay();
                      return d === 0 || d === 6 ? <View key={day} style={{ position: "absolute", left: x(day), width: dayWidth, top: 0, bottom: 0, backgroundColor: "rgba(241,245,249,0.6)" }} /> : null;
                    })}
                    {!!project.targetDate && (
                      <View style={{ position: "absolute", left: x(project.targetDate) + dayWidth, top: 0, bottom: 0, borderLeftWidth: 2, borderStyle: "dashed", borderColor: "#94A3B8" }} />
                    )}
                    <View style={{ position: "absolute", left: x(today) + dayWidth / 2 - 1, top: 0, bottom: 0, width: 2, backgroundColor: "#EF4444" }} />
                  </View>

                  {sections.map((phase) => {
                    const rows = inPhase(phase?._id ?? NONE).filter((t) => spanOf(t));
                    return (
                      <View key={phase?._id ?? NONE}>
                        <View style={{ height: ROW, backgroundColor: "rgba(241,245,249,0.85)" }} />
                        {rows.map((task) => {
                          const span = spanOf(task)!;
                          const color = barColor(task);
                          const overdue = !task.completed && !!task.dueDate && task.dueDate < today;
                          return (
                            <View key={task._id} style={{ height: ROW, borderBottomWidth: 1, borderBottomColor: WEB.line }}>
                              {task.milestone ? (
                                <Pressable
                                  onPress={() => onOpenTask(task._id)}
                                  accessibilityLabel={task.title}
                                  style={{ position: "absolute", left: x(span.from) + dayWidth / 2 - 9, top: (ROW - 18) / 2, width: 18, height: 18, alignItems: "center", justifyContent: "center" }}
                                >
                                  <View style={{ width: 13, height: 13, backgroundColor: task.completed ? "#10B981" : overdue ? WEB.red : accent, transform: [{ rotate: "45deg" }], borderRadius: 2 }} />
                                </Pressable>
                              ) : (
                                <Pressable
                                  onPress={() => onOpenTask(task._id)}
                                  accessibilityLabel={task.title}
                                  style={({ hovered }: Hover) => ({
                                    position: "absolute",
                                    left: x(span.from) + 2,
                                    width: Math.max(dayWidth - 4, (daysBetween(span.from, span.to) + 1) * dayWidth - 4),
                                    top: 7,
                                    height: ROW - 15,
                                    borderRadius: 6,
                                    overflow: "hidden",
                                    backgroundColor: color,
                                    opacity: hovered ? 0.85 : 1,
                                    borderWidth: overdue || selectedTaskId === task._id ? 2 : 0,
                                    borderColor: overdue ? WEB.red : "#1D4ED8",
                                  })}
                                >
                                  {/* How far through it is, as a darker stretch from the left. */}
                                  {!task.completed && (task.progress ?? 0) > 0 && <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${task.progress}%`, backgroundColor: "rgba(15,23,42,0.22)" }} />}
                                </Pressable>
                              )}
                              {/* Days with time booked for it */}
                              {task.workBlocks.map((block) =>
                                block.date >= first && block.date <= last ? (
                                  <View key={block._id} pointerEvents="none" style={{ position: "absolute", left: x(block.date) + dayWidth / 2 - 2.5, top: ROW - 7, width: 5, height: 5, borderRadius: 3, backgroundColor: BOOKED }} />
                                ) : null,
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* What can't be placed yet */}
            {undated.length > 0 && (
              <View style={{ borderTopWidth: 1, borderTopColor: WEB.border, padding: 12 }}>
                <Text style={{ marginBottom: 8, fontSize: 12, fontWeight: "700", color: WEB.muted }}>NO DATES YET · {undated.length}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {undated.map((task) => (
                    <Pressable
                      key={task._id}
                      onPress={() => onOpenTask(task._id)}
                      style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#CBD5E1", backgroundColor: hovered ? "#F1F5F9" : "#FFFFFF" })}
                    >
                      {task.milestone && <Ionicons name="diamond-outline" size={11} color={accent} style={{ marginRight: 5 }} />}
                      <Text style={{ fontSize: 12, color: task.completed ? WEB.faint : WEB.body }}>{task.title}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={{ marginTop: 8, fontSize: 12, color: WEB.faint }}>Give these a start or due date on the Plan tab to place them on the timeline.</Text>
              </View>
            )}
          </ScrollView>

          {/* Key */}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14, paddingHorizontal: 12, height: 34, borderTopWidth: 1, borderTopColor: WEB.border, backgroundColor: "#F8FAFC" }}>
            <Key color="#94A3B8" label="Not started" />
            <Key color={accent} label="In progress" />
            <Key color="#D97706" label="On hold" />
            <Key color="#10B981" label="Completed" />
            <Key diamond color={accent} label="Milestone" />
            <Key dot color={BOOKED} label="Time booked" />
            <Key line color="#EF4444" label="Today" />
            <Key line dashed color="#94A3B8" label="Target" />
          </View>
        </View>
      )}
    </View>
  );
}

function Key({ color, label, diamond, dot, line, dashed }: { color: string; label: string; diamond?: boolean; dot?: boolean; line?: boolean; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {diamond ? (
        <View style={{ width: 9, height: 9, backgroundColor: color, transform: [{ rotate: "45deg" }], borderRadius: 1 }} />
      ) : dot ? (
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      ) : line ? (
        <View style={{ height: 12, borderLeftWidth: 2, borderStyle: dashed ? "dashed" : "solid", borderColor: color }} />
      ) : (
        <View style={{ width: 16, height: 8, borderRadius: 3, backgroundColor: color }} />
      )}
      <Text style={{ marginLeft: 6, fontSize: 11, color: WEB.muted }}>{label}</Text>
    </View>
  );
}
