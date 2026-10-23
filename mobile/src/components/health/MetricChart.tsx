import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { useOrbitTheme } from "@/src/theme/orbit";

// A reading over days: bars for a day's total (steps), a line for a figure
// (resting heart rate) — a second, fainter line for a pair (blood
// pressure's lower number). Spaced by date across the range, so a missing
// day is a gap; the highest and lowest on the right, the first and last
// day along the bottom. In the section's colour.
export function MetricChart({ points, from, to, bars, height = 130 }: { points: { date: string; value: number; value2?: number }[]; from: string; to: string; bars?: boolean; height?: number }) {
  const { colors: c } = useOrbitTheme();
  const [width, setWidth] = useState(0);
  const right = 40;
  const bottom = 18;
  const top = 8;
  const plotW = Math.max(0, width - right - 2);
  const plotH = height - bottom - top;

  const day = (d: string) => new Date(`${d}T00:00:00`).getTime() / 86_400_000;
  const first = day(from);
  const span = Math.max(1, day(to) - first);
  const values = points.flatMap((p) => [p.value, ...(p.value2 != null ? [p.value2] : [])]);
  const hi = values.length ? Math.max(...values) : 1;
  const lo = bars ? 0 : values.length ? Math.min(...values) : 0;
  const pad = bars ? 0 : Math.max(1, (hi - lo) * 0.15);
  const min = lo - pad;
  const max = hi + pad || 1;
  const x = (d: string) => 2 + ((day(d) - first) / span) * plotW;
  const y = (v: number) => top + plotH - ((v - min) / (max - min || 1)) * plotH;
  const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const barW = Math.max(2, Math.min(18, (plotW / (span + 1)) * 0.7));
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const path = (key: "value" | "value2") =>
    sorted
      .filter((p) => p[key] != null)
      .map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p[key]!).toFixed(1)}`)
      .join(" ");
  const label = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v * 10) / 10}`);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[max - pad, min + pad].map((g, i) => (
            <Line key={i} x1={2} x2={plotW + 2} y1={y(g)} y2={y(g)} stroke={c.border} strokeWidth={1} />
          ))}
          {points.length > 0 &&
            [max - pad, min + pad].map((g, i) => (
              <SvgText key={`l${i}`} x={width - 2} y={y(g) + 4} fontSize={10.5} fill={c.faint} textAnchor="end">
                {label(g)}
              </SvgText>
            ))}
          {bars
            ? sorted.map((p) => <Rect key={p.date} x={x(p.date) - barW / 2} y={y(p.value)} width={barW} height={Math.max(1, top + plotH - y(p.value))} rx={Math.min(3, barW / 2)} fill={c.fill} opacity={p.date === to ? 1 : 0.7} />)
            : (
              <>
                {sorted.some((p) => p.value2 != null) && <Path d={path("value2")} fill="none" stroke={c.fill} strokeOpacity={0.45} strokeWidth={2} strokeLinejoin="round" />}
                <Path d={path("value")} fill="none" stroke={c.fill} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                {sorted.length <= 45 && sorted.map((p) => <Circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={2.5} fill={c.fill} />)}
              </>
            )}
          <SvgText x={2} y={height - 3} fontSize={10.5} fill={c.faint} textAnchor="start">
            {short(from)}
          </SvgText>
          <SvgText x={plotW + 2} y={height - 3} fontSize={10.5} fill={c.faint} textAnchor="end">
            {short(to)}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}
