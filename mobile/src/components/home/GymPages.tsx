import { useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { clock } from "@/src/components/gym/activeSession";
import { recordTimeline } from "@/src/components/gym/progressStats";
import { dayLabel, durationLabel, weekStreak } from "@/src/components/gym/schedule";
import { sessionCalories, weightOn } from "@/src/components/gym/sessionEnergy";
import { useWatchRatio } from "@/src/components/health/watchCorrection";
import { getSessions, sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import type { OrbitColors } from "@/src/theme/orbit";

import { pageParts, PagedCard, type CardPage } from "./PagedCard";
import type { Today } from "./useToday";

// The home screen's Gym card, a page at a time: the workout under way (if
// one is), this week (the days trained, time, calories, the streak), the
// last workout (with its calories and heart rate), and the latest records.
// Each opens its page in Gym.

export function GymPages({ t, go, colors: c }: { t: Today; go: (route: Href) => void; colors: OrbitColors }) {
  const [all, setAll] = useState<GymSessionRecord[] | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  useFocusEffect(
    useCallback(() => {
      getSessions().then(setAll, () => setAll([]));
      getWeightEntries().then(setWeights, () => {});
    }, []),
  );
  const ratio = useWatchRatio();
  const { big, line, row } = pageParts(c);
  const { week, last, active } = t.gym;
  const sessions = all ?? [];
  const cal = (s: GymSessionRecord) => sessionCalories(s, sessions, weightOn(weights, s.startedAt), ratio);
  const weekCals = week.sessions.map(cal);
  const weekKcal = weekCals.reduce((n, x) => n + (x?.kcal ?? 0), 0);
  const seconds = week.sessions.reduce((n, s) => n + sessionTotals(s).seconds, 0);
  const streak = weekStreak(sessions);
  const records = recordTimeline(sessions).slice(0, 3);
  const lastCal = last ? cal(last) : null;
  const lastTotals = last ? sessionTotals(last) : null;

  const pages: CardPage[] = [
    ...(active
      ? [
          {
            title: "In progress",
            route: "/gym/session" as Href,
            body: (
              <>
                {big(active.name, "")}
                {line(`Started ${clock((Date.now() - new Date(active.startedAt).getTime()) / 1000)} ago — tap to carry on`)}
              </>
            ),
          },
        ]
      : []),
    {
      title: "This week",
      route: "/gym" as Href,
      body: (
        <>
          {big(String(week.sessions.length), `workout${week.sessions.length === 1 ? "" : "s"} this week`)}
          <View style={{ marginTop: 10, flexDirection: "row", gap: 6 }}>
            {week.days.map((d) => (
              <View key={d.date.toISOString()} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: d.today ? "800" : "600", color: d.today ? c.text : c.faint }}>{d.label}</Text>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.done ? c.ink : c.track }} />
              </View>
            ))}
          </View>
          {line(`${seconds ? `${durationLabel(seconds)} trained` : "Nothing yet this week"}${weekKcal ? ` · ${weekCals.some((x) => x && !x.measured) ? "~" : ""}${weekKcal.toLocaleString()} kcal` : ""}${streak ? ` · ${streak} week${streak === 1 ? "" : "s"} in a row` : ""}`)}
        </>
      ),
    },
    ...(last && lastTotals
      ? [
          {
            title: "Last workout",
            route: `/gym/sessions/${last._id}` as Href,
            body: (
              <>
                {big(last.name, "")}
                {line(`${dayLabel(last.finishedAt)} · ${durationLabel(lastTotals.seconds)} · ${lastTotals.sets} sets · ${Math.round(lastTotals.volume).toLocaleString()} lbs`)}
                {lastCal || last.vitals?.avgHr
                  ? line(
                      [lastCal ? `${lastCal.measured ? "" : "~"}${lastCal.kcal.toLocaleString()} kcal` : null, last.vitals?.avgHr ? `${last.vitals.avgHr} avg bpm` : null, last.vitals?.maxHr ? `${last.vitals.maxHr} peak` : null]
                        .filter(Boolean)
                        .join(" · "),
                    )
                  : null}
              </>
            ),
          },
        ]
      : []),
    {
      title: "Records",
      route: "/gym/records" as Href,
      body: records.length ? (
        <>
          {big(String(records.length === 3 ? "Latest" : records.length), records.length === 3 ? "records" : `record${records.length === 1 ? "" : "s"}`)}
          {records.map((r, i) => row(`${r.sessionId}-${i}`, "trophy", r.exercise.name, `${r.best.text} · ${r.gain}`, "#EAB308"))}
        </>
      ) : (
        <>
          {big("—", "records")}
          {line("Beat an exercise's best to set one.", true)}
        </>
      ),
    },
  ];
  return <PagedCard pages={pages} go={go} colors={c} />;
}
