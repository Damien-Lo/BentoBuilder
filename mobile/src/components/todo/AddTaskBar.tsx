import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { DatePickerModal } from "@/src/components/forms";
import { Tap } from "@/src/components/ui/Tap";
import { useOrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { todayStr } from "@/src/utils/mealPlan";
import { useWideWeb } from "@/src/utils/useWideWeb";

import { readableAccent } from "./TaskBits";
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
// On a page in Orbit's look it takes the page's colours (the list's own
// colour still on its + and chips); elsewhere it keeps the older look.
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
  const o = useOrbitPage();
  // (The list's colour as text and icons: lightened in the dark, to read.)
  const shown = readableAccent(accent, o, useOrbitTheme().dark);
  // In Orbit's look on the desktop it's a card in its pane, not a band
  // across the top of a page: no padding of its own, no hairline under it.
  const wide = useWideWeb();
  const pane = !!o && wide;
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
    <View
      className="border-b border-slate-200 bg-white px-4 pb-2.5 pt-2.5"
      style={[o && { backgroundColor: o.canvas, borderBottomColor: o.border }, pane && { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, borderBottomWidth: 0, backgroundColor: "transparent" }]}
    >
      <View
        className={`rounded-2xl border bg-slate-50 px-4 ${active ? "border-blue-400" : "border-slate-200"}`}
        style={o && { backgroundColor: o.surface, borderColor: active ? o.selectedRing : o.border, borderRadius: 18 }}
      >
        <Pressable
          onPress={() => {
            setActive(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="flex-row items-center"
          style={{ minHeight: 50 }}
        >
          <Ionicons name={active ? "ellipse-outline" : "add"} size={active ? 24 : 26} color={active ? (o?.faint ?? "#94A3B8") : shown} />
          {active ? (
            <TextInput
              ref={inputRef}
              value={title}
              onChangeText={setTitle}
              placeholder={noun}
              placeholderTextColor={o?.faint ?? "#94A3B8"}
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={submit}
              onBlur={() => {
                // Collapse only if nothing was started.
                if (!title.trim() && !description.trim() && !showDescription && picking == null) setActive(false);
              }}
              className="ml-3 flex-1 text-base text-slate-900"
              style={[{ paddingVertical: 12 }, o && { color: o.text }]}
            />
          ) : (
            <Text className="ml-3 text-base font-semibold" style={{ color: shown }}>
              {noun}
            </Text>
          )}
          {active && !!title.trim() && (
            <Pressable onPress={submit} hitSlop={8} accessibilityLabel="Add" className="ml-2">
              <Ionicons name="arrow-up-circle" size={30} color={shown} />
            </Pressable>
          )}
        </Pressable>

        {showOptions && showDescription && (
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor={o?.faint ?? "#94A3B8"}
            multiline
            autoFocus
            className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            style={[{ minHeight: 56 }, o && { backgroundColor: o.canvas, borderColor: o.border, color: o.text }]}
          />
        )}

        {showOptions && (
          <View className="flex-row flex-wrap items-center gap-2 pb-3">
            <QuickChip icon="sunny-outline" label={myDay ? "My Day" : null} on={myDay} accent={accent} o={o} hint="Add to My Day" onPress={() => setMyDay((v) => !v)} />
            <QuickChip
              icon="play-circle-outline"
              label={doDate ? `Do ${friendlyDate(doDate)}` : null}
              on={!!doDate}
              accent={accent}
              o={o}
              hint="Set a do date"
              onPress={() => setPicking("do")}
              onClear={() => setDoDate(null)}
            />
            <QuickChip
              icon="calendar-outline"
              label={dueDate ? `Due ${friendlyDate(dueDate)}` : null}
              on={!!dueDate}
              accent={accent}
              o={o}
              hint="Set a due date"
              onPress={() => setPicking("due")}
              onClear={() => setDueDate(null)}
            />
            <QuickChip
              icon="document-text-outline"
              label={showDescription ? "Description" : null}
              on={showDescription}
              accent={accent}
              o={o}
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
  o,
  hint,
  onPress,
  onClear,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string | null;
  on: boolean;
  accent: string;
  // The page's colours in Orbit's look, else null.
  o: OrbitColors | null;
  hint: string;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    // (Held, an unset one shows a soft circle; a set one doesn't change.)
    <Tap
      onPress={onPress}
      accessibilityLabel={hint}
      className={`h-9 flex-row items-center rounded-full ${on ? "px-3" : "w-10 justify-center"}`}
      style={on ? { backgroundColor: accent } : undefined}
      pressedStyle={on ? {} : { backgroundColor: o?.pill ?? "#E2E8F0" }}
    >
      <Ionicons name={icon} size={on ? 16 : 22} color={on ? "#FFFFFF" : (o?.muted ?? "#64748B")} />
      {on && label && <Text className="ml-1.5 text-xs font-semibold text-white">{label}</Text>}
      {on && onClear && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear" className="ml-1.5">
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </Pressable>
      )}
    </Tap>
  );
}

export default AddTaskBar;
