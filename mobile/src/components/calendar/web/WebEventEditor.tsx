import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { MEAL_TYPES, type EventCalendar, type EventOccurrence } from "@/src/services/calendarApi";
import { hexToRgba, parseLocalDate } from "@/src/utils/mealPlan";

import {
  calendarColor,
  durationLabel,
  layoutDay,
  longDateLabel,
  minutesLabel,
  REMIND_OPTIONS,
  REPEAT_OPTIONS,
  shortDateLabel,
  WEEKDAYS_FULL,
} from "../calendarUtils";
import { useEventForm, type EventDraft } from "../useEventForm";
import { getWebScale } from "@/src/components/web/scale";
import { WebMiniMonth } from "./WebCalendarGrids";

// The desktop's event card, modelled on Outlook's full event form: Save and
// Discard along the top with the calendar it goes in, the fields down the
// left (title, when, repeat, where, reminder, notes) and, on the right, that
// day's schedule with the event drawn into it — so a clash shows as you
// pick the time. Used for a new event and to edit one.

type Hover = { hovered?: boolean };
type IconName = keyof typeof Ionicons.glyphMap;

const STEP = 15;
const PREVIEW_HOUR = 44;

export function WebEventEditor({
  draft,
  calendars,
  calendarsById,
  events,
  weekStartDay,
  today,
  onClose,
  onSaved,
}: {
  // What to open on, or null when closed.
  draft: EventDraft | null;
  calendars: EventCalendar[];
  calendarsById: Map<string, EventCalendar>;
  // Everything on show in the calendar, for the day preview.
  events: EventOccurrence[];
  weekStartDay: number;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!draft) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.4)", padding: 24 }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} accessibilityLabel="Close" />
        <EditorCard
          // A different event (or a new one) starts the form afresh.
          key={draft.mode === "edit" ? `${draft.id}-${draft.occurrence}-${draft.scope}` : `new-${draft.date}-${draft.startMinutes}-${draft.endMinutes}`}
          draft={draft}
          calendars={calendars}
          calendarsById={calendarsById}
          events={events}
          weekStartDay={weekStartDay}
          today={today}
          onClose={onClose}
          onSaved={onSaved}
        />
      </View>
    </Modal>
  );
}

