import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const jobsDir = path.join(process.cwd(), "reports", "jobs");
const workerPath = path.join(process.cwd(), "scripts", "audit-job-runner.js");

function normalizeUrl(input) {
  const trimmed = `${input || ""}`.trim();

  if (!trimmed) {
    throw new Error("Please enter a URL to scan.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return new URL(withProtocol).toString();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getActiveJob() {
  if (!fs.existsSync(jobsDir)) {
    return null;
  }

  const entries = fs.readdirSync(jobsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const statusPath = path.join(jobsDir, entry.name, "status.json");
    if (!fs.existsSync(statusPath)) {
      continue;
    }

    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    if (status.status === "queued" || status.status === "running") {
      return status;
    }
  }

  return null;
}

function writeJobStatus(jobId, status) {
  const jobDir = path.join(jobsDir, jobId);
  ensureDir(jobDir);
  fs.writeFileSync(
    path.join(jobDir, "status.json"),
    JSON.stringify(status, null, 2)
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const targetUrl = normalizeUrl(body?.url);
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    ensureDir(jobsDir);

    const activeJob = getActiveJob();
    if (activeJob) {
      return NextResponse.json(
        {
          ok: false,
          error: `Another scan is already ${activeJob.status} for ${activeJob.url}. Please wait for it to finish.`,
          activeJobId: activeJob.id,
        },
        { status: 409 }
      );
    }

    writeJobStatus(jobId, {
      id: jobId,
      url: targetUrl,
      status: "queued",
      progress: 0,
      step: "Queued",
      createdAt: now,
      updatedAt: now,
      error: null,
      reportPath: null,
      logPath: path.join(jobsDir, jobId, "audit.log"),
    });

    const child = spawn(process.execPath, [workerPath, jobId, targetUrl], {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    child.unref();

    return NextResponse.json({
      ok: true,
      jobId,
      status: "queued",
      url: targetUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unable to start the audit job.",
      },
      { status: 400 }
    );
  }
}
