import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { daysBetween } from "@/src/components/calendar/calendarUtils";
import { DatePickerModal } from "@/src/components/forms";
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
  type TodoList,
  type TodoTask,
} from "@/src/services/todoApi";
import { todayStr } from "@/src/utils/mealPlan";

import { ProgressBar } from "./TaskBits";
import { TextPromptModal } from "./TextPromptModal";
import { friendlyDate, showActions, type TodoTheme } from "./theme";
import { TimelineTab } from "./web/WebProjectView";

// A project on the phone. The page stays a list you tick things off and add
// to; what makes it a project is folded away until it's wanted:
//
//   the strip under the    status, target date and progress in one line;
//   title (ProjectSummary) tap it for the goal, the dates, the timeline and
//                          adding a phase;
//   phase headings         the tasks sit under their phase, each heading
//                          with a + (add a task to it) and a menu;
//   holding a task         make it a milestone, move it up or down, or to
//                          another phase.
//
// Start date, milestone and phase are also on the task's own page.

const NONE = "none";

const STATUS: Record<ProjectStatus, { label: string; fg: string; bg: string }> = {
  planning: { label: "Planning", fg: "#475569", bg: "#F1F5F9" },
  active: { label: "Active", fg: "#1D4ED8", bg: "#DBEAFE" },
  on_hold: { label: "On hold", fg: "#B45309", bg: "#FEF3C7" },
  done: { label: "Done", fg: "#047857", bg: "#D1FAE5" },
};

type Prompt = { kind: "renamePhase"; phase: ProjectPhase } | { kind: "addTo"; phase: ProjectPhase };

// A project's phases in order, and its tasks by phase.
function planOf(project: TodoList, tasks: TodoTask[]) {
  const phases = [...(project.phases ?? [])].sort((a, b) => a.order - b.order);
  const phaseIds = new Set(phases.map((p) => p._id));
  const phaseOf = (task: TodoTask) => (task.phase && phaseIds.has(task.phase) ? task.phase : NONE);
  const inPhase = (id: string) => tasks.filter((t) => phaseOf(t) === id).sort((a, b) => a.order - b.order);
  return { phases, phaseOf, inPhase };
}