function EditorCard({
  draft,
  calendars,
  calendarsById,
  events,
  weekStartDay,
  today,
  onClose,
  onSaved,
}: {
  draft: EventDraft;
  calendars: EventCalendar[];
  calendarsById: Map<string, EventCalendar>;
  events: EventOccurrence[];
  weekStartDay: number;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useEventForm(draft, calendars, onSaved);
  // Which dropdown is open, if any (one at a time).
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((prev) => (prev === id ? null : id));
  const color = calendarColor(form.calendar);
  const editingId = draft.mode === "edit" ? draft.id : null;
  const [showHiddenCalendars, setShowHiddenCalendars] = useState(false);
  const hiddenCount = calendars.filter((c) => !c.isTasks && !c.visible && c._id !== form.calendarId).length;
  // A dropdown in the form itself is open (the calendar's is in the top bar).
  const bodyOpen = !!open && open !== "calendar";

  const startOptions = Array.from({ length: 1440 / STEP }, (_, i) => ({ value: i * STEP, label: minutesLabel(i * STEP) }));
  // Ends are listed from just after the start, each with how long that makes it.
  const endOptions = Array.from({ length: 1440 / STEP - 1 }, (_, i) => {
    const length = (i + 1) * STEP;
    const value = (form.startMinutes + length) % 1440;
    return { value, label: `${minutesLabel(value)}  ·  ${durationLabel(length)}` };
  });

  const scopeNote =
    form.scope === "one"
      ? "Changing only this one event. The rest of the series stays as it is."
      : form.scope === "following"
        ? "Changing this event and the ones after it. Earlier ones stay as they are."
        : form.scope === "all"
          ? "Changing every event in this series."
          : null;

  return (
    <View
      style={{
        width: "100%",
        maxWidth: 1040,
        height: 680,
        maxHeight: "100%",
        borderRadius: 18,
        backgroundColor: "#FFFFFF",
        boxShadow: "0 24px 60px rgba(15,23,42,0.3)",
      }}
    >
      {/* Closes an open dropdown when anything else in the card is clicked.
          Each layer of the card stacks on its own, so there is one of these
          per layer, each just beneath whatever holds the open dropdown. */}
      {open && <Catcher onPress={() => setOpen(null)} />}

      {/* Top bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          height: 58,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          backgroundColor: "#F8FAFC",
          zIndex: open === "calendar" ? 30 : 2,
        }}
      >
        <BarButton label={form.saving ? "Saving…" : "Save"} icon="checkmark" primary disabled={form.saving || form.loading} onPress={() => void form.save()} />
        <BarButton label="Discard" icon="close" onPress={onClose} />
        {form.editing && <BarButton label="Delete" icon="trash-outline" danger onPress={form.confirmDelete} />}
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: "#64748B" }}>Calendar</Text>
        <View>
          <FieldButton onPress={() => toggle("calendar")} minWidth={190}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 8 }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#0F172A" }}>
              {form.calendar?.name ?? "Calendar"}
            </Text>
          </FieldButton>
          {open === "calendar" && (
            <Popover width={240} align="right">
              {/* The calendars on show (and the one it's in, if that's hidden);
                  the hidden ones are a click away. */}
              {calendars
                .filter((c) => !c.isTasks && (c.visible || c._id === form.calendarId || showHiddenCalendars))
                .map((c) => (
                  <Option
                    key={c._id}
                    label={c.visible ? c.name : `${c.name} (hidden)`}
                    dot={calendarColor(c)}
                    selected={c._id === form.calendarId}
                    onPress={() => {
                      form.setCalendarId(c._id);
                      setOpen(null);
                    }}
                  />
                ))}
              {!showHiddenCalendars && hiddenCount > 0 && (
                <Pressable
                  onPress={() => setShowHiddenCalendars(true)}
                  style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 34, paddingHorizontal: 10, borderRadius: 8, backgroundColor: hovered ? "#F1F5F9" : "transparent" })}
                >
                  <Ionicons name="chevron-forward" size={13} color="#64748B" />
                  <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: "#64748B" }}>Hidden calendars ({hiddenCount})</Text>
                </Pressable>
              )}
            </Popover>
          )}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close"
          style={({ hovered }: Hover) => ({ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hovered ? "#E2E8F0" : "transparent" })}
        >
          <Ionicons name="close" size={20} color="#475569" />
        </Pressable>
      </View>

      {scopeNote && (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 8, backgroundColor: "#EFF6FF", borderBottomWidth: 1, borderBottomColor: "#DBEAFE" }}>
          <Ionicons name="repeat" size={15} color="#1D4ED8" />
          <Text style={{ marginLeft: 8, fontSize: 13, color: "#1E3A8A" }}>{scopeNote}</Text>
        </View>
      )}

      {form.loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <View style={{ flex: 1, flexDirection: "row", zIndex: bodyOpen ? 20 : 1 }}>
          {bodyOpen && <Catcher onPress={() => setOpen(null)} />}
          {/* The form */}
          <View style={{ flex: 1, padding: 20, paddingRight: 24, zIndex: bodyOpen ? 20 : 1 }}>
            {bodyOpen && <Catcher onPress={() => setOpen(null)} />}
            {/* Title */}
            <FormRow z={1}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, marginTop: 14 }} />
              <TextInput
                value={form.title}
                onChangeText={form.setTitle}
                placeholder="Add a title"
                placeholderTextColor="#94A3B8"
                autoFocus={!form.editing}
                onSubmitEditing={() => void form.save()}
                style={{ flex: 1, height: 44, fontSize: 22, fontWeight: "600", color: "#0F172A", borderBottomWidth: 2, borderBottomColor: "#E2E8F0", paddingHorizontal: 2 }}
              />
            </FormRow>

            {/* Which meal — only in the Meals calendar */}
            {form.isMeal && (
              <FormRow icon="restaurant-outline" z={1}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {MEAL_TYPES.map((meal) => {
                    const on = form.mealSlot === meal.value;
                    return (
                      <Pressable
                        key={meal.value}
                        onPress={() => form.pickMeal(meal.value)}
                        style={({ hovered }: Hover) => ({
                          height: 34,
                          paddingHorizontal: 14,
                          justifyContent: "center",
                          borderRadius: 10,
                          backgroundColor: on ? "#2563EB" : hovered ? "#E2E8F0" : "#F1F5F9",
                        })}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: on ? "#FFFFFF" : "#334155" }}>{meal.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ marginLeft: 10, alignSelf: "center", fontSize: 12, color: "#94A3B8" }}>shows this meal from your planner</Text>
              </FormRow>
            )}

            {/* When */}
            <FormRow icon="time-outline" z={open === "date" || open === "start" || open === "end" || open === "endDate" ? 20 : 1}>
              <View>
                <FieldButton onPress={() => toggle("date")} minWidth={168}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0F172A" }}>
                    {shortDateLabel(form.date)} {parseLocalDate(form.date).getFullYear()}
                  </Text>
                </FieldButton>
                {open === "date" && (
                  <Popover width={264} padded>
                    <WebMiniMonth
                      focusDate={form.date}
                      today={today}
                      weekStartDay={weekStartDay}
                      shownDays={[]}
                      onPick={(date) => {
                        form.changeStartDate(date);
                        setOpen(null);
                      }}
                    />
                  </Popover>
                )}
              </View>

              {form.allDay ? (
                <>
                  <Text style={{ alignSelf: "center", marginHorizontal: 8, fontSize: 13, color: "#64748B" }}>to</Text>
                  <View>
                    <FieldButton onPress={() => toggle("endDate")} minWidth={168}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0F172A" }}>
                        {shortDateLabel(form.endDate)} {parseLocalDate(form.endDate).getFullYear()}
                      </Text>
                    </FieldButton>
                    {open === "endDate" && (
                      <Popover width={264} padded>
                        <WebMiniMonth
                          focusDate={form.endDate}
                          today={today}
                          weekStartDay={weekStartDay}
                          shownDays={[]}
                          onPick={(date) => {
                            form.changeEndDate(date);
                            setOpen(null);
                          }}
                        />
                      </Popover>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={{ marginLeft: 8 }}>
                    <FieldButton onPress={() => toggle("start")} minWidth={92}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{minutesLabel(form.startMinutes)}</Text>
                    </FieldButton>
                    {open === "start" && (
                      <TimeList
                        options={startOptions}
                        value={form.startMinutes}
                        width={120}
                        onPick={(value) => {
                          form.changeStartTime(value);
                          setOpen(null);
                        }}
                      />
                    )}
                  </View>
                  <Text style={{ alignSelf: "center", marginHorizontal: 8, fontSize: 13, color: "#64748B" }}>to</Text>
                  <View>
                    <FieldButton onPress={() => toggle("end")} minWidth={92}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{minutesLabel(form.endMinutes)}</Text>
                    </FieldButton>
                    {open === "end" && (
                      <TimeList
                        options={endOptions}
                        value={form.endMinutes % 1440}
                        width={210}
                        onPick={(value) => {
                          form.changeEndTime(value);
                          setOpen(null);
                        }}
                      />
                    )}
                  </View>
                </>
              )}

              <Pressable
                onPress={() => form.setAllDay(!form.allDay)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.allDay }}
                style={{ flexDirection: "row", alignItems: "center", marginLeft: 14 }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: form.allDay ? "#2563EB" : "#94A3B8",
                    backgroundColor: form.allDay ? "#2563EB" : "#FFFFFF",
                  }}
                >
                  {form.allDay && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                </View>
                <Text style={{ marginLeft: 7, fontSize: 13, color: "#334155" }}>All day</Text>
              </Pressable>
            </FormRow>
            {!form.allDay && (
              <Text style={{ marginLeft: 40, marginTop: -6, marginBottom: 10, fontSize: 12, color: form.overnight ? "#D97706" : "#94A3B8" }}>
                {durationLabel(form.duration)}
                {form.overnight ? " · ends the next day" : ""}
              </Text>
            )}

            {/* Repeat (a single event taken out of its series doesn't) */}
            {form.scope !== "one" && (
              <FormRow icon="repeat" z={open === "repeat" || open === "until" ? 20 : 1}>
                <View>
                  <FieldButton onPress={() => toggle("repeat")} minWidth={168}>
                    <Text style={{ flex: 1, fontSize: 14, color: "#0F172A" }}>
                      {form.repeatFrequency ? REPEAT_OPTIONS.find((o) => o.value === form.repeatFrequency)?.label : "Don't repeat"}
                    </Text>
                  </FieldButton>
                  {open === "repeat" && (
                    <Popover width={200}>
                      {REPEAT_OPTIONS.map((option) => (
                        <Option
                          key={String(option.value)}
                          label={option.value ? option.label : "Don't repeat"}
                          selected={option.value === form.repeatFrequency}
                          onPress={() => {
                            form.setRepeatFrequency(option.value);
                            setOpen(null);
                          }}
                        />
                      ))}
                    </Popover>
                  )}
                </View>

                {form.repeatFrequency === "weekly" && (
                  <View style={{ flexDirection: "row", gap: 4, marginLeft: 10, alignSelf: "center" }}>
                    {Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7).map((day) => {
                      const on = form.repeatDays.includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() => form.toggleRepeatDay(day)}
                          accessibilityLabel={WEEKDAYS_FULL[day]}
                          style={({ hovered }: Hover) => ({
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: on ? "#2563EB" : hovered ? "#E2E8F0" : "#F1F5F9",
                          })}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#FFFFFF" : "#475569" }}>{WEEKDAYS_FULL[day][0]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {form.repeatFrequency && (
                  <>
                    <Text style={{ alignSelf: "center", marginHorizontal: 8, fontSize: 13, color: "#64748B" }}>until</Text>
                    <View>
                      <FieldButton onPress={() => toggle("until")} minWidth={132}>
                        <Text style={{ flex: 1, fontSize: 14, color: "#0F172A" }}>
                          {form.repeatUntil ? `${shortDateLabel(form.repeatUntil)} ${parseLocalDate(form.repeatUntil).getFullYear()}` : "Forever"}
                        </Text>
                      </FieldButton>
                      {open === "until" && (
                        <Popover width={264} padded align="right">
                          <WebMiniMonth
                            focusDate={form.repeatUntil ?? form.date}
                            today={today}
                            weekStartDay={weekStartDay}
                            shownDays={[]}
                            onPick={(date) => {
                              form.setRepeatUntil(date);
                              setOpen(null);
                            }}
                          />
                          <Pressable
                            onPress={() => {
                              form.setRepeatUntil(null);
                              setOpen(null);
                            }}
                            style={({ hovered }: Hover) => ({ marginTop: 8, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: hovered ? "#E2E8F0" : "#F1F5F9" })}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Repeat forever</Text>
                          </Pressable>
                        </Popover>
                      )}
                    </View>
                  </>
                )}
              </FormRow>
            )}

            {/* Where */}
            <FormRow icon="location-outline" z={1}>
              <TextInput
                value={form.location}
                onChangeText={form.setLocation}
                placeholder="Add a location"
                placeholderTextColor="#94A3B8"
                style={{ flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 12, fontSize: 14, color: "#0F172A" }}
              />
            </FormRow>

            {/* Reminder */}
            <FormRow icon="notifications-outline" z={open === "remind" ? 20 : 1}>
              <View>
                <FieldButton onPress={() => toggle("remind")} minWidth={190}>
                  <Text style={{ flex: 1, fontSize: 14, color: "#0F172A" }}>
                    {form.remindMinutes == null ? "Don't remind me" : REMIND_OPTIONS.find((o) => o.value === form.remindMinutes)?.label ?? `${form.remindMinutes} minutes before`}
                  </Text>
                </FieldButton>
                {open === "remind" && (
                  <Popover width={210}>
                    {REMIND_OPTIONS.map((option) => (
                      <Option
                        key={String(option.value)}
                        label={option.value == null ? "Don't remind me" : option.label}
                        selected={option.value === form.remindMinutes}
                        onPress={() => {
                          form.setRemindMinutes(option.value);
                          setOpen(null);
                        }}
                      />
                    ))}
                  </Popover>
                )}
              </View>
              <Text style={{ marginLeft: 10, alignSelf: "center", fontSize: 12, color: "#94A3B8" }}>saved with the event; notifications come later</Text>
            </FormRow>

            {/* Notes */}
            <FormRow icon="reorder-three-outline" z={1} grow>
              <TextInput
                value={form.description}
                onChangeText={form.setDescription}
                placeholder="Add a description"
                placeholderTextColor="#94A3B8"
                multiline
                style={{
                  flex: 1,
                  minHeight: 90,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#CBD5E1",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  lineHeight: 20,
                  color: "#0F172A",
                  textAlignVertical: "top",
                }}
              />
            </FormRow>
          </View>

          {/* That day, with this event in it */}
          <DayPreview
            date={form.date}
            allDay={form.allDay}
            startMinutes={form.startMinutes}
            endMinutes={form.overnight ? 1440 : form.endMinutes}
            title={form.title.trim() || "(No title)"}
            color={color}
            events={events.filter((e) => !(editingId && e._id === editingId))}
            calendarsById={calendarsById}
            onMove={form.changeStartTime}
            onSpan={form.setTimes}
          />
        </View>
      )}
    </View>
  );
}

