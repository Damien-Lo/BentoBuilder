import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";

// Building blocks for the desktop pages, in the app's own look: white cards
// with a slate border on a slate-50 page, blue-600 for actions.

type IconName = keyof typeof Ionicons.glyphMap;
type Hover = { hovered?: boolean };

export const WEB = {
  page: "#F8FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  line: "#F1F5F9",
  text: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  blue: "#2563EB",
  blueDark: "#1D4ED8",
  blueSoft: "#EFF6FF",
  green: "#16A34A",
  amber: "#D97706",
  red: "#DC2626",
};

// A scrolling page with comfortable margins, its content held to a width
// that still reads well on a very wide monitor.
export function WebPage({ children, maxWidth = 1480 }: { children: ReactNode; maxWidth?: number }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: WEB.page }} contentContainerStyle={{ alignItems: "center", padding: 24, paddingBottom: 48 }}>
      <View style={{ width: "100%", maxWidth }}>{children}</View>
    </ScrollView>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 18 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: WEB.text }}>{title}</Text>
        {!!subtitle && <Text style={{ marginTop: 2, fontSize: 14, color: WEB.muted }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  style,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  // Something for the card's top-right corner (a link, a button).
  action?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[{ backgroundColor: WEB.card, borderWidth: 1, borderColor: WEB.border, borderRadius: 16, overflow: "hidden" }, style]}>
      {(title || action) && (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
          <View style={{ flex: 1 }}>
            {!!title && <Text style={{ fontSize: 15, fontWeight: "700", color: WEB.text }}>{title}</Text>}
            {!!subtitle && <Text style={{ marginTop: 1, fontSize: 12, color: WEB.muted }}>{subtitle}</Text>}
          </View>
          {action}
        </View>
      )}
      <View style={padded ? { paddingHorizontal: 18, paddingBottom: 18, paddingTop: title || action ? 0 : 18 } : undefined}>{children}</View>
    </View>
  );
}

// "Open calendar ›" in a card's corner.
export function CardLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", opacity: hovered ? 0.7 : 1 })}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: WEB.blue }}>{label}</Text>
      <Ionicons name="chevron-forward" size={13} color={WEB.blue} style={{ marginLeft: 2 }} />
    </Pressable>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: IconName;
}) {
  const color = tone === "bad" ? WEB.red : tone === "warn" ? WEB.amber : tone === "good" ? WEB.green : WEB.text;
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: WEB.card, borderWidth: 1, borderColor: WEB.border, borderRadius: 16, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {!!icon && <Ionicons name={icon} size={14} color={WEB.muted} style={{ marginRight: 6 }} />}
        <Text style={{ fontSize: 12, fontWeight: "600", color: WEB.muted }}>{label}</Text>
      </View>
      <Text style={{ marginTop: 6, fontSize: 26, fontWeight: "700", color }}>{value}</Text>
      {!!sub && <Text style={{ marginTop: 2, fontSize: 12, color: WEB.faint }}>{sub}</Text>}
    </View>
  );
}

