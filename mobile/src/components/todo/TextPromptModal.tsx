import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { useTodoTheme } from "./theme";

// A small "name this" dialog — new list, new group, rename. (Alert.prompt
// is iOS-only; this works everywhere and matches the section's theme.)
export function TextPromptModal({
  visible,
  title,
  placeholder,
  initialValue = "",
  confirmLabel = "Create",
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const theme = useTodoTheme();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const trimmed = value.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", paddingHorizontal: 32, backgroundColor: "rgba(0,0,0,0.45)" }}
      >
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onCancel} />
        <View style={{ backgroundColor: theme.card, borderRadius: 24, padding: 20 }}>
          <Text style={{ color: theme.title, fontSize: 18, fontWeight: "700" }}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={theme.textFaint}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSubmit(trimmed)}
            style={{
              marginTop: 14,
              height: 48,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.cardBorder,
              paddingHorizontal: 14,
              fontSize: 16,
              color: theme.text,
              backgroundColor: theme.card,
            }}
          />
          <View style={{ marginTop: 16, flexDirection: "row", gap: 12 }}>
            <Pressable onPress={onCancel} className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200">
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!trimmed}
              onPress={() => onSubmit(trimmed)}
              className={`flex-1 items-center rounded-2xl py-3.5 ${trimmed ? "bg-blue-600 active:bg-blue-700" : "bg-blue-300"}`}
            >
              <Text className="text-sm font-semibold text-white">{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default TextPromptModal;
