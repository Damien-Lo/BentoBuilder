import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TaskDetail } from "@/src/components/todo/TaskDetail";

// A task's page. Its subtasks don't open as pages of their own: they float
// as a card over this one (and a sub-subtask as a second, smaller card), so it's always clear how deep you are and what you came from.
// `open` (a subtask id) starts with that subtask's sheet showing — how the
// calendar opens a subtask.
export default function TodoTaskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, open } = useLocalSearchParams<{ id: string; open?: string }>();
  // The sheet levels showing, outermost first (subtask, then sub-subtask).
  const [stack, setStack] = useState<string[]>(open ? [open] : []);
  const [refreshKey, setRefreshKey] = useState(0);

  // Whatever changed in a sheet shows in what's underneath once it's gone.
  const pop = () => {
    setStack((prev) => prev.slice(0, -1));
    setRefreshKey((k) => k + 1);
  };
  const closeAll = () => {
    setStack([]);
    setRefreshKey((k) => k + 1);
  };

  const top = stack[stack.length - 1];

  return (
    <>
      <TaskDetail
        id={id}
        mode="page"
        refreshKey={refreshKey}
        onOpenSubtask={(subId) => setStack([subId])}
        // Only shown if this page is itself a subtask (an old link).
        onOpenParent={(parentId) => router.replace({ pathname: "/lists/task/[id]", params: { id: parentId } })}
        onExit={() => router.back()}
      />

      <Modal visible={stack.length > 0} transparent animationType="fade" onRequestClose={pop}>
        {/* One floating card over the dimmed task, whatever the depth — its
            header shows the path. Tap outside it to close. */}
        <View
          className="flex-1 bg-black/45"
          style={{
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
            paddingHorizontal: 12,
          }}
        >
          <Pressable className="absolute inset-0" onPress={closeAll} accessibilityLabel="Close" />
          <View
            className="flex-1 overflow-hidden rounded-3xl bg-slate-50"
            style={{ shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } }}
          >
            {top && (
              <TaskDetail
                key={top}
                id={top}
                mode="sheet"
                canGoBack={stack.length > 1}
                onOpenSubtask={(subId) => setStack((prev) => [...prev, subId])}
                onExit={pop}
                onClose={closeAll}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
