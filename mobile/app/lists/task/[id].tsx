import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TaskDetail } from "@/src/components/todo/TaskDetail";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// A task's page. Its subtasks don't open as pages of their own: they float
// as a card over this one (and a sub-subtask as a second, smaller card), so it's always clear how deep you are and what you came from.
// `open` (a subtask id) starts with that subtask's sheet showing — how the
// calendar opens a subtask.
// In Orbit's look, in the Tasks section's violet — in a desktop browser
// too, as a page of a comfortable reading width on the canvas.
export default function TodoTaskScreen() {
  return (
    <OrbitSection section="tasks">
      <TodoTaskPage />
    </OrbitSection>
  );
}

function TodoTaskPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const { colors } = useOrbitTheme();
  const o = colors;
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
    <OrbitPage>
      {/* (In a desktop browser: a page of a comfortable reading width, on
          the canvas, a little down from the top.) */}
      <View style={wide ? { flex: 1, backgroundColor: o.canvas, paddingTop: 16 } : { flex: 1 }}>
      <View style={wide ? { flex: 1, width: "100%", maxWidth: 900, alignSelf: "center" } : { flex: 1 }}>
      <TaskDetail
        id={id}
        mode="page"
        refreshKey={refreshKey}
        onOpenSubtask={(subId) => setStack([subId])}
        // Only shown if this page is itself a subtask (an old link).
        onOpenParent={(parentId) => router.replace({ pathname: "/lists/task/[id]", params: { id: parentId } })}
        onExit={() => router.back()}
      />
      </View>
      </View>

      <Modal visible={stack.length > 0} transparent animationType="fade" onRequestClose={pop}>
        {/* One floating card over the dimmed task, whatever the depth — its
            header shows the path. Tap outside it to close. */}
        {/* (Orbit: its scrim, and the card on the page's own colour.) */}
        <View
          className="flex-1 bg-black/45"
          style={[
            {
              paddingTop: insets.top + 20,
              paddingBottom: insets.bottom + 20,
              paddingHorizontal: 12,
            },
            o && { backgroundColor: o.scrim },
          ]}
        >
          <Pressable className="absolute inset-0" onPress={closeAll} accessibilityLabel="Close" />
          <View
            className="flex-1 overflow-hidden rounded-3xl bg-slate-50"
            style={[
              { ...(wide ? { width: "100%", maxWidth: 760, alignSelf: "center" } : {}), shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
              o && { backgroundColor: o.canvas, borderRadius: 28 },
            ]}
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
    </OrbitPage>
  );
}
