import { useRouter, type Href } from "expo-router";
import { Alert } from "react-native";

import { clearActiveSession, type ActiveSession } from "@/src/components/gym/activeSession";
import type { GymWorkout } from "@/src/services/gymApi";

// Starting a workout (gym/session) — unless another's under way: carry on
// with that, or drop it and start this one. (`active`: the one under way,
// if any.)
export function useStartWorkout(active: ActiveSession | null) {
  const router = useRouter();
  const resume = () => router.push("/gym/session" as Href);
  function start(workout: GymWorkout) {
    if (!active) return router.push(`/gym/session?workout=${workout._id}` as Href);
    if (active.workoutId === workout._id) return resume();
    Alert.alert("A workout's under way", `${active.name} isn't finished. Carry on with it, or discard it and start ${workout.name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: `Resume ${active.name}`, onPress: resume },
      { text: "Discard it", style: "destructive", onPress: () => void clearActiveSession().then(() => router.push(`/gym/session?workout=${workout._id}` as Href)) },
    ]);
  }
  return { start, resume };
}
