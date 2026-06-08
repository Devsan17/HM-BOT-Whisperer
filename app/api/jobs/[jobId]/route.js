import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getReportData } from "../../../../lib/report";

export const runtime = "nodejs";

const jobsDir = path.join(process.cwd(), "reports", "jobs");

function getJobPaths(jobId) {
  const jobDir = path.join(jobsDir, jobId);

  return {
    jobDir,
    statusPath: path.join(jobDir, "status.json"),
    reportPath: path.join(jobDir, "report.json"),
    logPath: path.join(jobDir, "audit.log"),
  };
}

export async function GET(_request, { params }) {
  const { jobId } = await params;
  const { statusPath, reportPath, logPath } = getJobPaths(jobId);

  if (!fs.existsSync(statusPath)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Job not found.",
      },
      { status: 404 }
    );
  }

  const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  const logs = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf-8").slice(-12000)
    : "";

  if (status.status === "completed" && fs.existsSync(reportPath)) {
    return NextResponse.json({
      ok: true,
      status,
      report: getReportData(reportPath),
      logs,
    });
  }

  return NextResponse.json({
    ok: true,
    status,
    report: null,
    logs,
  });
}
