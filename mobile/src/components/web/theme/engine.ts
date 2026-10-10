// Dark mode for the browser, done in one place instead of in every screen.
//
// The app's colours are written as light-theme values — Tailwind classes
// (`bg-white`, `text-slate-900`) and style values (`"#E2E8F0"`) — in every
// screen, the phone's included. Rather than give each of them a second
// colour, the dark theme is a translation of the light one, made where
// colours turn into CSS:
//
//   style values   react-native-web normalises every colour in a style
//                  through one function. On web that function is swapped
//                  (metro.config.js) for `./normalizeValueWithProperty`,
//                  which writes the colour as `rgba(var(--bb-…, r,g,b), a)`
//                  and records what that variable is in the dark;
//   classes        the Tailwind stylesheet is read once it's on the page
//                  and a matching dark rule is written for each rule that
//                  sets a colour.
//
// Both ask `darkColor` below: given what a colour is used for (a
// background, text, a border) it answers with the dark-theme colour, or
// null to leave it alone. With the theme off none of the variables or
// rules apply, and every colour is exactly what was written.
//
// Nothing here may import react-native: this file is loaded from inside
// react-native-web while that is still starting up.

export type Role = "bg" | "fg" | "bd";
export type RGB = readonly [number, number, number];
export type WebThemeChoice = "system" | "light" | "dark";

// --- The dark palette ---

const PAGE: RGB = [11, 17, 32]; // behind everything (slate-50 in the light theme)
const SURFACE: RGB = [19, 28, 46]; // cards, bars, panels (white)

// Neutrals (white, the slates and greys) by how light the original is:
// [lightness, dark colour]. Between two rows the colour is blended.
const NEUTRAL: Record<Role, readonly (readonly [number, RGB])[]> = {
  // Cards are lifted off the page, fills and hovers are lighter still, and
  // the light theme's dark blocks stay visible as blocks.
  bg: [
    [1, SURFACE],
    [0.99, [23, 33, 52]],
    [0.98, PAGE],
    [0.961, [27, 38, 57]],
    [0.951, [31, 43, 63]],
    [0.914, [37, 50, 72]],
    [0.839, [50, 65, 91]],
    [0.651, [84, 98, 122]],
    [0.455, [88, 102, 127]],
    [0.337, [72, 86, 110]],
    [0.267, [62, 76, 99]],
    [0.173, [55, 68, 91]],
    [0.112, [51, 65, 85]],
    [0.02, [40, 52, 71]],
  ],
  // Dark text becomes light and keeps its rank: titles brightest, hints
  // dimmest. Text that was already light (on a coloured button) stays.
  fg: [
    [0.91, [56, 69, 91]],
    [0.839, [76, 90, 113]],
    [0.651, [112, 126, 149]],
    [0.455, [143, 155, 175]],
    [0.337, [170, 181, 198]],
    [0.267, [196, 205, 218]],
    [0.173, [214, 221, 231]],
    [0.112, [230, 235, 242]],
    [0, [232, 237, 244]],
  ],
  bd: [
    [1, SURFACE],
    [0.98, [24, 34, 52]],
    [0.961, [31, 42, 61]],
    [0.914, [43, 56, 78]],
    [0.839, [58, 72, 96]],
    [0.651, [85, 99, 123]],
    [0.455, [100, 116, 139]],
    [0.337, [133, 147, 168]],
    [0.267, [160, 172, 190]],
    [0.112, [203, 213, 225]],
    [0, [226, 232, 240]],
  ],
};

// Colours that don't follow the rules above.
const EXACT: Record<Role, Record<string, RGB>> = {
  bg: {
    // React Navigation's own page colour, behind every screen.
    "242,242,242": PAGE,
    // A barely-blue white used for table headings.
    "248,251,255": [23, 33, 52],
  },
  fg: {},
  bd: {},
};