function Catcher({ onPress }: { onPress: () => void }) {
  return <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, cursor: "default" } as object} onPress={onPress} accessibilityLabel="Close the list" />;
}

// One line of the form: an icon in the margin, then its fields.
function FormRow({ icon, children, z, grow }: { icon?: IconName; children: ReactNode; z: number; grow?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 14, zIndex: z, flex: grow ? 1 : undefined }}>
      {/* (A row with no icon brings its own marker, e.g. the title's dot.) */}
      {icon ? (
        <View style={{ width: 40, height: 38, justifyContent: "center" }}>
          <Ionicons name={icon} size={19} color="#64748B" />
        </View>
      ) : null}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          flexWrap: grow ? "nowrap" : "wrap",
          // (The notes box fills whatever height is left.)
          alignItems: grow ? "stretch" : "flex-start",
          alignSelf: grow ? "stretch" : undefined,
          gap: icon ? 0 : 26,
        }}
      >
        {children}
      </View>
    </View>
  );
}

// A field that opens a list or a date picker under it.
function FieldButton({ children, onPress, minWidth }: { children: ReactNode; onPress: () => void; minWidth: number }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: Hover) => ({
        flexDirection: "row",
        alignItems: "center",
        height: 38,
        minWidth,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: hovered ? "#94A3B8" : "#CBD5E1",
        backgroundColor: "#FFFFFF",
      })}
    >
      {children}
      <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

