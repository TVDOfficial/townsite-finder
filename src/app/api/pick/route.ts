import type { NextRequest } from "next/server";
import { randomPointIn, settlementWithin } from "@/lib/geo";
import { protectedAreaAt } from "@/lib/arcgis";
import { findEasiest } from "@/lib/easy";
import { buildingsNear } from "@/lib/buildings";
import { SIZES, type SizeKey } from "@/lib/analysis";
import { STATE_NAMES, type PickResult, type RejectedPoint, type StateCode } from "@/lib/types";

export const maxDuration = 60;

const MAX_AREA_CHECKS = 12;
const BUILDING_KM = 2;
const MAX_REJECTED = 70;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const stateParam = (sp.get("state") ?? "ALL").toUpperCase();
  const state: StateCode | "ALL" = stateParam in STATE_NAMES ? (stateParam as StateCode) : "ALL";
  const minKm = Math.min(150, Math.max(2, Number(sp.get("minKm")) || 25));
  // 2 = towns + villages count as "too close"; 3 = hamlets count too
  const maxType = sp.get("hamlets") === "1" ? 3 : 2;
  const avoidBuildings = sp.get("avoidBuildings") !== "0";

  if (sp.get("mode") === "easy") {
    const size = (sp.get("size") ?? "small") as SizeKey;
    const result = await findEasiest(state, minKm, maxType, size in SIZES ? size : "small", avoidBuildings);
    if (result) return Response.json(result);
    return Response.json(
      { error: `No buildable spot found ${minKm} km from every town in ${state === "ALL" ? "Australia" : STATE_NAMES[state]}. Try a smaller distance.`, rejected: [] },
      { status: 404 },
    );
  }

  const rejected: RejectedPoint[] = [];
  let nearSeen = 0;
  let areaChecks = 0;
  let tried = 0;
  const started = Date.now();

  while (tried < 50000 && Date.now() - started < 25000) {
    tried++;
    const r = randomPointIn(state);
    if (!r) break;
    const [lng, lat] = r.p;

    const near = settlementWithin(r.p, minKm, maxType);
    if (near) {
      // Keep an even sample of rejected points for the map animation.
      nearSeen++;
      const point: RejectedPoint = { lng, lat, reason: "near-town", label: near };
      if (rejected.length < MAX_REJECTED) rejected.push(point);
      else if (Math.random() < MAX_REJECTED / nearSeen) rejected[Math.floor(Math.random() * MAX_REJECTED)] = point;
      continue;
    }

    const result: PickResult = { lng, lat, state: r.state, rejected, tried };
    if (areaChecks >= MAX_AREA_CHECKS) {
      result.warning = avoidBuildings
        ? "Couldn't quickly find a spot clear of parks and buildings, so this one may have buildings or a reserve nearby."
        : "Couldn't find a spot outside parks and reserves quickly, so this one may be inside one.";
      return Response.json(result);
    }
    areaChecks++;
    const [pa, bld] = await Promise.all([
      protectedAreaAt(lng, lat).catch(() => undefined),
      avoidBuildings ? buildingsNear(lng, lat, BUILDING_KM).catch(() => undefined) : Promise.resolve(null),
    ]);
    if (pa) {
      rejected.push({ lng, lat, reason: pa.indigenous ? "aboriginal" : "protected", label: pa.name });
      continue;
    }
    if (bld && bld.within3km > 0) {
      rejected.push({ lng, lat, reason: "building", label: `${bld.within3km} building${bld.within3km > 1 ? "s" : ""} within ${BUILDING_KM} km` });
      continue;
    }
    if (pa === undefined) result.warning = "The parks and reserves check didn't respond, so this spot wasn't checked against them.";
    else if (bld === undefined) result.warning = "The buildings check didn't respond, so there may be houses nearby.";
    return Response.json(result);
  }

  return Response.json(
    { error: `No spot found ${minKm} km from every town in ${state === "ALL" ? "Australia" : STATE_NAMES[state]}. Try a smaller distance.`, rejected },
    { status: 404 },
  );
}
