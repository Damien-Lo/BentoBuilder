import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { useOrbitTheme } from "@/src/theme/orbit";

// A line through a value over time (an exercise's best each session):
// three guide lines with their values on the left, the dates along the
// bottom. Without any points, the guides alone and `empty` over them.
export function ProgressChart({ points, unit, empty }: { points: { date: string; value: number }[]; unit: string; empty: string }) {
  const { colors: c } = useOrbitTheme();
  const [width, setWidth] = useState(0);
  const height = 180;
  const left = 48;
  const bottom = 24;
  const plotW = Math.max(0, width - left - 8);
  const plotH = height - bottom - 8;

  const values = points.map((p) => p.value);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = (hi - lo || hi || 1) * 0.15;
  const min = Math.max(0, lo - pad);
  const max = hi + pad;
  const y = (v: number) => 8 + plotH - ((v - min) / (max - min || 1)) * plotH;
  const x = (i: number) => left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  // (Empty: just the top and bottom, clear of the message between them.)
  const guides = points.length ? [min, (min + max) / 2, max] : [min, max];
  const short = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {guides.map((g, i) => (
            <Line key={i} x1={left} x2={width - 8} y1={y(g)} y2={y(g)} stroke={c.border} strokeWidth={1} />
          ))}
          {points.length > 0 &&
            guides.map((g, i) => (
              <SvgText key={`l${i}`} x={left - 8} y={y(g) + 4} fontSize={11} fill={c.faint} textAnchor="end">
                {`${Math.round(g)} ${unit}`}
              </SvgText>
            ))}
          {points.length > 1 && <Polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={c.ink} strokeWidth={2.5} strokeLinejoin="round" />}
          {points.map((p, i) => (
            <Circle key={p.date + i} cx={x(i)} cy={y(p.value)} r={4} fill={c.ink} />
          ))}
          {points.length > 0 &&
            [0, Math.floor((points.length - 1) / 2), points.length - 1]
              .filter((i, n, all) => all.indexOf(i) === n)
              .map((i) => (
                // (The first and last dates kept inside the edges.)
                <SvgText key={`d${i}`} x={x(i)} y={height - 6} fontSize={11} fill={c.faint} textAnchor={points.length > 1 && i === 0 ? "start" : points.length > 1 && i === points.length - 1 ? "end" : "middle"}>
                  {short(points[i].date)}
                </SvgText>
              ))}
        </Svg>
      )}
      {points.length === 0 && (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
          <Text style={{ textAlign: "center", fontSize: 14, lineHeight: 20, color: c.muted }}>{empty}</Text>
        </View>
      )}
    </View>
  );
}
