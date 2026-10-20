import { View } from "react-native";

// A ring of short marks, filled round from the top — the home screen's
// day ring, as a gauge: `value` (0–1, eaten) in `color`, then `extra`
// (planned) in the same colour faded, the rest in `track`.
export function TickRing({
  size,
  value,
  extra = 0,
  marks = 48,
  tick = 8,
  width = 2.5,
  color,
  track,
}: {
  size: number;
  value: number;
  extra?: number;
  marks?: number;
  // How long and wide each mark is.
  tick?: number;
  width?: number;
  color: string;
  track: string;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const filled = Math.round(clamp(value) * marks);
  const planned = Math.round(clamp(value + extra) * marks);
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
      {Array.from({ length: marks }, (_, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: size / 2 - width / 2,
            top: size / 2 - tick / 2,
            width,
            height: tick,
            borderRadius: width / 2,
            backgroundColor: i < planned ? color : track,
            opacity: i >= filled && i < planned ? 0.35 : 1,
            transform: [{ rotate: `${i * (360 / marks)}deg` }, { translateY: -size / 2 + tick / 2 }],
          }}
        />
      ))}
    </View>
  );
}
