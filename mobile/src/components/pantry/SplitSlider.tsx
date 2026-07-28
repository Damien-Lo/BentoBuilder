import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

interface SplitSliderProps {
  ratio: number; // 0..1, fraction going to the left side
  onChange: (ratio: number) => void;
  disabled?: boolean;
}

const THUMB_SIZE = 26;
const TRACK_HEIGHT = 6;

// A plain drag-to-split slider built on gesture-handler + reanimated (both
// already dependencies for the swipe-to-delete rows) instead of pulling in
// a native slider package that would need a fresh dev-client build.
export function SplitSlider({ ratio, onChange, disabled = false }: SplitSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  function updateFromX(x: number) {
    if (trackWidth <= 0) return;
    const clamped = Math.min(Math.max(x, 0), trackWidth);
    onChange(clamped / trackWidth);
  }

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onBegin((event) => {
      runOnJS(updateFromX)(event.x);
    })
    .onUpdate((event) => {
      runOnJS(updateFromX)(event.x);
    });

  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const thumbLeft = trackWidth > 0 ? clampedRatio * trackWidth - THUMB_SIZE / 2 : -THUMB_SIZE / 2;

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={handleLayout}
        className="justify-center"
        style={{ height: THUMB_SIZE, opacity: disabled ? 0.5 : 1 }}
      >
        <View
          className="rounded-full bg-slate-200"
          style={{ height: TRACK_HEIGHT }}
        />
        <View
          className="absolute rounded-full bg-blue-500"
          style={{ height: TRACK_HEIGHT, width: `${clampedRatio * 100}%` }}
        />
        <View
          pointerEvents="none"
          className="absolute rounded-full border-2 border-blue-600 bg-white shadow"
          style={{
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            left: thumbLeft,
          }}
        />
      </View>
    </GestureDetector>
  );
}

export default SplitSlider;