// Space held for something that's planned but not built: says what will go
// there, so the layout already accounts for it.
export function Planned({ icon, title, text, minHeight = 150, style }: { icon: IconName; title: string; text: string; minHeight?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          minHeight,
          alignItems: "center",
          justifyContent: "center",
          padding: 18,
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: "#CBD5E1",
          backgroundColor: "#FBFCFE",
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={24} color={WEB.faint} />
      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: WEB.body }}>{title}</Text>
        <View style={{ marginLeft: 8, borderRadius: 999, backgroundColor: "#E2E8F0", paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: WEB.muted }}>PLANNED</Text>
        </View>
      </View>
      <Text style={{ marginTop: 4, maxWidth: 380, textAlign: "center", fontSize: 12, lineHeight: 17, color: WEB.muted }}>{text}</Text>
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  kind = "secondary",
  small,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  kind?: "primary" | "secondary";
  small?: boolean;
}) {
  const primary = kind === "primary";
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: Hover) => ({
        flexDirection: "row",
        alignItems: "center",
        height: small ? 30 : 36,
        paddingHorizontal: small ? 10 : 14,
        borderRadius: 10,
        borderWidth: primary ? 0 : 1,
        borderColor: "#CBD5E1",
        backgroundColor: primary ? (hovered ? WEB.blueDark : WEB.blue) : hovered ? "#F1F5F9" : "#FFFFFF",
      })}
    >
      {!!icon && <Ionicons name={icon} size={small ? 14 : 16} color={primary ? "#FFFFFF" : WEB.body} style={{ marginRight: 6 }} />}
      <Text style={{ fontSize: 13, fontWeight: "600", color: primary ? "#FFFFFF" : WEB.body }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, size = 34, color = WEB.body }: { icon: IconName; label: string; onPress: () => void; size?: number; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ hovered }: Hover) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hovered ? "#E2E8F0" : "transparent",
      })}
    >
      <Ionicons name={icon} size={Math.round(size * 0.52)} color={color} />
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={{ flexDirection: "row", borderRadius: 10, backgroundColor: "#EEF2F7", padding: 3 }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ hovered }: Hover) => ({
              height: 30,
              paddingHorizontal: 12,
              justifyContent: "center",
              borderRadius: 8,
              backgroundColor: on ? "#FFFFFF" : hovered ? "#E2E8F0" : "transparent",
              boxShadow: on ? "0 1px 2px rgba(15,23,42,0.12)" : undefined,
            })}
          >
            <Text style={{ fontSize: 13, fontWeight: on ? "700" : "500", color: on ? WEB.blueDark : "#475569" }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A value against its goal: a labelled bar, with a lighter stretch for the
// part that's only planned. Over the goal turns the bar red.
export function GoalBar({
  label,
  value,
  planned = 0,
  goal,
  unit,
  color = WEB.blue,
}: {
  label: string;
  value: number;
  planned?: number;
  goal: number | null;
  unit: string;
  color?: string;
}) {
  const of = goal && goal > 0 ? goal : null;
  const pct = (n: number): DimensionValue => `${Math.max(0, Math.min(100, of ? (n / of) * 100 : 0))}%`;
  // (A little over isn't flagged: within 5% reads as on target.)
  const over = !!of && value > of * 1.05;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: WEB.body }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: "700", color: over ? WEB.red : WEB.text }}>
          {Math.round(value)}
          {planned > 0 && <Text style={{ fontWeight: "500", color: WEB.faint }}> +{Math.round(planned)}</Text>}
          <Text style={{ fontWeight: "500", color: WEB.muted }}>
            {of ? ` / ${Math.round(of)}` : ""} {unit}
          </Text>
        </Text>
      </View>
      <View style={{ marginTop: 5, height: 8, borderRadius: 4, backgroundColor: "#EEF2F7", overflow: "hidden", flexDirection: "row" }}>
        <View style={{ width: pct(value), backgroundColor: over ? WEB.red : color }} />
        <View style={{ width: pct(Math.min(planned, Math.max(0, (of ?? 0) - value))), backgroundColor: color, opacity: 0.3 }} />
      </View>
    </View>
  );
}

