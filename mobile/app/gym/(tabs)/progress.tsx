import { GymTabPage, Planned } from "@/src/components/gym/GymTabPage";

// Gym → Progress: personal records, each exercise's chart, and your history.
export default function ProgressTab() {
  return (
    <GymTabPage title="Progress" subtitle="Records, charts and your history">
      <Planned icon="stats-chart" title="Progress is coming" detail="Your best lifts, how each exercise is going, and every session you've done." />
    </GymTabPage>
  );
}
