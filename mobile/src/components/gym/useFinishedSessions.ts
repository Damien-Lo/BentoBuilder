import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { getSessions, type GymSessionRecord } from "@/src/services/gymApi";

// Every workout you've finished, the latest first — loaded again each time
// the page comes back into view (null until then; `failed` if they
// couldn't be). For Progress's pages, on the phone and the desktop alike.
export function useFinishedSessions() {
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  useFocusEffect(
    useCallback(() => {
      getSessions().then(setSessions, () => setFailed(true));
    }, []),
  );
  return { sessions, failed };
}
