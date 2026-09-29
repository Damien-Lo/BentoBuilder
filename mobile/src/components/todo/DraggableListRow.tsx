import { Ionicons } from "@expo/vector-icons";
import { Text, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import type { TodoList } from "@/src/services/todoApi";

import { listAccent, type TodoTheme } from "./theme";

// One list row on the Lists home: tap opens it; long-press then drag moves
// it (the parent works out where it lands); long-press and let go without
// moving opens its options menu instead.
export function DraggableListRow({
  list,
  indented,
  divider,
  theme,
  onLayout,
  onPress,
  onOptions,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  list: TodoList;
  indented: boolean;
  // A slate-100 line above the row (the app's card-row divider).
  divider: boolean;
  theme: TodoTheme;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
  onOptions: () => void;
  onDragStart: () => void;
  onDragMove: (translationY: number) => void;
  onDragEnd: () => void;
}) {
  const translateY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const pressed = useSharedValue(0);

  const drag = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      lifted.value = withTiming(1, { duration: 120 });
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
      runOnJS(onDragMove)(event.translationY);
    })
    .onEnd((event) => {
      if (Math.abs(event.translationY) < 6) runOnJS(onOptions)();
      else runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      translateY.value = 0;
      lifted.value = withTiming(0, { duration: 120 });
    });

  const tap = Gesture.Tap()
    .onBegin(() => {
      pressed.value = 1;
    })
    .onEnd(() => {
      runOnJS(onPress)();
    })
    .onFinalize(() => {
      pressed.value = 0;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: 1 + lifted.value * 0.03 }],
    opacity: pressed.value && !lifted.value ? 0.6 : 1,
    backgroundColor: lifted.value > 0 ? theme.card : "transparent",
    borderRadius: 12,
    shadowOpacity: lifted.value * 0.25,
  }));
  // Raised on the wrapper (siblings only stack against siblings), so the
  // lifted row draws over the rows it's dragged across.
  const wrapperStyle = useAnimatedStyle(() => ({ zIndex: lifted.value > 0 ? 10 : 0 }));

  return (
    // The group's vertical line lives on this plain wrapper so the lifted
    // row's rounded corners never bend it.
    <Animated.View
      onLayout={onLayout}
      style={[
        {
          marginLeft: indented ? 25 : 0,
          borderLeftWidth: indented ? 2 : 0,
          borderLeftColor: theme.separator,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: theme.rowDivider,
        },
        wrapperStyle,
      ]}
    >
    <GestureDetector gesture={Gesture.Exclusive(drag, tap)}>
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            minHeight: 52,
            paddingLeft: 16,
            paddingRight: 16,
            shadowColor: "#000",
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          },
          animatedStyle,
        ]}
      >
        <Ionicons name="list" size={20} color={listAccent(list.color, theme)} />
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 14, fontSize: 16, color: theme.text }}>
          {list.name}
        </Text>
        {!!list.openCount && <Text style={{ fontSize: 15, color: theme.textFaint }}>{list.openCount}</Text>}
      </Animated.View>
    </GestureDetector>
    </Animated.View>
  );
}

export default DraggableListRow;