function toHsl([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const h = max === rn ? ((gn - bn) / d + 6) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function neutralAt(table: readonly (readonly [number, RGB])[], lightness: number): RGB {
  if (lightness >= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [low, lowColor] = table[i];
    if (lightness >= low) {
      const [high, highColor] = table[i - 1];
      const t = (lightness - low) / (high - low);
      return [0, 1, 2].map((c) => Math.round(lowColor[c] + (highColor[c] - lowColor[c]) * t)) as unknown as RGB;
    }
  }
  return table[table.length - 1][1];
}

// Is this a grey (slate counts) rather than a colour? Near white, the
// palest tints (blue-50) differ from the greys by very little, so the
// allowance for colour narrows as it gets lighter.
function isNeutral(rgb: RGB, lightness: number): boolean {
  const chroma = Math.max(...rgb) - Math.min(...rgb);
  const allowed = lightness >= 0.9 ? 4 + (1 - lightness) * 130 : lightness >= 0.8 ? 17 + (0.9 - lightness) * 150 : 45;
  return chroma <= allowed;
}

/**
 * The dark theme's colour for `rgb` used as `role`, or null to keep it.
 * `alpha` matters only for backgrounds: a see-through dark one is a scrim
 * and stays dark.
 */
export function darkColor(role: Role, rgb: RGB, alpha = 1): RGB | null {
  const exact = EXACT[role][rgb.join(",")];
  if (exact) return exact;
  const [h, s, l] = toHsl(rgb);
  const chroma = Math.max(...rgb) - Math.min(...rgb);

  if (isNeutral(rgb, l)) {
    if (role === "bg") {
      // Black is a backdrop (the camera, a photo), not a block.
      if (l === 0 || (alpha < 1 && l < 0.5)) return null;
      return neutralAt(NEUTRAL.bg, l);
    }
    if (role === "fg") return l >= 0.94 ? null : neutralAt(NEUTRAL.fg, l);
    return neutralAt(NEUTRAL.bd, l);
  }

  if (role === "bg") {
    // Solid colours (a button, a bar, a calendar's own colour) stay. Pale
    // ones are tints of the page, so they become dark tints.
    if (l <= 0.75) return null;
    return fromHsl(h, clamp(0.3 + (chroma / 255) * 1.6, 0.3, 0.62), 0.17 + (1 - l) * 0.55);
  }
  if (role === "fg") {
    // Coloured text was dark enough to read on white; now it has to be
    // light enough to read on the dark.
    if (l >= 0.6) return null;
    return fromHsl(h, Math.min(s, 0.95), clamp(1.15 - l, 0.6, 0.8));
  }
  if (l <= 0.75) return null;
  return fromHsl(h, clamp(s * 0.6, 0.25, 0.6), 0.24 + (1 - l) * 0.7);
}

// --- Style values (see ./normalizeValueWithProperty) ---

const STYLE_ROLE: Record<string, Role> = {
  backgroundColor: "bg",
  color: "fg",
  textDecorationColor: "fg",
  borderColor: "bd",
  borderTopColor: "bd",
  borderRightColor: "bd",
  borderBottomColor: "bd",
  borderLeftColor: "bd",
};

const hasDocument = typeof document !== "undefined";
// What react-native-web turns every colour into.
const RN_COLOR = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/;
const seen = new Map<string, string>();
// An animated colour is a new value every frame; past this many, new
// colours are passed through as they are.
const MAX_SEEN = 4000;

let variables: CSSStyleDeclaration | null = null;

// The one rule holding every `--bb-…` variable's dark value.
function darkVariables(): CSSStyleDeclaration {
  if (variables) return variables;
  document.getElementById("bb-theme")?.remove();
  const element = document.createElement("style");
  element.id = "bb-theme";
  document.head.appendChild(element);
  const sheet = element.sheet as CSSStyleSheet;
  // `color-scheme` turns the browser's own parts dark: scrollbars, the
  // text in a plain input, the date and file controls.
  sheet.insertRule(`:root[data-theme="dark"]{color-scheme:dark;background-color:rgb(${PAGE.join(",")})}`, 0);
  sheet.insertRule(`:root[data-theme="dark"] body{background-color:rgb(${PAGE.join(",")});color:rgb(${NEUTRAL.fg[NEUTRAL.fg.length - 1][1].join(",")})}`, 1);
  // A shadow doesn't show on a dark page, so anything that floats by one —
  // a dialog, a menu — gets a faint edge instead.
  sheet.insertRule(`:root[data-theme="dark"] [style*="box-shadow"]{outline:1px solid rgba(148,163,184,0.16);outline-offset:-1px}`, 2);
  // The knob of an on/off switch is a small white circle; as "white" it
  // would turn into a dark one.
  sheet.insertRule(`:root[data-theme="dark"] .rounded-full.bg-white.h-5.w-5{background-color:rgb(226,232,240)}`, 3);
  variables = (sheet.cssRules[0] as CSSStyleRule).style;
  return variables;
}

/**
 * A colour for web-only code that the translation would get wrong: `light`
 * as written, `dark` in the dark theme (both "r,g,b"). Pass the same value
 * twice for a colour that must not change — a white knob, say.
 */
export function themeColor(light: string, dark: string, alpha = 1): string {
  if (!hasDocument) return `rgba(${light},${alpha})`;
  const name = `--bb-x-${`${light}-${dark}-${alpha}`.replace(/[^\d]+/g, "-")}`;
  darkVariables().setProperty(name, `rgba(${dark},${alpha})`);
  // (Starting with "var(" is what makes react-native-web pass it through.)
  return `var(${name},rgba(${light},${alpha}))`;
}

/** The value react-native-web is about to write for `property`, themed. */
export function themedStyleValue(property: string | null | undefined, value: unknown): unknown {
  if (!hasDocument || typeof value !== "string" || property == null) return value;
  const role = STYLE_ROLE[property];
  if (!role) return value;
  const key = role + value;
  const known = seen.get(key);
  if (known !== undefined) return known;
  if (seen.size >= MAX_SEEN) return value;

  let themed = value;
  const match = RN_COLOR.exec(value);
  const alpha = match ? Number(match[4]) : 0;
  if (match && alpha > 0) {
    const rgb: RGB = [Number(match[1]), Number(match[2]), Number(match[3])];
    const dark = darkColor(role, rgb, alpha);
    if (dark) {
      const name = `--bb-${role}${alpha < 1 ? "a" : ""}-${rgb.join("-")}`;
      darkVariables().setProperty(name, dark.join(","));
      themed = `rgba(var(${name},${rgb.join(",")}),${match[4]})`;
    }
  }
  seen.set(key, themed);
  return themed;
}

// --- Classes ---

const CSS_ROLE: [string, Role][] = [
  ["background-color", "bg"],
  ["color", "fg"],
  ["text-decoration-color", "fg"],
  ["border-color", "bd"],
  ["border-top-color", "bd"],
  ["border-right-color", "bd"],
  ["border-bottom-color", "bd"],
  ["border-left-color", "bd"],
];
// rgb(1 2 3), rgb(1 2 3 / var(--tw-bg-opacity, 1)), rgba(1, 2, 3, 0.4)
const CSS_COLOR = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*(.+?)\s*)?\)$/;
// Adds nothing to a rule's weight, so a dark rule ranks exactly as the
// rule it shadows does and wins only by coming later.
const WHEN_DARK = ':where(:root[data-theme="dark"]) ';

