"use client";

import dynamic from "next/dynamic";

// The planner uses WebGL and browser-only APIs, so skip server rendering.
const Planner = dynamic(() => import("./Planner"), {
  ssr: false,
  loading: () => <div className="h-dvh w-full bg-[radial-gradient(ellipse_at_center,#12352a,#05090a)]" />,
});

export default function PlannerLoader() {
  return <Planner />;
}
