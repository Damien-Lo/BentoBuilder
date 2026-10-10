import { API_BASE_URL } from "@/src/config/api";
import { todayStr } from "@/src/utils/mealPlan";

export type SmartListId = "myday" | "important" | "planned" | "all";

export interface TodoGroup {
  _id: string;
  name: string;
  collapsed: boolean;
  order: number;
}

// "project": a tasks list planned as a whole (see TodoList's project fields).
export type TodoListType = "tasks" | "checklist" | "project";

export type ProjectStatus = "planning" | "active" | "on_hold" | "done";

// A named, ordered section of a project that its tasks are grouped into.
export interface ProjectPhase {
  _id: string;
  name: string;
  order: number;
}

export interface TodoList {
  _id: string;
  name: string;
  color: string;
  group: string | null;
  order: number;
  isDefault: boolean;
  // "checklist" = plain tickable lines; "tasks" = full tasks.
  type: TodoListType;
  // A checklist that's a shopping list (Shopping tab, not Checklists).
  shopping?: boolean;
  openCount?: number;
  // Projects only: the goal, the dates it runs between, where it stands,
  // and its phases.
  description?: string;
  startDate?: string | null;
  targetDate?: string | null;
  projectStatus?: ProjectStatus;
  phases?: ProjectPhase[];
}

export interface WorkBlock {
  _id: string;
  date: string; // YYYY-MM-DD
  startMinutes: number;
  endMinutes: number;
}

export type TaskStatus = "not_started" | "in_progress" | "on_hold" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

// An item in a list. In a checklist only the title and tick matter; in a
// tasks list it's a full task, and subtasks are tasks with a `parent`.
export interface TodoTask {
  _id: string;
  list: Pick<TodoList, "_id" | "name" | "color" | "isDefault" | "type">;
  parent: string | null;
  depth: number;
  // Short reference number ("#12"); older tasks may have none.
  number: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  completed: boolean;
  completedAt: string | null;
  priority: TaskPriority;
  important: boolean;
  myDayDate: string | null;
  dueDate: string | null;
  // The day you plan to work on it (the due date is when it must be done).
  doDate: string | null;
  // Time blocked out in the calendar to work on it.
  workBlocks: WorkBlock[];
  tags: string[];
  // "Relevant parties" — free-text names.
  parties: string[];
  note: string;
  // Hand-set 0–100, used only while there are no subtasks.
  manualProgress: number;
  // Its place among its siblings (top-level tasks of a list, or subtasks).
  order: number;
  // In a project: the phase it's in, when work on it starts (with the due
  // date, its span on the timeline), and whether it's a milestone — a
  // deliverable or checkpoint, a dated point rather than a stretch of work.
  phase?: string | null;
  startDate?: string | null;
  milestone?: boolean;
  showInCalendar: boolean;
  createdAt: string;
  // Worked out by the server: 0–100, and counts over every level below.
  progress: number;
  subtaskCount: number;
  openSubtaskCount: number;
}

export interface TodoSubtask extends TodoTask {
  subtasks: TodoSubtask[];
}

// One task opened on its own: with its subtask tree and the tasks above it.
export interface TodoTaskDetail extends TodoTask {
  subtasks: TodoSubtask[];
  ancestors: { _id: string; title: string; number: number | null }[];
}

export interface TodoDashboard {
  total: number;
  inProgress: number;
  completed: number;
  overdue: number;
  // Average progress across top-level tasks, 0–100.
  completion: number;
  recent: TodoTask[];
  overdueTasks: TodoTask[];
}

// A task or subtask switched on for the calendar.
export interface CalendarTask {
  _id: string;
  title: string;
  dueDate: string;
  depth: number;
  completed: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  number: number | null;
  root: { _id: string; title: string; number: number | null };
}

// A work block scheduled for a task, as the calendar draws it.
export interface CalendarTaskBlock extends CalendarTask {
  blockId: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
}

export interface CalendarTaskFeed {
  // Tasks switched on for the calendar, on their due date.
  deadlines: CalendarTask[];
  blocks: CalendarTaskBlock[];
}

export interface TodoOverview {
  groups: TodoGroup[];
  lists: TodoList[];
  smartCounts: Record<SmartListId, number>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/todo${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.message ?? `Request failed: ${response.status}`);
  }
  return json.data as T;
}

const body = (value: unknown) => JSON.stringify(value);

// "today" always comes from the phone, so My Day rolls over at local midnight.
export const getTodoOverview = () => request<TodoOverview>(`/overview?today=${todayStr()}`);

export const createTodoGroup = (name: string) => request<TodoGroup>("/groups", { method: "POST", body: body({ name }) });
export const updateTodoGroup = (id: string, changes: Partial<Pick<TodoGroup, "name" | "collapsed">>) =>
  request<TodoGroup>(`/groups/${id}`, { method: "PATCH", body: body(changes) });
export const deleteTodoGroup = (id: string) => request<void>(`/groups/${id}`, { method: "DELETE" });

export const createTodoList = (
  name: string,
  color: string,
  group: string | null = null,
  type: TodoListType = "tasks",
  shopping = false,
) => request<TodoList>("/lists", { method: "POST", body: body({ name, color, group, type, shopping }) });
export const updateTodoList = (id: string, changes: Partial<Pick<TodoList, "name" | "color" | "group" | "type" | "shopping">>) =>
  request<TodoList>(`/lists/${id}`, { method: "PATCH", body: body(changes) });
export const deleteTodoList = (id: string) => request<void>(`/lists/${id}`, { method: "DELETE" });

// --- Projects ---

export const createTodoProject = (name: string, color: string, group: string | null = null) =>
  request<TodoList>("/lists", { method: "POST", body: body({ name, color, group, type: "project" }) });
