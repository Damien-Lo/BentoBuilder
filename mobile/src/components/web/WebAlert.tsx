import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, Text, View, type AlertButton } from "react-native";

// In a browser `Alert.alert` does nothing, and the app leans on it for every
// confirmation and choice ("Delete?", "Just this day / every one after",
// the action menus). This gives it a real dialog there: `Alert.alert` is
// pointed at a queue that `WebAlertHost` (mounted once, at the root) shows
// as a centred card with the same buttons.

interface Dialog {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

let nextId = 1;
let push: ((dialog: Dialog) => void) | null = null;

if (Platform.OS === "web") {
  Alert.alert = (title, message, buttons) => {
    push?.({
      id: nextId++,
      title,
      message: message ?? undefined,
      buttons: buttons?.length ? buttons : [{ text: "OK" }],
    });
  };
}

export function WebAlertHost() {
  const [queue, setQueue] = useState<Dialog[]>([]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    push = (dialog) => setQueue((prev) => [...prev, dialog]);
    return () => {
      push = null;
    };
  }, []);

  const dialog = queue[0];
  if (Platform.OS !== "web" || !dialog) return null;

  const choose = (button?: AlertButton) => {
    setQueue((prev) => prev.slice(1));
    button?.onPress?.();
  };
  const cancel = dialog.buttons.find((b) => b.style === "cancel");
  // Two buttons sit side by side; more are a list of choices.
  const stacked = dialog.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => choose(cancel)}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.45)", padding: 24 }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => choose(cancel)} />
        <View
          style={{
            width: "100%",
            maxWidth: 400,
            borderRadius: 20,
            backgroundColor: "#FFFFFF",
            padding: 22,
            boxShadow: "0 16px 40px rgba(15,23,42,0.25)",
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>{dialog.title}</Text>
          {!!dialog.message && <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: "#475569" }}>{dialog.message}</Text>}
          <View style={{ marginTop: 18, flexDirection: stacked ? "column" : "row", justifyContent: "flex-end", gap: 8 }}>
            {dialog.buttons.map((button, index) => {
              const tone =
                button.style === "destructive"
                  ? { bg: "#FEF2F2", over: "#FEE2E2", text: "#DC2626" }
                  : button.style === "cancel"
                    ? { bg: "#F1F5F9", over: "#E2E8F0", text: "#334155" }
                    : { bg: "#2563EB", over: "#1D4ED8", text: "#FFFFFF" };
              return (
                <Pressable
                  key={index}
                  onPress={() => choose(button)}
                  style={({ hovered }: { hovered?: boolean }) => ({
                    minWidth: stacked ? undefined : 96,
                    alignItems: "center",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 11,
                    backgroundColor: hovered ? tone.over : tone.bg,
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: tone.text }}>{button.text ?? "OK"}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