function darkDeclarations(style: CSSStyleDeclaration): string[] {
  const out: string[] = [];
  let borderDone = false;
  for (const [property, role] of CSS_ROLE) {
    if (borderDone && property.startsWith("border-") && property !== "border-color") continue;
    const match = CSS_COLOR.exec(style.getPropertyValue(property).trim());
    if (!match) continue;
    const alpha = match[4] === undefined || Number.isNaN(Number(match[4])) ? 1 : Number(match[4]);
    if (alpha === 0) continue;
    const dark = darkColor(role, [Number(match[1]), Number(match[2]), Number(match[3])], alpha);
    if (!dark) continue;
    if (property === "border-color") borderDone = true;
    out.push(`${property}:rgb(${dark.join(" ")}${match[4] === undefined ? "" : ` / ${match[4]}`})${style.getPropertyPriority(property) ? " !important" : ""}`);
  }
  return out;
}

function darkRules(rules: CSSRuleList, out: string[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      const inner: string[] = [];
      darkRules(rule.cssRules, inner);
      if (inner.length) out.push(`@media ${rule.conditionText}{${inner.join("")}}`);
    } else if (rule instanceof CSSStyleRule) {
      const declarations = darkDeclarations(rule.style);
      // (A selector list with brackets in it could hold a comma that
      // isn't between selectors; none of Tailwind's colour rules do.)
      if (!declarations.length || rule.selectorText.includes("(")) continue;
      const selector = rule.selectorText
        .split(",")
        .map((part) => WHEN_DARK + part.trim())
        .join(",");
      out.push(`${selector}{${declarations.join(";")}}`);
    }
  }
}

