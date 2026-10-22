import { GymTabPage, Planned } from "@/src/components/gym/GymTabPage";

// Gym → Overview: how training's going at a glance — this week, what's
// next, and the latest session.
export default function GymOverviewTab() {
  return (
    <GymTabPage title="Gym" subtitle="Your training at a glance">
      <Planned icon="speedometer" title="Your overview is coming" detail="This week's sessions, what's next, and how your last workout went." />
    </GymTabPage>
  );
}
