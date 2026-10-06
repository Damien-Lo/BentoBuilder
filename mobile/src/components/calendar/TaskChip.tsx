import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { EventOccurrence } from "@/src/services/calendarApi";
import type { CalendarTask } from "@/src/services/todoApi";

// How a task from Lists is drawn in the calendar. Calendars are already
// told apart by colour, so tasks are told apart by shape instead:
//   a task's own deadline — a solid chip with a flag;
//   a subtask / milestone  — an outlined chip with a diamond, labelled
//                            "Parent › Subtask".
// Both carry the top-level task's number, so one task's items read as a set.
// Done ones are struck through and faded; overdue ones turn red.

// A calendar-enabled task as an all-day "occurrence" on its due date.
export function taskToOccurrence(task: CalendarTask, calendarId: string, today: string): EventOccurrence {
  return {
    _id: `task-${task._id}`,
    title: task.title,
    calendar: calendarId,
    allDay: true,
    date: task.dueDate,
    endDate: task.dueDate,
    startMinutes: 0,
    endMinutes: 0,
    repeat: null,
    excludedDates: [],
    location: "",
    description: "",
    remindMinutes: null,
    occurrenceDate: task.dueDate,
    occurrenceEndDate: task.dueDate,
    task: {
      id: task._id,
      rootId: task.root._id,
      depth: task.depth,
      completed: task.completed,
      overdue: !task.completed && task.dueDate < today,
      number: task.number,
      rootTitle: task.root.title,
      rootNumber: task.root.number,
    },
  };
}

export function TaskChip({
  event,
  color,
  size = "regular",
}: {
  event: EventOccurrence;
  color: string;
  // "small" for the month grid's tiny cells.
  size?: "regular" | "small";
}) {
  const task = event.task!;
  const isSubtask = task.depth > 0;
  const small = size === "small";
  const textColor = task.overdue ? "#DC2626" : isSubtask ? "#0F172A" : "#FFFFFF";
  const number = task.rootNumber != null ? `#${task.rootNumber} ` : "";

  return (
    <View
      className={`flex-row items-center ${small ? "mb-0.5 rounded px-1" : "rounded-md px-1.5 py-0.5"}`}
      style={{
        opacity: task.completed ? 0.45 : 1,
        borderWidth: 1,
        borderColor: task.overdue ? "#DC2626" : color,
        borderStyle: isSubtask ? "dashed" : "solid",
        backgroundColor: isSubtask ? "#FFFFFF" : task.overdue ? "#FEF2F2" : color,
      }}
    >
      <Ionicons
        name={isSubtask ? "diamond-outline" : "flag"}
        size={small ? 7 : 10}
        color={task.overdue ? "#DC2626" : isSubtask ? color : "#FFFFFF"}
      />
      <Text
        numberOfLines={1}
        className={`ml-1 flex-1 ${small ? "text-[9px] font-medium" : "text-[11px] font-semibold"}`}
        style={{ color: textColor, textDecorationLine: task.completed ? "line-through" : "none" }}
      >
        {small ? "" : number}
        {isSubtask && !small ? `${task.rootTitle} › ` : ""}
        {event.title}
      </Text>
    </View>
  );
}

export default TaskChip;