const OWN_SHEETS = ["bb-theme", "bb-theme-classes", "react-native-stylesheet"];
let classSignature = "";

// Writes the dark twin of every colour rule in the page's stylesheets
// (react-native-web's own sheet aside: its colours carry variables already).
function writeClassRules() {
  const sheets = Array.from(document.styleSheets).filter((sheet) => !OWN_SHEETS.includes((sheet.ownerNode as Element | null)?.id ?? ""));
  const out: string[] = [];
  let signature = "";
  for (const sheet of sheets) {
    try {
      signature += `${sheet.cssRules.length}:${(sheet.ownerNode as Element | null)?.textContent?.length ?? 0};`;
      darkRules(sheet.cssRules, out);
    } catch {
      // A stylesheet from another site can't be read; nothing of ours is.
    }
  }
  let element = document.getElementById("bb-theme-classes");
  if (signature === classSignature && element && !element.nextElementSibling) return;
  classSignature = signature;
  if (!element) {
    element = document.createElement("style");
    element.id = "bb-theme-classes";
  }
  element.textContent = out.join("\n");
  // Last in the head, so each dark rule comes after the rule it shadows.
  document.head.appendChild(element);
}

let watching = false;
let pending = false;

function watchStylesheets() {
  if (watching) return;
  watching = true;
  // Stylesheets arrive after this file runs, and are replaced on a reload
  // of the code in development.
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (isDark()) writeClassRules();
    }, 50);
  }).observe(document.head, { childList: true, subtree: true, characterData: true });
}

// --- Which theme ---

const STORAGE_KEY = "web.theme";
const listeners = new Set<() => void>();
let choice: WebThemeChoice = "system";
let dark = false;

const systemDark = () => hasDocument && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export const getWebThemeChoice = () => choice;
export const isDark = () => dark;

export function subscribeWebTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function apply() {
  if (!hasDocument) return;
  dark = choice === "dark" || (choice === "system" && systemDark());
  darkVariables();
  if (dark) {
    document.documentElement.dataset.theme = "dark";
    writeClassRules();
    watchStylesheets();
  } else {
    delete document.documentElement.dataset.theme;
  }
  listeners.forEach((listener) => listener());
}

export function setWebThemeChoice(next: WebThemeChoice) {
  choice = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered, but still applied.
  }
  apply();
}

// Decided as soon as this file loads — before anything is drawn — so a
// dark page never starts out light.
if (hasDocument) {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") choice = saved;
  } catch {
    // No storage (a private window): follow the system.
  }
  apply();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (choice === "system") apply();
  });
}
