import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  friendlyDate,
  isOverdue,
  listAccent,
  REPEAT_LABELS,
  shortDateFromIso,
  showActions,
  useTodoTheme,
  type TodoTheme,
} from "@/src/components/todo/theme";
import {
  deleteTodoTask,
  getTodoTask,
  updateTodoTask,
  type TodoRepeatFrequency,
  type TodoStep,
  type TodoTask,
  type TodoTaskChanges,
} from "@/src/services/todoApi";
import { parseLocalDate, toDateStr, todayStr } from "@/src/utils/mealPlan";

function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// One task, expanded — steps, My Day, due date, repeat and a note
// (Remind Me and Add File are placeholders until notifications and file
// storage exist).
export default function TodoTaskScreen() {
  const router = useRouter();
  const theme = useTodoTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [task, setTask] = useState<TodoTask | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  const accent = listAccent(task?.list.color, theme);

  useFocusEffect(
    useCallback(() => {
      getTodoTask(id)
        .then((loaded) => {
          setTask(loaded);
          setTitle(loaded.title);
          setNote(loaded.note);
        })
        .catch((error) => Alert.alert("Couldn't load task", error instanceof Error ? error.message : "Something went wrong."));
    }, [id]),
  );

  function save(changes: TodoTaskChanges) {
    if (!task) return;
    const previous = task;
    setTask({ ...task, ...changes });
    updateTodoTask(task._id, changes)
      .then(({ next }) => {
        if (next) {
          Alert.alert("Next one's ready", `"${next.title}" repeats — the next one is due ${friendlyDate(next.dueDate ?? todayStr())}.`);
        }
      })
      .catch((error) => {
        setTask(previous);
        Alert.alert("Couldn't save", error instanceof Error ? error.message : "Please try again.");
      });
  }

  function saveSteps(steps: TodoStep[]) {
    save({ steps });
  }

  function chooseDueDate() {
    showActions("Due date", [
      { label: "Today", onPress: () => save({ dueDate: todayStr() }) },
      { label: "Tomorrow", onPress: () => save({ dueDate: addDays(todayStr(), 1) }) },
      { label: "Next week", onPress: () => save({ dueDate: addDays(todayStr(), 7) }) },
      {
        label: "Pick a date",
        onPress: () => {
          setPickerDate(task?.dueDate ? parseLocalDate(task.dueDate) : new Date());
          setPickingDate(true);
        },
      },
    ]);
  }

  function chooseRepeat() {
    showActions(
      "Repeat",
      (Object.keys(REPEAT_LABELS) as TodoRepeatFrequency[]).map((frequency) => ({
        label: REPEAT_LABELS[frequency],
        // Repeating needs a date to repeat from — default to today, the way
        // Microsoft To Do does.
        onPress: () => save({ repeat: { frequency, interval: 1 }, dueDate: task?.dueDate ?? todayStr() }),
      })),
    );
  }

  function confirmDelete() {
    if (!task) return;
    Alert.alert(`Delete "${task.title}"?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteTodoTask(task._id).then(
            () => router.back(),
            (error) => Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Please try again."),
          ),
      },
    ]);
  }

  if (!task) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: theme.detailBg }} />;
  }

  const inMyDay = task.myDayDate === todayStr();
  const overdue = !!task.dueDate && !task.completed && isOverdue(task.dueDate);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.detailBg }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 12,
            backgroundColor: theme.headerBg,
            borderBottomWidth: 1,
            borderBottomColor: theme.cardBorder,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={`Back to ${task.list.name}`}
            className="active:bg-slate-100"
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <Text style={{ flex: 1, marginLeft: 4, fontSize: 18, fontWeight: "600", color: theme.text }} numberOfLines={1}>
            {task.list.name}
          </Text>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 }}>
          {/* Title + steps */}
          <Card theme={theme}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 14 }}>
              <Pressable
                onPress={() => save({ completed: !task.completed })}
                accessibilityLabel={task.completed ? "Mark as not completed" : "Mark as completed"}
                hitSlop={10}
                style={{ marginTop: 3 }}
              >
                {task.completed ? (
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: theme.circle }} />
                )}
              </Pressable>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onBlur={() => {
                  const trimmed = title.trim();
                  if (!trimmed) setTitle(task.title);
                  else if (trimmed !== task.title) save({ title: trimmed });
                }}
                multiline
                style={{
                  flex: 1,
                  marginHorizontal: 14,
                  fontSize: 22,
                  fontWeight: "700",
                  color: task.completed ? theme.textFaint : theme.title,
                  textDecorationLine: task.completed ? "line-through" : "none",
                  paddingTop: 0,
                }}
              />
              <Pressable
                onPress={() => save({ important: !task.important })}
                accessibilityLabel={task.important ? "Remove importance" : "Mark as important"}
                hitSlop={10}
                style={{ marginTop: 3 }}
              >
                <Ionicons name={task.important ? "star" : "star-outline"} size={24} color={task.important ? accent : theme.circle} />
              </Pressable>
            </View>

            {task.steps.map((step, index) => (
              <StepRow
                key={step._id ?? index}
                step={step}
                theme={theme}
                accent={accent}
                onToggle={() => saveSteps(task.steps.map((s, i) => (i === index ? { ...s, completed: !s.completed } : s)))}
                onRename={(value) => saveSteps(task.steps.map((s, i) => (i === index ? { ...s, title: value } : s)))}
                onRemove={() => saveSteps(task.steps.filter((_, i) => i !== index))}
              />
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: theme.rowDivider }}>
              <Ionicons name={addingStep ? "ellipse-outline" : "add"} size={addingStep ? 20 : 24} color={addingStep ? theme.circle : accent} style={{ width: 26, textAlign: "center" }} />
              {addingStep ? (
                <TextInput
                  value={newStep}
                  onChangeText={setNewStep}
                  autoFocus
                  placeholder="Next step"
                  placeholderTextColor={theme.textFaint}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={() => {
                    const value = newStep.trim();
                    if (!value) return;
                    setNewStep("");
                    saveSteps([...task.steps, { title: value, completed: false }]);
                  }}
                  onBlur={() => {
                    if (!newStep.trim()) setAddingStep(false);
                  }}
                  style={{ flex: 1, marginLeft: 14, fontSize: 16, color: theme.text, paddingVertical: 10 }}
                />
              ) : (
                <Pressable onPress={() => setAddingStep(true)} className="active:opacity-60" style={{ flex: 1, marginLeft: 14, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: accent }}>{task.steps.length ? "Next Step" : "Add Step"}</Text>
                </Pressable>
              )}
            </View>
          </Card>

          <Card theme={theme}>
            <DetailRow
              icon="sunny-outline"
              label={inMyDay ? "Added to My Day" : "Add to My Day"}
              active={inMyDay}
              accent={accent}
              theme={theme}
              onPress={() => !inMyDay && save({ myDayDate: todayStr() })}
              onClear={inMyDay ? () => save({ myDayDate: null }) : undefined}
            />
          </Card>

          <Card theme={theme}>
            <DetailRow icon="notifications-outline" label="Remind Me" hint="Coming soon" disabled accent={accent} theme={theme} />
            <DetailRow
              icon="calendar-outline"
              label={task.dueDate ? `Due ${friendlyDate(task.dueDate)}` : "Add Due Date"}
              active={!!task.dueDate}
              activeColor={overdue ? theme.danger : undefined}
              accent={accent}
              theme={theme}
              divider
              onPress={chooseDueDate}
              onClear={task.dueDate ? () => save({ dueDate: null, repeat: null }) : undefined}
            />
            <DetailRow
              icon="repeat"
              label={task.repeat ? `Repeats ${REPEAT_LABELS[task.repeat.frequency].toLowerCase()}` : "Repeat"}
              active={!!task.repeat}
              accent={accent}
              theme={theme}
              divider
              onPress={chooseRepeat}
              onClear={task.repeat ? () => save({ repeat: null }) : undefined}
            />
          </Card>

          <Card theme={theme}>
            <DetailRow icon="attach" label="Add File" hint="Coming soon" disabled accent={accent} theme={theme} />
          </Card>

          <Card theme={theme}>
            <TextInput
              value={note}
              onChangeText={setNote}
              onBlur={() => note !== task.note && save({ note })}
              placeholder="Add Note"
              placeholderTextColor={theme.textFaint}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 120, fontSize: 16, color: theme.text, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}
            />
          </Card>
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingTop: 6,
            paddingBottom: 26,
            backgroundColor: theme.headerBg,
            borderTopWidth: 1,
            borderTopColor: theme.cardBorder,
          }}
        >
          <View style={{ width: 44 }} />
          <Text style={{ flex: 1, textAlign: "center", fontSize: 14, color: theme.textMuted }}>
            {task.completed && task.completedAt
              ? `Completed ${shortDateFromIso(task.completedAt)}`
              : `Created ${shortDateFromIso(task.createdAt)}`}
          </Text>
          <Pressable
            onPress={confirmDelete}
            accessibilityLabel="Delete task"
            className="active:bg-red-50"
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="trash-outline" size={22} color={theme.danger} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Date picker */}
      <Modal visible={pickingDate} transparent animationType="slide" onRequestClose={() => setPickingDate(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setPickingDate(false)} />
        <View style={{ backgroundColor: theme.card, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.title }}>Due date</Text>
          <DateTimePicker
            value={pickerDate}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            themeVariant="light"
            accentColor={accent}
            onChange={(_, date) => date && setPickerDate(date)}
          />
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Pressable
              onPress={() => setPickingDate(false)}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
            >
              <Text className="text-sm font-semibold text-slate-600">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setPickingDate(false);
                save({ dueDate: toDateStr(pickerDate) });
              }}
              className="flex-1 items-center rounded-2xl bg-blue-600 py-3.5 active:bg-blue-700"
            >
              <Text className="text-sm font-semibold text-white">Set date</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// The app's standard card: white, rounded-2xl, slate-200 outline.
function Card({ theme, children }: { theme: TodoTheme; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.cardBorder, overflow: "hidden" }}>
      {children}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  hint,
  active = false,
  activeColor,
  disabled = false,
  divider = false,
  accent,
  theme,
  onPress,
  onClear,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  active?: boolean;
  activeColor?: string;
  disabled?: boolean;
  divider?: boolean;
  accent: string;
  theme: TodoTheme;
  onPress?: () => void;
  onClear?: () => void;
}): ReactNode {
  const color = disabled ? theme.textFaint : active ? activeColor ?? accent : theme.icon;
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      className="active:bg-slate-50"
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 56,
        paddingLeft: 16,
        paddingRight: 6,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: theme.rowDivider,
      }}
    >
      <Ionicons name={icon} size={20} color={color} style={{ width: 26, textAlign: "center" }} />
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={{ fontSize: 16, color: active ? color : disabled ? theme.textFaint : theme.text, fontWeight: active ? "600" : "400" }}>
          {label}
        </Text>
        {hint && <Text style={{ fontSize: 13, color: theme.textFaint, marginTop: 2 }}>{hint}</Text>}
      </View>
      {onClear && (
        <Pressable onPress={onClear} accessibilityLabel={`Remove ${label}`} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="close" size={18} color={theme.textFaint} />
        </Pressable>
      )}
    </Pressable>
  );
}

function StepRow({
  step,
  theme,
  accent,
  onToggle,
  onRename,
  onRemove,
}: {
  step: TodoStep;
  theme: TodoTheme;
  accent: string;
  onToggle: () => void;
  onRename: (value: string) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(step.title);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 48, paddingLeft: 16, borderTopWidth: 1, borderTopColor: theme.rowDivider }}>
      <Pressable onPress={onToggle} hitSlop={10} style={{ width: 26, alignItems: "center" }} accessibilityLabel="Toggle step">
        {step.completed ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
        ) : (
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.circle }} />
        )}
      </Pressable>
      <TextInput
        value={value}
        onChangeText={setValue}
        onBlur={() => {
          const trimmed = value.trim();
          if (!trimmed) setValue(step.title);
          else if (trimmed !== step.title) onRename(trimmed);
        }}
        style={{
          flex: 1,
          marginLeft: 14,
          fontSize: 15,
          color: step.completed ? theme.textFaint : theme.text,
          textDecorationLine: step.completed ? "line-through" : "none",
          paddingVertical: 8,
        }}
      />
      <Pressable onPress={onRemove} accessibilityLabel="Remove step" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="close" size={18} color={theme.textFaint} />
      </Pressable>
    </View>
  );
}