function Popover({ children, width, padded, align = "left" }: { children: ReactNode; width: number; padded?: boolean; align?: "left" | "right" }) {
  return (
    <View
      style={{
        position: "absolute",
        top: 42,
        [align]: 0,
        width,
        zIndex: 50,
        padding: padded ? 12 : 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 12px 28px rgba(15,23,42,0.18)",
      }}
    >
      {children}
    </View>
  );
}

function Option({ label, selected, dot, onPress }: { label: string; selected: boolean; dot?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: Hover) => ({
        flexDirection: "row",
        alignItems: "center",
        height: 34,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: selected ? "#EFF6FF" : hovered ? "#F1F5F9" : "transparent",
      })}
    >
      {!!dot && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot, marginRight: 8 }} />}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: selected ? "700" : "400", color: selected ? "#1D4ED8" : "#0F172A" }}>
        {label}
      </Text>
      {selected && <Ionicons name="checkmark" size={14} color="#1D4ED8" />}
    </Pressable>
  );
}

// A scrolling list of times, opened on the one that's set.
function TimeList({ options, value, width, onPick }: { options: { value: number; label: string }[]; value: number; width: number; onPick: (value: number) => void }) {
  const list = useRef<ScrollView>(null);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  useEffect(() => {
    list.current?.scrollTo({ y: Math.max(0, index * 34 - 102), animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Popover width={width}>
      <ScrollView ref={list} style={{ maxHeight: 272 }}>
        {options.map((option) => (
          <Option key={option.value} label={option.label} selected={option.value === value} onPress={() => onPick(option.value)} />
        ))}
      </ScrollView>
    </Popover>
  );
}

function BarButton({
  label,
  icon,
  primary,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const text = primary ? "#FFFFFF" : danger ? "#DC2626" : "#334155";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ hovered }: Hover) => ({
        flexDirection: "row",
        alignItems: "center",
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? "#FECACA" : "#CBD5E1",
        opacity: disabled ? 0.6 : 1,
        backgroundColor: primary ? (hovered ? "#1D4ED8" : "#2563EB") : hovered ? (danger ? "#FEF2F2" : "#F1F5F9") : "#FFFFFF",
      })}
    >
      <Ionicons name={icon} size={16} color={text} style={{ marginRight: 6 }} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: text }}>{label}</Text>
    </Pressable>
  );
}

