import { useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";

// The desktop layout is drawn for a window about 1600 × 920. A smaller
// window — a 14-inch laptop — would otherwise show the same sizes with less
// of everything on screen, so the whole layout is scaled down to fit it,
// the way zooming the browser out would, but automatically.
//
// "auto" follows the window; a fixed size (0.8 = 80%) can be chosen from the
// rail and is remembered in this browser.

const REFERENCE_WIDTH = 1600;
const REFERENCE_HEIGHT = 920;
// Below this the smallest labels stop being readable.
const AUTO_MIN = 0.82;
const AUTO_MAX = 1;
export const WEB_SCALE_STEPS = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.1] as const;
const STORAGE_KEY = "web.uiScale";

export type WebScaleChoice = "auto" | number;

let current = 1;
// The scale in force right now. Anything that turns a mouse position into
// a position in the layout (dragging on the calendar) divides by this.
export const getWebScale = () => current;

const listeners = new Set<(choice: WebScaleChoice) => void>();
let choice: WebScaleChoice = "auto";
let loaded = false;

function loadChoice(): WebScaleChoice {
  if (loaded) return choice;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    const n = Number(saved);
    if (saved && saved !== "auto" && n >= 0.5 && n <= 1.5) choice = n;
  } catch {
    // No storage (private window): stay on auto.
  }
  return choice;
}

export function setWebScaleChoice(next: WebScaleChoice) {
  choice = next;
  loaded = true;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(next));
  } catch {
    // Not remembered, but still applied.
  }
  listeners.forEach((listener) => listener(next));
}

function autoScale(width: number, height: number): number {
  const fit = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
  // In steps of 1%, so resizing the window doesn't shimmer.
  return Math.round(Math.max(AUTO_MIN, Math.min(AUTO_MAX, fit)) * 100) / 100;
}

// Applies the scale to the page while `enabled` (the desktop layout is
// showing) and returns it with the choice behind it.
export function useWebScale(enabled: boolean): { scale: number; choice: WebScaleChoice } {
  const { width, height } = useWindowDimensions();
  const [picked, setPicked] = useState<WebScaleChoice>(() => (Platform.OS === "web" ? loadChoice() : "auto"));

  useEffect(() => {
    listeners.add(setPicked);
    return () => {
      listeners.delete(setPicked);
    };
  }, []);

  const scale = !enabled || Platform.OS !== "web" ? 1 : picked === "auto" ? autoScale(width, height) : picked;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    current = scale;
    // The body is laid out bigger than the window and then shrunk to fit
    // it (or the reverse). It's the body, not the app's root, so that
    // dialogs — which are attached to the body — are scaled with the rest.
    const body = document.body.style;
    if (scale === 1) {
      body.transform = "";
      body.transformOrigin = "";
      body.width = "";
      body.height = "";
    } else {
      body.transformOrigin = "0 0";
      body.transform = `scale(${scale})`;
      body.width = `${100 / scale}%`;
      body.height = `${100 / scale}%`;
    }
    document.documentElement.style.overflow = "hidden";
    return () => {
      current = 1;
      body.transform = "";
      body.transformOrigin = "";
      body.width = "";
      body.height = "";
    };
  }, [scale]);

  return { scale, choice: picked };
}
