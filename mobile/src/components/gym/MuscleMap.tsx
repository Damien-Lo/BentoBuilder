import { Platform, Text, View } from "react-native";
import Body, { type ExtendedBodyPart, type Slug } from "react-native-body-highlighter";

import { themeColor, useWebTheme } from "@/src/components/web/theme";
import { useOrbitTheme } from "@/src/theme/orbit";

// The muscles an exercise works, on a body seen from the front and the
// back: the ones it mainly works in a strong colour, those it also works in
// a lighter one. (Drawn by react-native-body-highlighter, MIT.)

// The library's muscles (free-exercise-db's names) as the drawing's parts.
const PARTS: Record<string, Slug[]> = {
  chest: ["chest"],
  shoulders: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  abdominals: ["abs", "obliques"],
  lats: ["upper-back"],
  "middle back": ["upper-back"],
  "lower back": ["lower-back"],
  traps: ["trapezius"],
  neck: ["neck"],
  glutes: ["gluteal"],
  // (The drawing has no hip abductors of their own: the glutes' outer part.)
  abductors: ["gluteal"],
  adductors: ["adductors"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstring"],
  calves: ["calves"],
};

// The highlight: warm, so it reads on the grey body in either theme.
export const PRIMARY_COLOR = "#E8553A";
export const SECONDARY_COLOR = "#F4A48C";
const MAIN = PRIMARY_COLOR;
const ALSO = SECONDARY_COLOR;

// Every part of the drawing (its own colour for each is a fixed dark grey,
// whatever's asked: so each is given one here).
const ALL_PARTS: Slug[] = ["abs", "adductors", "ankles", "biceps", "calves", "chest", "deltoids", "feet", "forearm", "gluteal", "hamstring", "hands", "hair", "head", "knees", "lower-back", "neck", "obliques", "quadriceps", "tibialis", "trapezius", "triceps", "upper-back"];

// Whether it's the phone's dark theme or the web's. (The drawing's own
// colours aren't styles, so the web's dark mode can't turn them: it's told
// which theme it's in.)
function useDark() {
  const { dark } = useOrbitTheme();
  const webDark = useWebTheme().dark;
  return Platform.OS === "web" ? webDark : dark;
}

// Every part, coloured: the primary muscles strong, the secondary lighter,
// the rest of the body a quiet grey (a shade lighter for the head, hands
// and feet).
function colouredParts(primary: string[], secondary: string[], dark: boolean) {
  const main = new Set(primary.flatMap((m) => PARTS[m] ?? []));
  const also = new Set(secondary.flatMap((m) => PARTS[m] ?? []));
  const muscle = dark ? "#3A4150" : "#CDD3DB";
  const skin = dark ? "#4A5263" : "#E2E6EB";
  const data: ExtendedBodyPart[] = ALL_PARTS.map((slug) => ({
    slug,
    color: main.has(slug) ? MAIN : also.has(slug) ? ALSO : ["head", "hair", "hands", "feet", "ankles", "knees"].includes(slug) ? skin : muscle,
  }));
  return { data, main, also };
}

// (`keyless`: without the key under it — where the muscles are named beside it.)
export function MuscleMap({ primary, secondary = [], size = 1, keyless }: { primary: string[]; secondary?: string[]; size?: number; keyless?: boolean }) {
  const { colors: c } = useOrbitTheme();
  const dark = useDark();
  const { data, main, also } = colouredParts(primary, secondary, dark);
  const body = { data, scale: 0.62 * size, border: "none", defaultStroke: dark ? "#1F242D" : "#FFFFFF", defaultStrokeWidth: 1 } as const;

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "center" }}>
        <View pointerEvents="none">
          <Body {...body} side="front" />
        </View>
        <View pointerEvents="none">
          <Body {...body} side="back" />
        </View>
      </View>
      {/* The key */}
      <View style={{ marginTop: 6, flexDirection: "row", gap: 16, display: keyless ? "none" : "flex" }}>
        <Key color={MAIN} label="Primary" muted={c.muted} />
        {[...also].some((slug) => !main.has(slug)) && <Key color={ALSO} label="Secondary" muted={c.muted} />}
      </View>
    </View>
  );
}

// An exercise as a round icon: its muscle map, close up on where its primary
// muscles are — from the back for the back, glutes, hamstrings, triceps
// and calves; from the front for the rest.
const BACK: Slug[] = ["upper-back", "lower-back", "trapezius", "gluteal", "hamstring", "triceps", "calves"];
// How far down the body each part is (0 the top of the head, 1 the feet):
// where the icon centres.
const DEPTH: Partial<Record<Slug, number>> = {
  neck: 0.22, trapezius: 0.25, deltoids: 0.27, chest: 0.29, "upper-back": 0.32, biceps: 0.32, triceps: 0.32,
  abs: 0.4, obliques: 0.4, forearm: 0.43, "lower-back": 0.43, gluteal: 0.5, adductors: 0.55, quadriceps: 0.6, hamstring: 0.62, calves: 0.78,
};

export function MuscleIcon({ primary, secondary = [], size = 44 }: { primary: string[]; secondary?: string[]; size?: number }) {
  const { colors: c } = useOrbitTheme();
  const dark = useDark();
  const { data } = colouredParts(primary, secondary, dark);
  const first = primary.flatMap((m) => PARTS[m] ?? [])[0];
  const side = first && BACK.includes(first) ? "back" : "front";
  // A window on about half the body's height.
  const height = size / 0.46;
  const width = height / 2;
  const depth = (first && DEPTH[first]) ?? 0.35;
  return (
    <View pointerEvents="none" style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: c.canvas, borderWidth: 1, borderColor: c.border }}>
      <View style={{ position: "absolute", left: (size - width) / 2, top: size / 2 - depth * height }}>
        <Body data={data} side={side} scale={height / 400} border="none" defaultStroke={dark ? "#1F242D" : "#FFFFFF"} defaultStrokeWidth={0.6} />
      </View>
    </View>
  );
}

function Key({ color, label, muted }: { color: string; label: string; muted: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <MuscleDot color={color} />
      <Text style={{ fontSize: 12, color: muted }}>{label}</Text>
    </View>
  );
}

// A dot in a highlight's colour — as drawn on the body: the web's dark mode
// leaves it as it is.
export function MuscleDot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Platform.OS === "web" ? themeColor(hexRgb(color), hexRgb(color)) : color }} />;
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
