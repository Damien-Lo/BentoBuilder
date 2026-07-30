import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

interface RateSliderProps {
  value: number; // integer 1..10
  onChange: (value: number) => void;
  disabled?: boolean;
}

const MIN = 1;
const MAX = 10;
const THUMB_SIZE = 30;
const TRACK_HEIGHT = 6;

// Same drag-to-set approach as SplitSlider (gesture-handler + reanimated,
// no native slider dependency) but snapped to the 10 integer steps a
// rating needs, with the current value shown right on the thumb.
export function RateSlider({ value, onChange, disabled = false }: RateSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  function updateFromX(x: number) {
    if (trackWidth <= 0) return;
    const ratio = Math.min(Math.max(x / trackWidth, 0), 1);
    const stepped = Math.round(ratio * (MAX - MIN)) + MIN;
    onChange(stepped);
  }

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onBegin((event) => {
      runOnJS(updateFromX)(event.x);
    })
    .onUpdate((event) => {
      runOnJS(updateFromX)(event.x);
    });

  const clampedValue = Math.min(Math.max(value, MIN), MAX);
  const ratio = (clampedValue - MIN) / (MAX - MIN);
  const thumbLeft = trackWidth > 0 ? ratio * trackWidth - THUMB_SIZE / 2 : -THUMB_SIZE / 2;

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={handleLayout}
        className="justify-center"
        style={{ height: THUMB_SIZE, opacity: disabled ? 0.5 : 1 }}
      >
        <View className="rounded-full bg-slate-200" style={{ height: TRACK_HEIGHT }} />
        <View
          className="absolute rounded-full bg-blue-500"
          style={{ height: TRACK_HEIGHT, width: `${ratio * 100}%` }}
        />
        <View
          pointerEvents="none"
          className="absolute items-center justify-center rounded-full border-2 border-blue-600 bg-white shadow"
          style={{ width: THUMB_SIZE, height: THUMB_SIZE, left: thumbLeft }}
        >
          <Text className="text-[11px] font-bold text-blue-600">{clampedValue}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

export default RateSlider;
