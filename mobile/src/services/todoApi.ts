import { API_BASE_URL } from "@/src/config/api";
import { todayStr } from "@/src/utils/mealPlan";

export type SmartListId = "myday" | "important" | "planned" | "all";

export interface TodoGroup {
  _id: string;
  name: string;
  collapsed: boolean;
  order: number;
}

export interface TodoList {
  _id: string;
  name: string;
  color: string;
  group: string | null;
  order: number;
  isDefault: boolean;
  openCount?: number;
}

export interface TodoStep {
  _id?: string;
  title: string;
  completed: boolean;
}

export type TodoRepeatFrequency = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface TodoRepeat {
  frequency: TodoRepeatFrequency;
  interval: number;
}

export interface TodoTask {
  _id: string;
  list: Pick<TodoList, "_id" | "name" | "color" | "isDefault">;
  title: string;
  completed: boolean;
  completedAt: string | null;
  important: boolean;
  myDayDate: string | null;
  dueDate: string | null;
  repeat: TodoRepeat | null;
  steps: TodoStep[];
  note: string;
  createdAt: string;
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

export const createTodoList = (name: string, color: string, group: string | null = null) =>
  request<TodoList>("/lists", { method: "POST", body: body({ name, color, group }) });
export const updateTodoList = (id: string, changes: Partial<Pick<TodoList, "name" | "color" | "group">>) =>
  request<TodoList>(`/lists/${id}`, { method: "PATCH", body: body(changes) });
export const deleteTodoList = (id: string) => request<void>(`/lists/${id}`, { method: "DELETE" });
// After a drag on the Lists home: each moved list's new group and position.
export const reorderTodoLists = (items: { id: string; group: string | null; order: number }[]) =>
  request<void>("/lists/reorder", { method: "PATCH", body: body({ items }) });

export const getListTasks = (listId: string) => request<TodoTask[]>(`/tasks?list=${listId}`);
export const getSmartTasks = (smart: SmartListId) => request<TodoTask[]>(`/tasks?smart=${smart}&today=${todayStr()}`);
export const getTodoTask = (id: string) => request<TodoTask>(`/tasks/${id}`);

export const createTodoTask = (input: {
  list?: string;
  title: string;
  important?: boolean;
  myDayDate?: string | null;
  dueDate?: string | null;
}) => request<TodoTask>("/tasks", { method: "POST", body: body(input) });

export type TodoTaskChanges = Partial<
  Pick<TodoTask, "title" | "completed" | "important" | "myDayDate" | "dueDate" | "repeat" | "steps" | "note">
>;

// Completing a repeating task also returns the next occurrence the server
// created.
export async function updateTodoTask(id: string, changes: TodoTaskChanges): Promise<{ task: TodoTask; next: TodoTask | null }> {
  const response = await fetch(`${API_BASE_URL}/api/todo/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body({ ...changes, today: todayStr() }),
  });
  const json = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: TodoTask; next?: TodoTask | null; message?: string }
    | null;
  if (!response.ok || !json?.success || !json.data) {
    throw new Error(json?.message ?? `Request failed: ${response.status}`);
  }
  return { task: json.data, next: json.next ?? null };
}

export const deleteTodoTask = (id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" });
