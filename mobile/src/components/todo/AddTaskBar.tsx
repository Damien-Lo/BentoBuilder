import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { DatePickerModal } from "@/src/components/forms";
import { todayStr } from "@/src/utils/mealPlan";

import { friendlyDate } from "./theme";

export interface NewTaskInput {
  title: string;
  myDay: boolean;
  doDate: string | null;
  dueDate: string | null;
  description: string;
}

type QuickDefaults = Partial<Pick<NewTaskInput, "myDay" | "doDate" | "dueDate">>;

// The "Add a Task" bar at the top of a list. Tap it to type; for a task
// list a row of quick options appears underneath — add to My Day, a do
// date (when you plan to work on it), a due date, and a description — so a
// task can be set up without opening it. Checklists get just the text.
export function AddTaskBar({
  accent,
  checklist,
  defaults = {},
  onAdd,
}: {
  accent: string;
  checklist: boolean;
  // What's pre-selected (e.g. My Day when adding from the My Day list).
  defaults?: QuickDefaults;
  onAdd: (input: NewTaskInput) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState("");
  const [myDay, setMyDay] = useState(!!defaults.myDay);
  const [doDate, setDoDate] = useState<string | null>(defaults.doDate ?? null);
  const [dueDate, setDueDate] = useState<string | null>(defaults.dueDate ?? null);
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [picking, setPicking] = useState<"do" | "due" | null>(null);

  function reset() {
    setTitle("");
    setMyDay(!!defaults.myDay);
    setDoDate(defaults.doDate ?? null);
    setDueDate(defaults.dueDate ?? null);
    setDescription("");
    setShowDescription(false);
  }

  function submit() {
    const text = title.trim();
    if (!text) return;
    onAdd({ title: text, myDay, doDate, dueDate, description: description.trim() });
    reset();
    // Stay ready for the next one.
    inputRef.current?.focus();
  }

  const noun = checklist ? "Add an item" : "Add a Task";
  const showOptions = active && !checklist;

  return (
    <View className="border-b border-slate-200 bg-white px-4 pb-2.5 pt-2.5">
      <View className={`rounded-2xl border bg-slate-50 px-4 ${active ? "border-blue-400" : "border-slate-200"}`}>
        <Pressable
          onPress={() => {
            setActive(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="flex-row items-center"
          style={{ minHeight: 50 }}
        >
          <Ionicons name={active ? "ellipse-outline" : "add"} size={active ? 24 : 26} color={active ? "#94A3B8" : accent} />
          {active ? (
            <TextInput
              ref={inputRef}
              value={title}
              onChangeText={setTitle}
              placeholder={noun}
              placeholderTextColor="#94A3B8"
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={submit}
              onBlur={() => {
                // Collapse only if nothing was started.
                if (!title.trim() && !description.trim() && !showDescription && picking == null) setActive(false);
              }}
              className="ml-3 flex-1 text-base text-slate-900"
              style={{ paddingVertical: 12 }}
            />
          ) : (
            <Text className="ml-3 text-base font-semibold" style={{ color: accent }}>
              {noun}
            </Text>
          )}
          {active && !!title.trim() && (
            <Pressable onPress={submit} hitSlop={8} accessibilityLabel="Add" className="ml-2">
              <Ionicons name="arrow-up-circle" size={30} color={accent} />
            </Pressable>
          )}
        </Pressable>

        {showOptions && showDescription && (
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor="#94A3B8"
            multiline
            autoFocus
            className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            style={{ minHeight: 56 }}
          />
        )}

        {showOptions && (
          <View className="flex-row flex-wrap items-center gap-2 pb-3">
            <QuickChip icon="sunny-outline" label={myDay ? "My Day" : null} on={myDay} accent={accent} hint="Add to My Day" onPress={() => setMyDay((v) => !v)} />
            <QuickChip
              icon="play-circle-outline"
              label={doDate ? `Do ${friendlyDate(doDate)}` : null}
              on={!!doDate}
              accent={accent}
              hint="Set a do date"
              onPress={() => setPicking("do")}
              onClear={() => setDoDate(null)}
            />
            <QuickChip
              icon="calendar-outline"
              label={dueDate ? `Due ${friendlyDate(dueDate)}` : null}
              on={!!dueDate}
              accent={accent}
              hint="Set a due date"
              onPress={() => setPicking("due")}
              onClear={() => setDueDate(null)}
            />
            <QuickChip
              icon="document-text-outline"
              label={showDescription ? "Description" : null}
              on={showDescription}
              accent={accent}
              hint="Add a description"
              onPress={() => setShowDescription((v) => !v)}
            />
          </View>
        )}
      </View>

      <DatePickerModal
        visible={picking != null}
        title={picking === "do" ? "Do date" : "Due date"}
        value={(picking === "do" ? doDate : dueDate) ?? todayStr()}
        onCancel={() => setPicking(null)}
        onConfirm={(value) => {
          if (picking === "do") setDoDate(value);
          else setDueDate(value);
          setPicking(null);
        }}
      />
    </View>
  );
}

// One quick option: just its icon until set, then a filled chip with the
// value (and an ✕ to clear a date).
function QuickChip({
  icon,
  label,
  on,
  accent,
  hint,
  onPress,
  onClear,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string | null;
  on: boolean;
  accent: string;
  hint: string;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={hint}
      className={`h-9 flex-row items-center rounded-full ${on ? "px-3" : "w-10 justify-center"} ${on ? "" : "active:bg-slate-200"}`}
      style={on ? { backgroundColor: accent } : undefined}
    >
      <Ionicons name={icon} size={on ? 16 : 22} color={on ? "#FFFFFF" : "#64748B"} />
      {on && label && <Text className="ml-1.5 text-xs font-semibold text-white">{label}</Text>}
      {on && onClear && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear" className="ml-1.5">
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </Pressable>
      )}
    </Pressable>
  );
}

export default AddTaskBar;
