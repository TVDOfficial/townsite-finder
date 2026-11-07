import type { NextRequest } from "next/server";
import { getNearbyDetails } from "@/lib/spot-data";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat > -9 || lat < -45 || lng < 112 || lng > 155) {
    return Response.json({ error: "Coordinates must be inside Australia." }, { status: 400 });
  }
  const details = await getNearbyDetails(+lng.toFixed(4), +lat.toFixed(4));
  const ok = details.water && details.infrastructure;
  return Response.json(details, {
    headers: { "Cache-Control": ok ? "public, s-maxage=604800, stale-while-revalidate=86400" : "public, s-maxage=120" },
  });
}
