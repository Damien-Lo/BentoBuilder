import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import { useOrbitTheme } from "@/src/theme/orbit";

// Weigh-ins over time: a line through them (spaced by date, so gaps show),
// shaded under, the goal as a dashed line with its weight, three guide
// weights on the right and the first and last dates along the bottom. In
// the section's colour.
export function WeightChart({ points, goal, height = 200 }: { points: { date: string; weight: number }[]; goal: number | null; height?: number }) {
  const { colors: c } = useOrbitTheme();
  const [width, setWidth] = useState(0);
  const right = 44;
  const bottom = 22;
  const top = 12;
  const plotW = Math.max(0, width - right - 4);
  const plotH = height - bottom - top;

  const day = (d: string) => new Date(`${d}T00:00:00`).getTime() / 86_400_000;
  const first = points.length ? day(points[0].date) : 0;
  const last = points.length ? day(points[points.length - 1].date) : 1;
  const weights = points.map((p) => p.weight);
  const lo = Math.min(...weights, ...(goal != null ? [goal] : []));
  const hi = Math.max(...weights, ...(goal != null ? [goal] : []));
  const pad = Math.max(1, (hi - lo) * 0.12);
  const min = lo - pad;
  const max = hi + pad;
  const x = (d: string) => 4 + (last > first ? ((day(d) - first) / (last - first)) * plotW : plotW / 2);
  const y = (w: number) => top + plotH - ((w - min) / (max - min || 1)) * plotH;
  const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.weight).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${line} L${x(points[points.length - 1].date).toFixed(1)},${top + plotH} L${x(points[0].date).toFixed(1)},${top + plotH} Z` : "";
  const guides = [max - pad / 2, (min + max) / 2, min + pad / 2];
  const dots = points.length <= 40;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && points.length > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.fill} stopOpacity={0.28} />
              <Stop offset="1" stopColor={c.fill} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {guides.map((g, i) => (
            <Line key={i} x1={4} x2={plotW + 4} y1={y(g)} y2={y(g)} stroke={c.border} strokeWidth={1} />
          ))}
          {guides.map((g, i) => (
            <SvgText key={`l${i}`} x={width - 2} y={y(g) + 4} fontSize={11} fill={c.faint} textAnchor="end">
              {g.toFixed(0)}
            </SvgText>
          ))}
          {goal != null && (
            <>
              <Line x1={4} x2={plotW + 4} y1={y(goal)} y2={y(goal)} stroke={c.ink} strokeWidth={1.5} strokeDasharray="5 5" />
              <SvgText x={8} y={y(goal) - 6} fontSize={11.5} fontWeight="700" fill={c.ink}>
                {`Goal ${goal}`}
              </SvgText>
            </>
          )}
          {!!area && <Path d={area} fill="url(#weightFill)" />}
          <Path d={line} fill="none" stroke={c.fill} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {dots && points.map((p) => <Circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r={3} fill={c.surface} stroke={c.fill} strokeWidth={2} />)}
          {/* (The latest, marked.) */}
          <Circle cx={x(points[points.length - 1].date)} cy={y(points[points.length - 1].weight)} r={5} fill={c.fill} />
          <SvgText x={4} y={height - 4} fontSize={11} fill={c.faint} textAnchor="start">
            {short(points[0].date)}
          </SvgText>
          {points.length > 1 && (
            <SvgText x={plotW + 4} y={height - 4} fontSize={11} fill={c.faint} textAnchor="end">
              {short(points[points.length - 1].date)}
            </SvgText>
          )}
        </Svg>
      )}
    </View>
  );
}
