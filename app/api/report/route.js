import { NextResponse } from "next/server";
import { getReportData } from "../../../lib/report";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getReportData());
}