// The project in one line, under its title: status, target date and
// progress. Tapped, it opens the goal, the dates, the timeline and "Add a
// phase".
export function ProjectSummary({
  project,
  tasks,
  accent,
  theme,
  onOpenTask,
  onChanged,
}: {
  project: TodoList;
  tasks: TodoTask[];
  accent: string;
  theme: TodoTheme;
  onOpenTask: (task: TodoTask) => void;
  onChanged: () => void;
}) {
  const today = todayStr();
  const insets = useSafeAreaInsets();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addingPhase, setAddingPhase] = useState(false);
  const [picking, setPicking] = useState<"startDate" | "targetDate" | null>(null);
  const [timeline, setTimeline] = useState(false);
  const [goal, setGoal] = useState(project.description ?? "");
  useEffect(() => setGoal(project.description ?? ""), [project.description]);

  const fail = (error: unknown) => {
    Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong.");
    onChanged();
  };
  const { phases, inPhase } = planOf(project, tasks);
  const done = tasks.filter((t) => t.completed).length;
  const progress = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + (t.completed ? 100 : t.progress ?? 0), 0) / tasks.length) : 0;
  const status = STATUS[project.projectStatus ?? "planning"];
  const left = project.targetDate ? daysBetween(today, project.targetDate) : null;
  const setProject = (changes: Parameters<typeof updateTodoProject>[1]) => void updateTodoProject(project._id, changes).then(onChanged, fail);

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: theme.rowDivider }}>
      {/* The project in one line; tap for the rest. */}
      <View>
        <Pressable onPress={() => setDetailsOpen((v) => !v)} className="active:opacity-70" style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: status.bg }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: status.fg }}>{status.label}</Text>
            </View>
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 13, fontWeight: left !== null && left < 0 ? "700" : "500", color: left !== null && left < 0 ? theme.danger : theme.textMuted }}>
              {project.targetDate ? `${friendlyDate(project.targetDate)} · ${left! < 0 ? `${-left!} d late` : left === 0 ? "today" : `${left} d left`}` : "No target date"}
            </Text>
            <Text style={{ marginRight: 6, fontSize: 13, fontWeight: "700", color: theme.text }}>{progress}%</Text>
            <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.icon} />
          </View>
          <View style={{ marginTop: 10 }}>
            <ProgressBar value={progress} color={accent} />
          </View>
          <Text style={{ marginTop: 6, fontSize: 12, color: theme.textFaint }}>
            {done} of {tasks.length} done{phases.length ? ` · ${phases.length} phase${phases.length === 1 ? "" : "s"}` : ""}
          </Text>
        </Pressable>

        {detailsOpen && (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.rowDivider }}>
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textMuted }}>GOAL</Text>
              <TextInput
                value={goal}
                onChangeText={setGoal}
                onBlur={() => goal !== (project.description ?? "") && setProject({ description: goal })}
                placeholder="What this project is for, and what done looks like"
                placeholderTextColor="#94A3B8"
                multiline
                style={{ marginTop: 4, minHeight: 44, fontSize: 15, lineHeight: 21, color: theme.text }}
              />
            </View>
            <DetailRow
              theme={theme}
              icon="pulse-outline"
              label="Status"
              value={status.label}
              onPress={() =>
                showActions(
                  "Status",
                  (Object.keys(STATUS) as ProjectStatus[]).map((key) => ({ label: key === (project.projectStatus ?? "planning") ? `${STATUS[key].label} ✓` : STATUS[key].label, onPress: () => setProject({ projectStatus: key }) })),
                )
              }
            />
            <DetailRow theme={theme} icon="flag-outline" label="Start date" value={project.startDate ? friendlyDate(project.startDate) : "None"} faint={!project.startDate} onPress={() => setPicking("startDate")} onClear={project.startDate ? () => setProject({ startDate: null }) : undefined} />
            <DetailRow theme={theme} icon="calendar-outline" label="Target date" value={project.targetDate ? friendlyDate(project.targetDate) : "None"} faint={!project.targetDate} onPress={() => setPicking("targetDate")} onClear={project.targetDate ? () => setProject({ targetDate: null }) : undefined} />
            <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: theme.rowDivider }}>
              <Pressable onPress={() => setTimeline(true)} className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 py-3 active:bg-slate-200">
                <Ionicons name="analytics-outline" size={17} color="#334155" />
                <Text className="ml-2 text-sm font-semibold text-slate-700">Timeline</Text>
              </Pressable>
              <Pressable onPress={() => setAddingPhase(true)} className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 py-3 active:bg-slate-200">
                <Ionicons name="layers-outline" size={17} color="#334155" />
                <Text className="ml-2 text-sm font-semibold text-slate-700">Add a phase</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <TextPromptModal
        visible={addingPhase}
        title="New phase"
        placeholder="e.g. Research, Drafting, Review"
        confirmLabel="Add"
        onCancel={() => setAddingPhase(false)}
        onSubmit={(value) => {
          setAddingPhase(false);
          addProjectPhase(project._id, value).then(onChanged, fail);
        }}
      />

      <DatePickerModal
        visible={picking !== null}
        title={picking === "startDate" ? "Start date" : "Target date"}
        value={(picking ? project[picking] : null) ?? today}
        onCancel={() => setPicking(null)}
        onConfirm={(value) => {
          const field = picking;
          setPicking(null);
          if (field) setProject({ [field]: value });
        }}
      />

      {/* The timeline, over the page */}
      <Modal visible={timeline} animationType="slide" onRequestClose={() => setTimeline(false)}>
        {/* (Padded by hand: a modal is outside the page's safe area.) */}
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: theme.bg }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6 }}>
            <Pressable onPress={() => setTimeline(false)} accessibilityLabel="Close" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close" size={26} color={theme.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: "700", color: theme.title }}>
                Timeline
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 13, color: theme.textMuted }}>
                {project.name}
              </Text>
            </View>
          </View>
          <TimelineTab
            compact
            project={project}
            tasks={tasks}
            phases={phases}
            inPhase={inPhase}
            accent={accent}
            today={today}
            onOpenTask={(id) => {
              const task = tasks.find((t) => t._id === id);
              setTimeline(false);
              if (task) onOpenTask(task);
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

export function ProjectPlan({
  project,
  tasks,
  accent,
  theme,
  renderTask,
  onOpenTask,
  onChanged,
}: {
  project: TodoList;
  // The project's top-level tasks, done ones included.
  tasks: TodoTask[];
  accent: string;
  theme: TodoTheme;
  // Draws one open task; `onLongPress` opens its place-in-the-plan menu.
  renderTask: (task: TodoTask, onLongPress: () => void) => ReactNode;
  onOpenTask: (task: TodoTask) => void;
  // Something was saved: reload the project and its tasks.
  onChanged: () => void;
}) {
  const [closed, setClosed] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const fail = (error: unknown) => {
    Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong.");
    onChanged();
  };

  const { phases, phaseOf, inPhase } = planOf(project, tasks);
  const openIn = (id: string) => inPhase(id).filter((t) => !t.completed);

  // Saves where every task sits, with one phase's open tasks in a new order.
  function savePlan(change: (plan: Map<string, TodoTask[]>) => void) {
    const plan = new Map<string, TodoTask[]>([NONE, ...phases.map((p) => p._id)].map((id) => [id, openIn(id)]));
    change(plan);
    saveProjectPlan(project._id, {
      tasks: [...plan].map(([phase, open]) => ({
        phase: phase === NONE ? null : phase,
        // (Ticked-off tasks keep their phase, after the open ones.)
        ids: [...open, ...inPhase(phase).filter((t) => t.completed && !open.includes(t))].map((t) => t._id),
      })),
    }).then(onChanged, fail);
  }

  function taskMenu(task: TodoTask) {
    const here = phaseOf(task);
    const siblings = openIn(here);
    const index = siblings.findIndex((t) => t._id === task._id);
    const swap = (by: -1 | 1) =>
      savePlan((plan) => {
        const list = plan.get(here)!;
        [list[index], list[index + by]] = [list[index + by], list[index]];
      });
    const moveTo = (phase: string) =>
      savePlan((plan) => {
        plan.set(
          here,
          plan.get(here)!.filter((t) => t._id !== task._id),
        );
        plan.get(phase)!.push(task);
      });
    showActions(task.title, [
      { label: "Open", onPress: () => onOpenTask(task) },
      { label: task.milestone ? "Make it an ordinary task" : "Make it a milestone", onPress: () => void updateTodoTask(task._id, { milestone: !task.milestone }).then(onChanged, fail) },
      ...(index > 0 ? [{ label: "Move up", onPress: () => swap(-1) }] : []),
      ...(index < siblings.length - 1 ? [{ label: "Move down", onPress: () => swap(1) }] : []),
      ...phases.filter((p) => p._id !== here).map((p) => ({ label: `Move to ${p.name}`, onPress: () => moveTo(p._id) })),
      ...(here !== NONE ? [{ label: "Take out of its phase", onPress: () => moveTo(NONE) }] : []),
    ]);
  }

  function phaseMenu(phase: ProjectPhase) {
    const order = phases.map((p) => p._id);
    const index = order.indexOf(phase._id);
    const move = (by: -1 | 1) => {
      [order[index], order[index + by]] = [order[index + by], order[index]];
      saveProjectPlan(project._id, { phases: order }).then(onChanged, fail);
    };
    const count = inPhase(phase._id).length;
    showActions(phase.name, [
      { label: "Add a task to it", onPress: () => setPrompt({ kind: "addTo", phase }) },
      { label: "Rename", onPress: () => setPrompt({ kind: "renamePhase", phase }) },
      ...(index > 0 ? [{ label: "Move up", onPress: () => move(-1) }] : []),
      ...(index < order.length - 1 ? [{ label: "Move down", onPress: () => move(1) }] : []),
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

  return (
    <View>
      {/* Tasks in no phase come first, plainly; then each phase under its heading. */}
      {openIn(NONE).map((task) => (
        <View key={task._id}>{renderTask(task, () => taskMenu(task))}</View>
      ))}

      {phases.map((phase) => {
        const all = inPhase(phase._id);
        const open = all.filter((t) => !t.completed);
        const shut = closed.includes(phase._id);
        return (
          <View key={phase._id} style={{ marginTop: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", height: 40 }}>
              <Pressable onPress={() => setClosed((prev) => (shut ? prev.filter((id) => id !== phase._id) : [...prev, phase._id]))} style={{ flex: 1, flexDirection: "row", alignItems: "center", height: 40 }}>
                <Ionicons name={shut ? "chevron-forward" : "chevron-down"} size={16} color={theme.icon} />
                <Text numberOfLines={1} style={{ flexShrink: 1, marginLeft: 6, fontSize: 15, fontWeight: "700", color: theme.text }}>
                  {phase.name}
                </Text>
                <Text style={{ marginLeft: 8, fontSize: 13, color: theme.textFaint }}>
                  {all.length - open.length}/{all.length}
                </Text>
              </Pressable>
              <Pressable onPress={() => setPrompt({ kind: "addTo", phase })} accessibilityLabel={`Add a task to ${phase.name}`} hitSlop={6} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="add" size={22} color={accent} />
              </Pressable>
              <Pressable onPress={() => phaseMenu(phase)} accessibilityLabel={`${phase.name} options`} hitSlop={6} style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="ellipsis-horizontal" size={18} color={theme.icon} />
              </Pressable>
            </View>
            {!shut && open.map((task) => <View key={task._id}>{renderTask(task, () => taskMenu(task))}</View>)}
            {!shut && open.length === 0 && (
              <Text style={{ marginBottom: 8, paddingLeft: 22, fontSize: 13, color: theme.textFaint }}>{all.length ? "All done here." : "Nothing in this phase yet. Tap + to add to it."}</Text>
            )}
          </View>
        );
      })}

      <TextPromptModal
        visible={prompt !== null}
        title={prompt?.kind === "renamePhase" ? "Rename phase" : prompt ? `Add to ${prompt.phase.name}` : ""}
        placeholder={prompt?.kind === "addTo" ? "Task" : "e.g. Research, Drafting, Review"}
        initialValue={prompt?.kind === "renamePhase" ? prompt.phase.name : ""}
        confirmLabel={prompt?.kind === "renamePhase" ? "Save" : "Add"}
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => {
          const current = prompt;
          setPrompt(null);
          if (current?.kind === "renamePhase") renameProjectPhase(project._id, current.phase._id, value).then(onChanged, fail);
          else if (current) createTodoTask({ list: project._id, title: value, phase: current.phase._id }).then(onChanged, fail);
        }}
      />

    </View>
  );
}

function DetailRow({
  theme,
  icon,
  label,
  value,
  faint,
  onPress,
  onClear,
}: {
  theme: TodoTheme;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  faint?: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:bg-slate-50" style={{ flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.rowDivider }}>
      <Ionicons name={icon} size={18} color={theme.icon} />
      <Text style={{ flex: 1, marginLeft: 12, fontSize: 15, color: theme.text }}>{label}</Text>
      <Text style={{ fontSize: 15, color: faint ? theme.textFaint : theme.text }}>{value}</Text>
      {onClear ? (
        <Pressable hitSlop={10} onPress={onClear} style={{ marginLeft: 8 }}>
          <Ionicons name="close-circle" size={18} color="#94A3B8" />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 4 }} />
      )}
    </Pressable>
  );
}
