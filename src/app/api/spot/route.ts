import type { NextRequest } from "next/server";
import { getSpotDetails } from "@/lib/spot-data";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat > -9 || lat < -45 || lng < 112 || lng > 155) {
    return Response.json({ error: "Coordinates must be inside Australia." }, { status: 400 });
  }
  const details = await getSpotDetails(+lng.toFixed(4), +lat.toFixed(4));
  // Cache full results at the edge for a week; partial results (some source failed) only briefly.
  const cache = details.errors.length
    ? "public, s-maxage=300"
    : "public, s-maxage=604800, stale-while-revalidate=86400";
  return Response.json(details, { headers: { "Cache-Control": cache } });
}
