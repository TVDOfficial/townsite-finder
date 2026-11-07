import type { Metadata } from "next";
import PlannerLoader from "@/components/planner/PlannerLoader";

export const metadata: Metadata = { title: "Town planner — Townsite" };

export default function PlanPage() {
  return <PlannerLoader />;
}