// Vertical bars, one per item, with an optional dashed goal line across.
// `value2` stacks a lighter segment on top (e.g. planned on eaten).
export function BarChart({
  data,
  goal,
  height = 180,
  color = WEB.blue,
  unit = "",
}: {
  data: { key: string; label: string; sub?: string; value: number; value2?: number; highlight?: boolean }[];
  goal?: number | null;
  height?: number;
  color?: string;
  unit?: string;
}) {
  const top = Math.max(goal ?? 0, ...data.map((d) => d.value + (d.value2 ?? 0)), 1) * 1.12;
  const y = (n: number) => (n / top) * height;
  return (
    <View>
      <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: data.length > 16 ? 3 : 8 }}>
        {!!goal && (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: y(goal), borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "#94A3B8" }}>
            <Text style={{ position: "absolute", right: 0, top: -16, fontSize: 10, fontWeight: "600", color: WEB.muted }}>
              goal {Math.round(goal)}
              {unit}
            </Text>
          </View>
        )}
        {data.map((d) => {
          // (A little over isn't flagged: within 5% reads as on target.)
          const over = !!goal && d.value > goal * 1.05;
          return (
            <View key={d.key} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height }}>
              {d.value + (d.value2 ?? 0) > 0 && data.length <= 16 && (
                <Text style={{ marginBottom: 3, fontSize: 10, fontWeight: "600", color: WEB.muted }}>{Math.round(d.value + (d.value2 ?? 0))}</Text>
              )}
              {!!d.value2 && <View style={{ width: "100%", maxWidth: 46, height: y(d.value2), backgroundColor: color, opacity: 0.28, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />}
              <View
                style={{
                  width: "100%",
                  maxWidth: 46,
                  height: Math.max(d.value > 0 ? 2 : 0, y(d.value)),
                  backgroundColor: over ? WEB.red : color,
                  borderTopLeftRadius: d.value2 ? 0 : 5,
                  borderTopRightRadius: d.value2 ? 0 : 5,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: data.length > 16 ? 3 : 8, marginTop: 6, borderTopWidth: 1, borderTopColor: WEB.border, paddingTop: 5 }}>
        {data.map((d) => (
          <View key={d.key} style={{ flex: 1, alignItems: "center" }}>
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: d.highlight ? "700" : "500", color: d.highlight ? WEB.blue : WEB.muted }}>
              {d.label}
            </Text>
            {!!d.sub && (
              <Text numberOfLines={1} style={{ fontSize: 10, color: WEB.faint }}>
                {d.sub}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// Points joined by a line, for a trend (weight over time). Drawn with plain
// views: dots, and thin rotated strips between them.
export function LineChart({ points, height = 160, color = WEB.blue, target }: { points: { key: string; label: string; value: number }[]; height?: number; color?: string; target?: number | null }) {
  const values = [...points.map((p) => p.value), ...(target != null ? [target] : [])];
  if (points.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const W = 1000; // drawn in a 1000-wide box, scaled to the card by percentages
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  return (
    <View>
      <View style={{ height }}>
        {target != null && (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: y(target), borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "#94A3B8" }}>
            <Text style={{ position: "absolute", right: 0, top: -16, fontSize: 10, fontWeight: "600", color: WEB.muted }}>goal {target}</Text>
          </View>
        )}
        <LineLayer points={points.map((p, i) => ({ x: x(i) / W, y: y(p.value) }))} height={height} color={color} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, borderTopWidth: 1, borderTopColor: WEB.border, paddingTop: 5 }}>
        <Text style={{ fontSize: 11, color: WEB.muted }}>{points[0].label}</Text>
        {points.length > 1 && <Text style={{ fontSize: 11, color: WEB.muted }}>{points[points.length - 1].label}</Text>}
      </View>
    </View>
  );
}

// The line itself needs real pixel widths for its angles, so it measures.
function LineLayer({ points, height, color }: { points: { x: number; y: number }[]; height: number; color: string }) {
  return (
    <MeasuredWidth>
      {(width) => (
        <>
          {points.slice(1).map((p, i) => {
            const a = points[i];
            const dx = (p.x - a.x) * width;
            const dy = p.y - a.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: a.x * width + dx / 2 - length / 2,
                  top: a.y + dy / 2 - 1,
                  width: length,
                  height: 2,
                  backgroundColor: color,
                  transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                }}
              />
            );
          })}
          {points.map((p, i) => (
            <View
              key={`dot-${i}`}
              style={{
                position: "absolute",
                left: p.x * width - 4,
                top: p.y - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#FFFFFF",
                borderWidth: 2,
                borderColor: color,
              }}
            />
          ))}
          <View style={{ height }} />
        </>
      )}
    </MeasuredWidth>
  );
}


function MeasuredWidth({ children }: { children: (width: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && children(width)}
    </View>
  );
}

// A row of cards that wraps: each child takes an equal share, never
// narrower than `min`.
export function Row({ children, gap = 16, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap, marginBottom: gap }, style]}>{children}</View>;
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 22 }}>
      <Ionicons name={icon} size={24} color="#CBD5E1" />
      <Text style={{ marginTop: 6, fontSize: 13, color: WEB.faint }}>{text}</Text>
    </View>
  );
}
