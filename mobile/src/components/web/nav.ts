import type { Ionicons } from "@expo/vector-icons";

// The desktop layout's map of the app: the sections on the rail, the pages
// (tabs) inside each, and which section and tab any route belongs to.

type IconName = keyof typeof Ionicons.glyphMap;

export interface WebTab {
  label: string;
  path: string;
  // Other routes that count as being on this tab (its detail pages).
  also?: string[];
  // Only its own path is this tab — not everything underneath it.
  exact?: boolean;
  // Shown with a "Planned" tag: the page is a design, not built yet.
  planned?: boolean;
}

export interface WebSection {
  id: string;
  label: string;
  icon: IconName;
  // Where the rail button goes.
  path: string;
  // Routes in this section that belong to no particular tab.
  also?: string[];
  tabs: WebTab[];
  // Sits at the foot of the rail.
  footer?: boolean;
}

export const WEB_SECTIONS: WebSection[] = [
  { id: "home", label: "Home", icon: "grid-outline", path: "/", tabs: [] },
  {
    id: "calendar",
    label: "Calendar",
    icon: "calendar-clear-outline",
    path: "/calendar",
    tabs: [
      { label: "Calendar", path: "/calendar", also: ["/calendar/edit", "/calendar/event"] },
      { label: "Meal times", path: "/calendar/meal-times" },
    ],
  },
  {
    id: "kitchen",
    label: "Kitchen",
    icon: "restaurant-outline",
    path: "/planner",
    also: ["/archive"],
    tabs: [
      { label: "Week plan", path: "/planner" },
      { label: "Recipes & meals", path: "/RecipesMainPage", also: ["/recipes", "/meals", "/restaurant-meals"] },
      { label: "Pantry", path: "/PantryMainPage", also: ["/pantry", "/ingredients"] },
      { label: "Grocery list", path: "/grocery-list" },
      { label: "Receipts", path: "/receipts", planned: true },
    ],
  },
  {
    id: "nutrition",
    label: "Nutrition",
    icon: "pie-chart-outline",
    path: "/health",
    tabs: [
      { label: "Overview", path: "/health", exact: true },
      { label: "All nutrients", path: "/health/nutrients" },
      { label: "Weight", path: "/health/weight" },
      { label: "Weekly report", path: "/health/weekly-report" },
      { label: "Goals", path: "/health/goals" },
    ],
  },
  {
    id: "lists",
    label: "Lists",
    icon: "checkbox-outline",
    path: "/lists/tasks",
    // A single list's page: could be a checklist or a shopping list.
    also: ["/lists"],
    tabs: [
      { label: "Tasks", path: "/lists/tasks", also: ["/lists/task", "/lists/deleted"] },
      { label: "Overview", path: "/lists", exact: true },
      { label: "Checklists", path: "/lists/checklists" },
      { label: "Shopping", path: "/lists/shopping" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings-outline",
    path: "/settings-section/kitchen",
    also: ["/settings-section", "/manage-lists"],
    tabs: [],
    footer: true,
  },
  {
    id: "developer",
    label: "Developer",
    icon: "construct-outline",
    path: "/developer/home",
    also: ["/developer"],
    tabs: [],
    footer: true,
  },
];

// Sections that exist only as a plan, shown as cards on the Home page.
export const WEB_COMING_SOON: { label: string; icon: IconName; text: string }[] = [
  { label: "Gym", icon: "barbell-outline", text: "Workout plans, logged sessions and progress over time." },
  { label: "Food recommender", icon: "sparkles-outline", text: "What to eat next, from your ratings, goals and what's in the pantry." },
  { label: "Projects", icon: "git-network-outline", text: "Whole project timelines: phases, milestones and the time booked against them." },
  { label: "Documents", icon: "document-text-outline", text: "Store and organise your files." },
];

const matches = (pathname: string, candidate: string) =>
  candidate === "/" ? pathname === "/" : pathname === candidate || pathname.startsWith(`${candidate}/`);

// Which section, and which of its tabs, `pathname` is in. The longest
// matching route wins, so "/lists/tasks" is the Tasks tab, not Overview
// ("/lists"), and a tab's own path beats a looser "also".
export function resolveWebRoute(pathname: string): { section: WebSection | null; tab: WebTab | null; exactTab: boolean } {
  let section: WebSection | null = null;
  let tab: WebTab | null = null;
  let best = -1;
  let exactTab = false;
  for (const s of WEB_SECTIONS) {
    for (const candidate of [s.path, ...(s.also ?? [])]) {
      if (matches(pathname, candidate) && candidate.length > best) {
        best = candidate.length;
        section = s;
        tab = null;
        exactTab = false;
      }
    }
    for (const t of s.tabs) {
      for (const candidate of [t.path, ...(t.also ?? [])]) {
        if (t.exact && candidate === t.path && pathname !== t.path) continue;
        // (>=: a tab wins a tie with its section's own path.)
        if (matches(pathname, candidate) && candidate.length >= best) {
          best = candidate.length;
          section = s;
          tab = t;
          exactTab = pathname === t.path;
        }
      }
    }
  }
  return { section, tab, exactTab };
}

// Pages laid out for the desktop, given the whole pane. Everything else is
// a phone-shaped page, shown as a column in the middle.
const DESKTOP_PAGES = ["/", "/calendar", "/planner", "/RecipesMainPage", "/PantryMainPage", "/health", "/lists/tasks", "/receipts"];

export function isDesktopPage(pathname: string, params: Record<string, unknown>): boolean {
  // The planner opened to add food is the phone's own add sheet.
  if (pathname === "/planner" && params.add) return false;
  return DESKTOP_PAGES.includes(pathname);
}