// The event's day down the right of the card: what's already there, with
// this event drawn over it. Click a time to move the event there (keeping
// its length), or press and drag to set both ends.
function DayPreview({
  date,
  allDay,
  startMinutes,
  endMinutes,
  title,
  color,
  events,
  calendarsById,
  onMove,
  onSpan,
}: {
  date: string;
  allDay: boolean;
  startMinutes: number;
  endMinutes: number;
  title: string;
  color: string;
  events: EventOccurrence[];
  calendarsById: Map<string, EventCalendar>;
  onMove: (startMinutes: number) => void;
  onSpan: (startMinutes: number, endMinutes: number) => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const column = useRef<View>(null);
  const top = useRef(0);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  // Keep the event in view as its time changes.
  useEffect(() => {
    scroller.current?.scrollTo({ y: Math.max(0, (startMinutes / 60) * PREVIEW_HOUR - 90), animated: true });
  }, [startMinutes, date]);

  const onDay = events.filter((e) => date >= e.occurrenceDate && date <= e.occurrenceEndDate);
  const allDayEvents = onDay.filter((e) => e.allDay);
  const laidOut = layoutDay(onDay.filter((e) => !e.allDay), date);
  const clashes = allDay
    ? 0
    : laidOut.filter((l) => l.start < endMinutes && l.end > startMinutes).length;

  const minutesAt = (pageY: number) => Math.max(0, Math.min(1440, Math.round((((pageY - top.current) / getWebScale() / PREVIEW_HOUR) * 60) / STEP) * STEP));
  const span = drag && { start: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) };

  return (
    <View style={{ width: 300, borderLeftWidth: 1, borderLeftColor: "#E2E8F0", backgroundColor: "#F8FAFC", borderBottomRightRadius: 18 }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>{date ? longDateLabel(date) : ""}</Text>
        <Text style={{ marginTop: 2, fontSize: 12, color: clashes ? "#D97706" : "#64748B" }}>
          {allDay ? "All day" : clashes ? `Overlaps ${clashes} other event${clashes === 1 ? "" : "s"}` : "Nothing else at this time"}
        </Text>
        {allDayEvents.length > 0 && (
          <Text numberOfLines={2} style={{ marginTop: 4, fontSize: 12, color: "#64748B" }}>
            All day: {allDayEvents.map((e) => e.title).join(", ")}
          </Text>
        )}
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", height: 24 * PREVIEW_HOUR }}>
          <View style={{ width: 44 }}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{ height: PREVIEW_HOUR, alignItems: "flex-end", paddingRight: 6 }}>
                {h > 0 && <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: -6 }}>{minutesLabel(h * 60)}</Text>}
              </View>
            ))}
          </View>
          <View ref={column} style={{ flex: 1, marginRight: 10, borderLeftWidth: 1, borderLeftColor: "#E2E8F0", backgroundColor: "#FFFFFF" }}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} pointerEvents="none" style={{ position: "absolute", top: h * PREVIEW_HOUR, left: 0, right: 0, borderTopWidth: 1, borderTopColor: "#EEF2F7" }} />
            ))}

            {laidOut.map(({ event, start, end, column: col, columns }) => {
              const eventColor = calendarColor(calendarsById.get(event.calendar));
              const widthPct = 100 / columns;
              return (
                <View
                  key={`${event._id}-${event.occurrenceDate}`}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: (start / 60) * PREVIEW_HOUR + 1,
                    height: Math.max(12, ((end - start) / 60) * PREVIEW_HOUR - 2),
                    left: `${col * widthPct}%`,
                    width: `${widthPct}%`,
                    paddingRight: 2,
                  }}
                >
                  <View style={{ flex: 1, overflow: "hidden", borderRadius: 5, backgroundColor: hexToRgba(eventColor, 0.16), borderLeftWidth: 3, borderLeftColor: eventColor, paddingHorizontal: 5 }}>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: "#475569" }}>
                      {event.title}
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* Click or drag on the day to set the time. */}
            <View
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, cursor: "cell" } as object}
              onStartShouldSetResponder={() => !allDay}
              onResponderGrant={(e) => {
                const rect = (column.current as unknown as { getBoundingClientRect?: () => { top: number } } | null)?.getBoundingClientRect?.();
                top.current = (rect?.top ?? 0) + (typeof window !== "undefined" ? window.scrollY : 0);
                const at = minutesAt(e.nativeEvent.pageY);
                setDrag({ from: at, to: at });
              }}
              onResponderMove={(e) => {
                const to = minutesAt(e.nativeEvent.pageY);
                setDrag((prev) => (prev ? { ...prev, to } : prev));
              }}
              onResponderRelease={() => {
                if (span) {
                  if (span.end - span.start < STEP) onMove(Math.min(1440 - STEP, Math.floor(span.start / 30) * 30));
                  else onSpan(span.start, span.end);
                }
                setDrag(null);
              }}
              onResponderTerminate={() => setDrag(null)}
            />

            {/* This event (or the span being dragged out) */}
            {!allDay && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 2,
                  right: 2,
                  top: ((span && span.end > span.start ? span.start : startMinutes) / 60) * PREVIEW_HOUR,
                  height: Math.max(14, (((span && span.end > span.start ? span.end - span.start : endMinutes - startMinutes) || STEP) / 60) * PREVIEW_HOUR),
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: color,
                  backgroundColor: hexToRgba(color, 0.28),
                  paddingHorizontal: 6,
                  paddingTop: 2,
                  overflow: "hidden",
                }}
              >
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "700", color: "#0F172A" }}>
                  {title}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 10, color: "#334155" }}>
                  {span && span.end > span.start
                    ? `${minutesLabel(span.start)} – ${minutesLabel(span.end)}`
                    : `${minutesLabel(startMinutes)} – ${minutesLabel(endMinutes)}`}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <Text style={{ paddingHorizontal: 14, paddingVertical: 8, fontSize: 11, color: "#94A3B8", borderTopWidth: 1, borderTopColor: "#E2E8F0" }}>
        Click a time to move it there, or drag to set its start and end.
      </Text>
    </View>
  );
}
