import { KitchenOverview } from "@/app/kitchen/index";

// The phone's Kitchen opens here: what needs doing, what's wrong with the
// plan, and what's booked (the same page as Kitchen → Overview).
export default function OverviewTab() {
  return <KitchenOverview inTabs />;
}
