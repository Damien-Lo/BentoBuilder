import { Ionicons } from "@expo/vector-icons";
import { ActionSheetIOS, Alert, Platform } from "react-native";

import type { SmartListId } from "@/src/services/todoApi";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

// The Lists section's colours — the same Tailwind slate/blue palette the
// rest of the app uses (bg-slate-50 pages, white bordered cards, slate
// text, blue-600 accent), kept as values here rather than classNames
// because icons, borders and per-list accents need real colours too.
export interface TodoTheme {
  dark: boolean;
  bg: string;          // page background (slate-50)
  headerBg: string;    // header / bottom bars (white)
  card: string;        // cards (white)
  cardBorder: string;  // card outline (slate-200)
  rowDivider: string;  // between rows inside a card (slate-100)
  detailBg: string;    // task detail page
  title: string;       // page titles (slate-950)
  text: string;        // body text (slate-900)
  textMuted: string;   // secondary text (slate-500)
  textFaint: string;   // counts, placeholders (slate-400)
  icon: string;        // neutral icons (slate-600)
  separator: string;   // lines outside cards, group guide line (slate-200)
  circle: string;      // unchecked task circle (slate-400)
  pill: string;        // "Completed" pill (slate-100)
  danger: string;      // overdue (red-600)
}

const APP_THEME: TodoTheme = {
  dark: false,
  bg: "#F8FAFC",
  headerBg: "#FFFFFF",
  card: "#FFFFFF",
  cardBorder: "#E2E8F0",
  rowDivider: "#F1F5F9",
  detailBg: "#F8FAFC",
  title: "#020617",
  text: "#0F172A",
  textMuted: "#64748B",
  textFaint: "#94A3B8",
  icon: "#475569",
  separator: "#E2E8F0",
  circle: "#94A3B8",
  pill: "#F1F5F9",
  danger: "#DC2626",
};

export function useTodoTheme(): TodoTheme {
  return APP_THEME;
}

// List theme colours — Tailwind 600 shades, matching the app's accents
// (blue-600 is the app-wide primary).
export const TODO_LIST_COLORS: Record<string, { name: string; value: string }> = {
  blue:   { name: "Blue",   value: "#2563EB" },
  red:    { name: "Red",    value: "#DC2626" },
  orange: { name: "Orange", value: "#EA580C" },
  amber:  { name: "Amber",  value: "#D97706" },
  yellow: { name: "Yellow", value: "#CA8A04" },
  green:  { name: "Green",  value: "#16A34A" },
  teal:   { name: "Teal",   value: "#0D9488" },
  sky:    { name: "Sky",    value: "#0EA5E9" },
  indigo: { name: "Indigo", value: "#4F46E5" },
  purple: { name: "Purple", value: "#7C3AED" },
  pink:   { name: "Pink",   value: "#DB2777" },
  gray:   { name: "Gray",   value: "#64748B" },
};

export function listAccent(color: string | undefined, _theme?: TodoTheme): string {
  return (TODO_LIST_COLORS[color ?? "blue"] ?? TODO_LIST_COLORS.blue).value;
}

export const SMART_LISTS: {
  id: SmartListId;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string; // TODO_LIST_COLORS key used for its icon and title
}[] = [
  { id: "myday", name: "My Day", icon: "sunny-outline", color: "amber" },
  { id: "important", name: "Important", icon: "star-outline", color: "pink" },
  { id: "planned", name: "Planned", icon: "calendar-outline", color: "teal" },
  { id: "all", name: "All", icon: "infinite-outline", color: "orange" },
];

// --- Dates ---

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayOffset(dateStr: string): number {
  return Math.round((parseLocalDate(dateStr).getTime() - parseLocalDate(todayStr()).getTime()) / 86400000);
}

// "Today", "Tomorrow", "Yesterday", else "Wed, 30 Sep".
export function friendlyDate(dateStr: string): string {
  const offset = dayOffset(dateStr);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  const d = parseLocalDate(dateStr);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function isOverdue(dateStr: string): boolean {
  return dayOffset(dateStr) < 0;
}

// "Saturday, 26 September" — My Day's subtitle.
export function longToday(): string {
  const d = new Date();
  return `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`;
}

// "Tue, 15 Sep" from an ISO timestamp.
export function shortDateFromIso(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const REPEAT_LABELS: Record<string, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

// --- A native action menu (iOS action sheet; a plain alert elsewhere) ---

export interface ActionOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export function showActions(title: string, options: ActionOption[]) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => o.label), "Cancel"],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: options.map((o, i) => (o.destructive ? i : -1)).filter((i) => i >= 0),
      },
      (index) => {
        if (index < options.length) options[index].onPress();
      },
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? ("destructive" as const) : ("default" as const) })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}
