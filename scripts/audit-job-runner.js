const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const jobId = process.argv[2];
const targetUrl = process.argv[3];

if (!jobId || !targetUrl) {
  process.exit(1);
}

const rootDir = process.cwd();
const jobsDir = path.join(rootDir, "reports", "jobs");
const jobDir = path.join(jobsDir, jobId);
const statusPath = path.join(jobDir, "status.json");
const logPath = path.join(jobDir, "audit.log");
const jobReportPath = path.join(jobDir, "report.json");
const sharedReportPath = path.join(rootDir, "reports", "report.json");
const scriptPath = path.join(rootDir, "robot-can.js");

const stepMatchers = [
  {
    pattern: "ROBOTS.TXT CHECK",
    step: "Reading robots.txt and discovery signals",
    progress: 12,
  },
  {
    pattern: "FETCHING PAGE",
    step: "Fetching the target page",
    progress: 22,
  },
  {
    pattern: "SCHEMA CHECK",
    step: "Analyzing schema and structured data",
    progress: 34,
  },
  {
    pattern: "SECURITY CHECKS",
    step: "Reviewing headers and security posture",
    progress: 46,
  },
  {
    pattern: "CONTENT SEO CHECKS",
    step: "Evaluating content and AI answer quality",
    progress: 58,
  },
  {
    pattern: "PAGE SPEED CHECK",
    step: "Checking Core Web Vitals and performance",
    progress: 72,
  },
  {
    pattern: "CRUX REAL USER DATA",
    step: "Collecting real user experience signals",
    progress: 82,
  },
  {
    pattern: "AI BOT CRAWLABILITY AUDITOR",
    step: "Testing AI bot crawlability",
    progress: 90,
  },
  {
    pattern: "COMBINED REPORT SAVED",
    step: "Finalizing report output",
    progress: 98,
  },
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readStatus() {
  if (!fs.existsSync(statusPath)) {
    return {
      id: jobId,
      url: targetUrl,
      status: "queued",
      progress: 0,
      step: "Queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      reportPath: null,
      logPath,
    };
  }

  return JSON.parse(fs.readFileSync(statusPath, "utf-8"));
}

function writeStatus(patch) {
  const current = readStatus();
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(statusPath, JSON.stringify(next, null, 2));
}

function appendLog(chunk) {
  fs.appendFileSync(logPath, chunk);
}

function updateStepFromOutput(text) {
  const match = stepMatchers.find((item) => text.includes(item.pattern));

  if (match) {
    writeStatus({
      status: "running",
      step: match.step,
      progress: match.progress,
    });
  }
}

ensureDir(jobDir);

writeStatus({
  id: jobId,
  url: targetUrl,
  status: "running",
  progress: 5,
  step: "Starting audit worker",
  createdAt: new Date().toISOString(),
  error: null,
  reportPath: null,
  logPath,
});

fs.writeFileSync(logPath, `Starting audit for ${targetUrl}\n`);

const child = spawn(process.execPath, [scriptPath, targetUrl], {
  cwd: rootDir,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  appendLog(text);
  updateStepFromOutput(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  appendLog(text);
});

child.on("error", (error) => {
  appendLog(`\nWorker error: ${error.message}\n`);
  writeStatus({
    status: "failed",
    progress: 100,
    step: "Worker failed to start",
    error: error.message,
  });
  process.exit(1);
});

child.on("close", (code) => {
  if (code === 0 && fs.existsSync(sharedReportPath)) {
    fs.copyFileSync(sharedReportPath, jobReportPath);
    writeStatus({
      status: "completed",
      progress: 100,
      step: "Audit completed",
      error: null,
      reportPath: jobReportPath,
    });
    process.exit(0);
  }

  const fallbackMessage = `Audit process exited with code ${code}`;
  appendLog(`\n${fallbackMessage}\n`);
  writeStatus({
    status: "failed",
    progress: 100,
    step: "Audit failed",
    error: fallbackMessage,
    reportPath: fs.existsSync(jobReportPath) ? jobReportPath : null,
  });
  process.exit(code || 1);
});
