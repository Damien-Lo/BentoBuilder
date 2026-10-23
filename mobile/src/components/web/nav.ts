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
  // Only for the admin.
  adminOnly?: boolean;
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
      { label: "Meal times", path: "/calendar/meal-times", also: ["/calendar/sessions"] },
    ],
  },
  {
    id: "kitchen",
    label: "Kitchen",
    icon: "restaurant-outline",
    // (The phone's four tabs: Log, the week plan; Recipes; Pantry, with the
    // receipts; and Plan, the hub for the menu, prep & shopping and the
    // grocery list — the old Overview's tasks on it.)
    path: "/planner",
    also: ["/kitchen"],
    tabs: [
      { label: "Log", path: "/planner" },
      { label: "Recipes", path: "/RecipesMainPage", also: ["/recipes", "/meals", "/restaurant-meals", "/archive"] },
      { label: "Pantry", path: "/PantryMainPage", also: ["/pantry", "/ingredients", "/receipts"] },
      { label: "Plan", path: "/plan", also: ["/kitchen", "/overview", "/menu", "/grocery-list"] },
    ],
  },
  {
    id: "gym",
    label: "Gym",
    icon: "barbell-outline",
    path: "/gym",
    tabs: [
      { label: "Overview", path: "/gym", exact: true, also: ["/gym/sessions", "/gym/session"] },
      { label: "Workouts", path: "/gym/workouts", also: ["/gym/workout", "/gym/build"] },
      { label: "Exercises", path: "/gym/exercises", also: ["/gym/exercise"] },
      { label: "Progress", path: "/gym/progress", also: ["/gym/records", "/gym/muscles", "/gym/volume", "/gym/history"] },
      { label: "Weekly plan", path: "/gym/plan" },
    ],
  },
  {
    // (Nutrition is part of Health, as on the phone.)
    id: "health",
    label: "Health",
    icon: "pulse-outline",
    path: "/health-section",
    tabs: [
      { label: "Overview", path: "/health-section", also: ["/health/about", "/health/section", "/health/today"] },
      { label: "Nutrition", path: "/health", exact: true },
      { label: "All nutrients", path: "/health/nutrients" },
      { label: "Weekly report", path: "/health/weekly-report" },
      { label: "Weight", path: "/health/weight" },
      { label: "Your burn", path: "/health/burn" },
      { label: "Your Targets", path: "/health/targets" },
    ],
  },
  {
    id: "lists",
    label: "Tasks",
    icon: "checkbox-outline",
    path: "/lists",
    // A single list's page: could be a checklist or a shopping list.
    also: ["/lists"],
    tabs: [
      { label: "Overview", path: "/lists", exact: true },
      { label: "Lists & projects", path: "/lists/tasks", also: ["/lists/task", "/lists/deleted"] },
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
    // (Its pages are a list down the left instead: settings/web/WebSettingsFrame.)
    tabs: [],
    footer: true,
  },
  {
    id: "developer",
    label: "Developer",
    icon: "construct-outline",
    path: "/developer/home",
    also: ["/developer"],
    tabs: [
      { label: "Overview", path: "/developer/home" },
      { label: "People", path: "/developer/people" },
      { label: "Data", path: "/developer/data" },
      { label: "Ingredients", path: "/developer/ingredients" },
      { label: "Suggestions", path: "/developer/suggestions" },
    ],
    footer: true,
  },
];

// Sections that exist only as a plan, shown as cards on the Home page.
export const WEB_COMING_SOON: { label: string; icon: IconName; text: string }[] = [
  { label: "Gym", icon: "barbell-outline", text: "Workout plans, logged sessions and progress over time." },
  { label: "Food recommender", icon: "sparkles-outline", text: "What to eat next, from your ratings, goals and what's in the pantry." },
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
const DESKTOP_PAGES = ["/", "/calendar", "/calendar/meal-times", "/calendar/sessions", "/kitchen", "/kitchen/needs", "/plan", "/menu", "/grocery-list", "/planner", "/RecipesMainPage", "/PantryMainPage", "/health", "/lists", "/lists/tasks", "/lists/checklists", "/lists/shopping", "/receipts", "/gym/plan", "/health-section"];

// Pages for one thing (its id in the path) that have a desktop layout.
const DESKTOP_PAGES_UNDER = [
  "/pantry/add_by_ingredient",
  "/pantry/edit/",
  "/pantry/location/",
  "/recipes/",
  "/meals/",
  "/restaurant-meals",
  "/ingredients/",
  "/receipts/review",
  "/archive",
  "/manage-lists",
  // (Health's own pages that have one; the rest are phone-shaped, centred.)
  "/health/nutrients",
  "/health/weight",
  "/health/weekly-report",
  "/settings-section/",
  "/developer/",
  "/lists/deleted",
  "/lists/task/",
  "/calendar/event/",
];

export function isDesktopPage(pathname: string, params: Record<string, unknown>): boolean {
  return DESKTOP_PAGES.includes(pathname) || DESKTOP_PAGES_UNDER.some((path) => pathname.startsWith(path));
}