export const updateTodoProject = (
  id: string,
  changes: Partial<Pick<TodoList, "description" | "startDate" | "targetDate" | "projectStatus">>,
) => request<TodoList>(`/lists/${id}`, { method: "PATCH", body: body(changes) });
export const addProjectPhase = (listId: string, name: string) =>
  request<TodoList>(`/lists/${listId}/phases`, { method: "POST", body: body({ name }) });
export const renameProjectPhase = (listId: string, phaseId: string, name: string) =>
  request<TodoList>(`/lists/${listId}/phases/${phaseId}`, { method: "PATCH", body: body({ name }) });
// Its tasks stay, in no phase.
export const deleteProjectPhase = (listId: string, phaseId: string) =>
  request<TodoList>(`/lists/${listId}/phases/${phaseId}`, { method: "DELETE" });
// The plan as it stands after something moved: the phases in order, and/or
// each phase's top-level tasks in order (`phase: null` = in no phase).
export const saveProjectPlan = (listId: string, plan: { phases?: string[]; tasks?: { phase: string | null; ids: string[] }[] }) =>
  request<TodoList>(`/lists/${listId}/plan`, { method: "PATCH", body: body(plan) });
// A task that has outgrown being one becomes a project; its subtasks become
// the project's tasks.
export const turnTaskIntoProject = (taskId: string, group?: string | null) =>
  request<TodoList>(`/tasks/${taskId}/to-project`, { method: "POST", body: body(group === undefined ? {} : { group }) });
// After a drag on the Lists home: each moved list's new group and position.
export const reorderTodoLists = (items: { id: string; group: string | null; order: number }[]) =>
  request<void>("/lists/reorder", { method: "PATCH", body: body({ items }) });

export const getListTasks = (listId: string) => request<TodoTask[]>(`/tasks?list=${listId}`);
export const getSmartTasks = (smart: SmartListId) => request<TodoTask[]>(`/tasks?smart=${smart}&today=${todayStr()}`);
export const getTodoTask = (id: string) => request<TodoTaskDetail>(`/tasks/${id}`);
export const getTodoDashboard = () => request<TodoDashboard>(`/dashboard?today=${todayStr()}`);
export const getCalendarTasks = (from: string, to: string) => request<CalendarTaskFeed>(`/calendar?from=${from}&to=${to}`);
// Open tasks with no time scheduled today or later.
export const getUnscheduledTasks = () => request<CalendarTask[]>(`/unscheduled?today=${todayStr()}`);
// "Schedule task X from A to B" — adds a work block.
export const scheduleTodoTask = (id: string, block: Omit<WorkBlock, "_id">) =>
  request<WorkBlock[]>(`/tasks/${id}/blocks`, { method: "POST", body: body({ ...block, today: todayStr() }) });
// Moves one booking to another day or time.
export const moveTodoTaskBlock = (id: string, blockId: string, block: Partial<Omit<WorkBlock, "_id">>) =>
  request<WorkBlock[]>(`/tasks/${id}/blocks/${blockId}`, { method: "PATCH", body: body({ ...block, today: todayStr() }) });
export const unscheduleTodoTask = (id: string, blockId: string) =>
  request<WorkBlock[]>(`/tasks/${id}/blocks/${blockId}?today=${todayStr()}`, { method: "DELETE" });

// With `parent`, creates a subtask of that task.
export const createTodoTask = (input: {
  list?: string;
  parent?: string;
  title: string;
  important?: boolean;
  myDayDate?: string | null;
  dueDate?: string | null;
  doDate?: string | null;
  description?: string;
  phase?: string | null;
  startDate?: string | null;
  milestone?: boolean;
}) => request<TodoTask>("/tasks", { method: "POST", body: body(input) });

// Drag-and-drop: put a subtask (and everything under it) under `parent`,
// right after its sibling `after` — or first, when `after` is null.
export const moveTodoTask = (id: string, parent: string, after: string | null) =>
  request<void>(`/tasks/${id}/move`, { method: "POST", body: body({ parent, after }) });

export type TodoTaskChanges = Partial<
  Pick<
    TodoTask,
    | "title"
    | "description"
    | "status"
    | "completed"
    | "priority"
    | "important"
    | "myDayDate"
    | "dueDate"
    | "doDate"
    | "startDate"
    | "milestone"
    | "phase"
    | "tags"
    | "parties"
    | "note"
    | "manualProgress"
    | "showInCalendar"
  >
> & {
  // When completing: also complete every open subtask under it.
  completeSubtasks?: boolean;
};

export const updateTodoTask = (id: string, changes: TodoTaskChanges) =>
  request<TodoTask>(`/tasks/${id}`, { method: "PATCH", body: body(changes) });

// Moves the task and its subtasks to "Recently deleted" (kept 30 days).
export const deleteTodoTask = (id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" });

// One entry in "Recently deleted": a task as it was deleted, with the
// number of subtasks that went with it.
export interface DeletedTask {
  _id: string;
  title: string;
  number: number | null;
  depth: number;
  list: Pick<TodoList, "_id" | "name" | "color"> | null;
  // Set when what was deleted was a subtask.
  parentTitle: string | null;
  completed: boolean;
  deletedAt: string;
  subtaskCount: number;
  daysLeft: number;
}

export const getDeletedTasks = () => request<DeletedTask[]>("/deleted");
export const restoreTodoTask = (id: string) => request<void>(`/tasks/${id}/restore`, { method: "POST" });
// Gone for good — one entry, or the whole bin.
export const purgeDeletedTask = (id: string) => request<void>(`/deleted/${id}`, { method: "DELETE" });
export const emptyDeletedTasks = () => request<void>("/deleted", { method: "DELETE" });
