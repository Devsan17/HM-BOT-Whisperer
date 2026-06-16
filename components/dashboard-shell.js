"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import {
  ArrowUpRight,
  Bot,
  CircleDashed,
  FileJson,
  Globe,
  ListTree,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import chatgptLogo from "../ailogo/chatgpt.png";
import claudeLogo from "../ailogo/Claude.png";
import copilotLogo from "../ailogo/Copilot.png";
import deepseekLogo from "../ailogo/deepseek.png";
import geminiLogo from "../ailogo/Gemini.png";
import grokLogo from "../ailogo/grok.png";
import metaAiLogo from "../ailogo/metaai.png";
import perplexityLogo from "../ailogo/perplexity.png";

const scanSteps = [
  "Starting audit worker...",
  "Reading robots.txt and discovery signals",
  "Fetching the target page",
  "Analyzing schema and structured data",
  "Reviewing headers and security posture",
  "Evaluating content and AI answer quality",
  "Checking Core Web Vitals and performance",
  "Testing AI bot crawlability",
  "Finalizing report output",
];

const heroLogos = [
  {
    alt: "ChatGPT",
    className: "left-[12%] top-[20%]",
    delay: 0,
    duration: 7,
    size: 64,
    src: chatgptLogo,
  },
  {
    alt: "Claude",
    className: "right-[14%] top-[20%]",
    delay: 0.6,
    duration: 8,
    size: 62,
    src: claudeLogo,
  },
  {
    alt: "Copilot",
    className: "left-[16%] bottom-[14%]",
    delay: 1.1,
    duration: 7.5,
    size: 66,
    src: copilotLogo,
  },
  {
    alt: "Gemini",
    className: "right-[12%] bottom-[14%]",
    delay: 1.7,
    duration: 8.5,
    size: 60,
    src: geminiLogo,
  },
  {
    alt: "Grok",
    className: "left-[18%] top-[40%]",
    delay: 0.9,
    duration: 9,
    size: 72,
    src: grokLogo,
  },
  {
    alt: "Perplexity",
    className: "right-[16%] top-[40%]",
    delay: 1.4,
    duration: 7.8,
    imageClassName: "scale-125 saturate-150 contrast-150",
    size: 72,
    src: perplexityLogo,
  },
  {
    alt: "Meta AI",
    className: "left-[30%] top-[24%]",
    delay: 2.1,
    duration: 8.8,
    size: 64,
    src: metaAiLogo,
  },
  {
    alt: "DeepSeek",
    className: "right-[28%] top-[24%]",
    delay: 2.5,
    duration: 8.2,
    size: 64,
    src: deepseekLogo,
  },
];

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  return new Date(value).toLocaleString();
}

function getBotState(bot) {
  if (bot.blocked) {
    return {
      label: "Blocked",
      tone: "bg-rose-100 text-rose-700 ring-rose-200",
    };
  }

  if (bot.error || bot.success === false) {
    return {
      label: "Failed",
      tone: "bg-amber-100 text-amber-700 ring-amber-200",
    };
  }

  return {
    label: "Allowed",
    tone: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  };
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
          <Icon className="size-3.5" />
          Output only
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}

function SummaryCard({ label, value, detail }) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function getReadinessTone(score) {
  if (score >= 80) {
    return {
      label: "Ready",
      ring: "#22c55e",
      glow: "shadow-[0_24px_60px_-34px_rgba(34,197,94,0.35)]",
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      message: "Strong visibility signals for AI bots and answer engines.",
      valueTone: "text-emerald-500",
      valueSubtone: "text-emerald-300",
      needle: "#16a34a",
      panel: "border-emerald-100/90",
      surface: "bg-[linear-gradient(180deg,#ffffff_0%,#effdf4_100%)]",
      halo: "bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.22),transparent_72%)]",
      track: "#dff8fb",
      centerGlow: "rgba(34,197,94,0.22)",
      messagePanel: "border-white/70 bg-white/70 text-slate-600",
    };
  }

  if (score >= 55) {
    return {
      label: "Medium",
      ring: "#f59e0b",
      glow: "shadow-[0_24px_60px_-34px_rgba(245,158,11,0.35)]",
      badge: "bg-amber-50 text-amber-700 ring-amber-200",
      message: "Occasionally mentioned in LLM outputs, but visibility can improve.",
      valueTone: "text-amber-500",
      valueSubtone: "text-amber-300",
      needle: "#d97706",
      panel: "border-amber-100/90",
      surface: "bg-[linear-gradient(180deg,#ffffff_0%,#fff8eb_100%)]",
      halo: "bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.22),transparent_72%)]",
      track: "#dff8fb",
      centerGlow: "rgba(245,158,11,0.22)",
      messagePanel: "border-white/70 bg-white/70 text-slate-600",
    };
  }

  return {
    label: "Low",
    ring: "#ef4444",
    glow: "shadow-[0_24px_60px_-34px_rgba(239,68,68,0.35)]",
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
    message: "Limited visibility signals today, so AI discovery is still weak.",
    valueTone: "text-rose-500",
    valueSubtone: "text-rose-300",
    needle: "#dc2626",
    panel: "border-rose-100/90",
    surface: "bg-[linear-gradient(180deg,#ffffff_0%,#fff1f2_100%)]",
    halo: "bg-[radial-gradient(circle_at_top,rgba(251,113,133,0.2),transparent_72%)]",
    track: "#dff8fb",
    centerGlow: "rgba(239,68,68,0.2)",
    messagePanel: "border-white/70 bg-white/70 text-slate-600",
  };
}

function ReadinessGauge({ score }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const angle = -105 + (safeScore / 100) * 210;
  const tone = getReadinessTone(safeScore);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border p-6",
        tone.panel,
        tone.surface,
        tone.glow
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-32", tone.halo)} />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">AI Readiness Audit</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              How ready this site is
            </h3>
          </div>
          <span
            className={cn(
              "inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1",
              tone.badge
            )}
          >
            {tone.label}
          </span>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="w-[320px] max-w-full">
            <div className="relative h-[210px]">
              <svg className="h-full w-full" viewBox="0 0 320 210">
                <path
                  d="M46 176 A114 114 0 1 1 274 176"
                  fill="none"
                  pathLength="100"
                  stroke={tone.track}
                  strokeLinecap="round"
                  strokeWidth="26"
                />
                <path
                  d="M46 176 A114 114 0 1 1 274 176"
                  fill="none"
                  pathLength="100"
                  stroke={tone.ring}
                  strokeDasharray={`${safeScore} 100`}
                  strokeLinecap="round"
                  strokeWidth="26"
                />
                <g transform={`rotate(${angle} 160 176)`}>
                  <line
                    stroke={tone.needle}
                    strokeLinecap="round"
                    strokeWidth="6"
                    x1="160"
                    x2="160"
                    y1="176"
                    y2="112"
                  />
                </g>
                <circle cx="160" cy="176" fill={tone.centerGlow} r="24" />
                <circle cx="160" cy="176" fill="#38bdf8" r="11" />
                <circle cx="160" cy="176" fill="white" r="4" />
              </svg>

              <div className="absolute inset-x-0 top-[72px] text-center">
                <p className={cn("text-4xl font-semibold tracking-[-0.05em]", tone.valueTone)}>
                  {safeScore}
                  <span className={cn("text-xl", tone.valueSubtone)}>/100</span>
                </p>
              </div>
            </div>

            <div className="mt-1 text-center">
              <p className="text-2xl font-semibold text-slate-900">{tone.label}</p>
            </div>

            <div className="mt-3 px-3">
              <div
                className={cn(
                  "rounded-[16px] border px-4 py-3 text-center text-sm leading-5 backdrop-blur-sm",
                  tone.messagePanel
                )}
              >
                {tone.message}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-1 text-center text-sm text-slate-500">
          Based on crawlability, technical, LLM, and content signals.
        </p>
      </div>
    </div>
  );
}

function DetailSection({ section }) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">{section.title}</p>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Direct report values</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {section.rows.map((row) => (
          <div
            className="rounded-[18px] border border-slate-200/70 bg-slate-50/80 p-3"
            key={`${section.id}-${row.label}`}
          >
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
            <p className="mt-2 break-words text-sm font-medium leading-6 text-slate-800">
              {row.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BotTable({ bots }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/90 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50/90 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Bot</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Load Time</th>
              <th className="px-4 py-3 font-medium">Requests</th>
              <th className="px-4 py-3 font-medium">Title</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => {
              const state = getBotState(bot);

              return (
                <tr className="border-t border-slate-200/70" key={bot.bot}>
                  <td className="px-4 py-3 font-medium text-slate-900">{bot.bot}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1",
                        state.tone
                      )}
                    >
                      {state.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{bot.status || "N/A"}</td>
                  <td className="px-4 py-3 text-slate-600">{bot.loadTime || "N/A"}</td>
                  <td className="px-4 py-3 text-slate-600">{bot.totalRequests || "N/A"}</td>
                  <td className="max-w-[340px] px-4 py-3 text-slate-600">{bot.title || bot.error || "N/A"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotEvidenceCard({ bot, assetVersion }) {
  const state = getBotState(bot);

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{bot.bot}</p>
          <p className="text-xs text-slate-500">{bot.finalUrl || bot.testedUrl || "N/A"}</p>
        </div>
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1",
            state.tone
          )}
        >
          {state.label}
        </span>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
        {bot.screenshotFile ? (
          <img
            alt={`${bot.bot} snapshot`}
            className="h-44 w-full object-cover object-top"
            src={`/api/assets?type=screenshot&file=${encodeURIComponent(bot.screenshotFile)}&v=${encodeURIComponent(assetVersion)}`}
          />
        ) : (
          <div className="grid h-44 place-items-center text-sm text-slate-400">No screenshot</div>
        )}
      </div>

      <div className="mt-4 grid gap-2 rounded-[18px] border border-slate-200/70 bg-slate-50/70 p-3 text-xs text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <span>Status</span>
          <span className="font-medium text-slate-900">{bot.status || "N/A"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Blocked reason</span>
          <span className="max-w-[58%] truncate font-medium text-slate-900">
            {bot.blockReason || "N/A"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Load time</span>
          <span className="font-medium text-slate-900">{bot.loadTime || "N/A"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Requests</span>
          <span className="font-medium text-slate-900">{bot.totalRequests || "N/A"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Canonical</span>
          <span className="max-w-[58%] truncate font-medium text-slate-900">
            {bot.canonical || "N/A"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="truncate text-slate-500">{bot.title || "N/A"}</span>
        {bot.htmlSnapshotFile ? (
          <a
            className="inline-flex items-center gap-1 font-medium text-sky-700 transition hover:text-sky-900"
            href={`/api/assets?type=html&file=${encodeURIComponent(bot.htmlSnapshotFile)}&v=${encodeURIComponent(assetVersion)}`}
            rel="noreferrer"
            target="_blank"
          >
            Inspect HTML
            <ArrowUpRight className="size-4" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function RawJsonCard({ data }) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
      <div className="mb-4 flex items-center gap-2">
        <FileJson className="size-4 text-slate-500" />
        <p className="text-sm font-semibold text-slate-900">Raw report JSON</p>
      </div>
      <pre className="max-h-[520px] overflow-auto rounded-[18px] border border-slate-200/70 bg-slate-50/80 p-4 text-xs leading-6 text-slate-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default function DashboardShell({ initialReport, initialActiveJob }) {
  const [report, setReport] = useState(initialReport);
  const [url, setUrl] = useState(initialReport.targetUrl);
  const [isScanning, setIsScanning] = useState(false);
  const [scanIndex, setScanIndex] = useState(0);
  const [runError, setRunError] = useState("");
  const [scanStatus, setScanStatus] = useState("Ready to scan");
  const [currentJobId, setCurrentJobId] = useState("");
  const [jobProgress, setJobProgress] = useState(0);
  const [jobLogs, setJobLogs] = useState("");
  const [activeJob, setActiveJob] = useState(initialActiveJob);

  useEffect(() => {
    let cancelled = false;

    async function loadJobState() {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const payload = await response.json();

        if (!cancelled && payload.ok) {
          setActiveJob(payload.activeJob || null);
        }
      } catch {
        // Keep the initial server-rendered state if this refresh fails.
      }
    }

    loadJobState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isScanning || !currentJobId) {
      return undefined;
    }

    let cancelled = false;

    async function pollJob() {
      try {
        const response = await fetch(`/api/jobs/${currentJobId}`, {
          cache: "no-store",
        });
        const payload = await response.json();

        if (cancelled || !payload.ok) {
          return;
        }

        if (payload.logs) {
          setJobLogs(payload.logs);
        }

        if (payload.status) {
          setScanStatus(payload.status.step || "Running audit");
          setJobProgress(payload.status.progress || 0);
          setActiveJob({
            id: payload.status.id || currentJobId,
            url: payload.status.url || url,
            status: payload.status.status || "running",
            step: payload.status.step || "Running audit",
          });
          setScanIndex(
            Math.min(
              scanSteps.length - 1,
              Math.max(
                0,
                Math.round(((payload.status.progress || 0) / 100) * (scanSteps.length - 1))
              )
            )
          );
        }

        if (payload.status?.status === "completed" && payload.report) {
          setReport(payload.report);
          setUrl(payload.report.targetUrl);
          setScanStatus("Scan completed");
          setJobProgress(100);
          setActiveJob(null);
          setIsScanning(false);
          setCurrentJobId("");
          return;
        }

        if (payload.status?.status === "failed") {
          setRunError(payload.status.error || "The audit job failed.");
          setScanStatus("Scan failed");
          setActiveJob(null);
          setIsScanning(false);
          setCurrentJobId("");
          return;
        }

        window.setTimeout(pollJob, 2500);
      } catch (error) {
        if (!cancelled) {
          setRunError(error.message || "Unable to poll the audit job.");
          setScanStatus("Scan failed");
          setActiveJob(null);
          setIsScanning(false);
          setCurrentJobId("");
        }
      }
    }

    pollJob();

    return () => {
      cancelled = true;
    };
  }, [currentJobId, isScanning]);

  async function handleRunScan() {
    try {
      setRunError("");
      setJobLogs("");
      setJobProgress(0);
      setScanIndex(0);
      setIsScanning(true);
      setScanStatus("Queueing audit job");

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to start the audit.");
      }

      setCurrentJobId(payload.jobId);
      setActiveJob({
        id: payload.jobId,
        url: payload.url,
        status: payload.status,
        step: "Queued",
      });
      setScanStatus("Queued for execution");
    } catch (error) {
      setRunError(error.message || "Unable to start the audit.");
      setScanStatus("Scan failed");
      setIsScanning(false);
      setCurrentJobId("");
    }
  }

  const bots = report.bots || [];
  const assetVersion = report.generatedAt || `${Date.now()}`;
  const metrics = report.metrics || {};
  const readinessScore = Number(metrics.aiReadiness) || 0;
  const readinessBreakdown = [
    {
      label: "Bot access",
      value: Number(metrics.weightedBotAccess ?? metrics.botAccess) || 0,
      detail: "Weighted by high-priority AI bots, so blocked critical bots hurt more.",
    },
    {
      label: "Technical",
      value: Number(metrics.technicalScore) || 0,
      detail: "Robots, canonicals, security, and structure.",
    },
    {
      label: "LLM signals",
      value: Number(metrics.llmScore) || 0,
      detail: "Signals that help answer engines understand the page.",
    },
    {
      label: "Content",
      value: Number(metrics.contentScore) || 0,
      detail: "Depth, formatting, and extractable content quality.",
    },
  ];

  const summaryCards = useMemo(() => {
    const allowed = bots.filter((bot) => bot.success === true && !bot.blocked).length;
    const blocked = bots.filter((bot) => bot.blocked).length;
    const failed = bots.filter((bot) => !bot.blocked && (bot.error || bot.success === false)).length;
    const labels =
      report.seoSecurityAudit?.accessibility?.missingAccessibleLabels ?? "N/A";

    return [
      {
        label: "Bots Tested",
        value: bots.length,
        detail: "Count of bot rows returned by the audit output.",
      },
      {
        label: "Allowed Bots",
        value: allowed,
        detail: "Bots with successful, non-blocked results in the output.",
      },
      {
        label: "Blocked Bots",
        value: blocked,
        detail: "Bots marked blocked in the output.",
      },
      {
        label: "Missing Accessible Labels",
        value: labels,
        detail: "Direct accessibility count from the audit output.",
      },
    ];
  }, [bots, report]);

  const progressValue = Math.max(
    jobProgress,
    Math.round(((scanIndex + 1) / scanSteps.length) * 100)
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5fcff_0%,#eef9ff_48%,#f9fbff_100%)] text-slate-950">
      <div className="flex w-full flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(248,251,255,0.98)_100%)] p-6 shadow-[0_28px_90px_-42px_rgba(59,130,246,0.18)] sm:min-h-[760px] sm:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(125,211,252,0.26),transparent_24%),radial-gradient(circle_at_84%_8%,rgba(147,197,253,0.24),transparent_22%),radial-gradient(circle_at_50%_34%,rgba(96,165,250,0.18),transparent_20%),radial-gradient(circle_at_50%_86%,rgba(186,230,253,0.22),transparent_24%)]" />
          <div className="pointer-events-none absolute inset-x-[18%] bottom-[-8%] h-[40%] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.14)_0%,rgba(59,130,246,0.05)_42%,transparent_74%)] blur-3xl" />
          {heroLogos.map((logo, index) => (
            <motion.div
              animate={{
                x: [0, 14, -10, 6, 0],
                rotate: [-4, 3, -3, 2, -4],
                scale: [1, 1.06, 0.97, 1.03, 1],
                y: [0, -14, 8, -6, 0],
              }}
              className={cn(
                "pointer-events-none absolute z-10 rounded-[18px] border border-sky-100/95 bg-white/96 p-2.5 shadow-[0_20px_40px_-24px_rgba(59,130,246,0.3),0_0_0_1px_rgba(255,255,255,0.95)] backdrop-blur-md sm:rounded-[22px] sm:p-3",
                logo.className
              )}
              initial={false}
              key={logo.alt}
              transition={{
                delay: logo.delay,
                duration: logo.duration,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "mirror",
              }}
            >
              <Image
                alt={logo.alt}
                className={cn(
                  "select-none opacity-100 drop-shadow-[0_10px_18px_rgba(15,23,42,0.12)] saturate-125 contrast-125",
                  logo.imageClassName
                )}
                draggable={false}
                height={logo.size}
                priority={index < 2}
                src={logo.src}
                width={logo.size}
              />
            </motion.div>
          ))}
          <div className="relative z-20 mx-auto flex w-full max-w-[1240px] flex-col items-center justify-center gap-6 py-6 sm:gap-7 sm:py-10">
            <div className="w-full space-y-2 text-center">
              <div className="relative mx-auto max-w-4xl space-y-2">
                <p className="text-4xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-6xl">
                  <span>BOT Whisperer</span>
                </p>
                <h1 className="text-base font-medium tracking-[-0.02em] text-slate-500 sm:text-xl">
                  AI Readiness Audit.
                </h1>
                {/* <p className="max-w-2xl text-base leading-7 text-slate-600">
                  This screen now removes predicted scores, narratives, and extra recommendations.
                  It renders the audit sections, worker logs, bot results, and raw report data.
                </p> */}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[860px] overflow-hidden rounded-[24px] bg-white p-[2px] shadow-[0_0_0_1px_rgba(96,165,250,0.42),0_18px_40px_-26px_rgba(59,130,246,0.22)]">
              <motion.div
                animate={{ rotate: 360 }}
                className="absolute inset-[-35%] bg-[conic-gradient(from_0deg,rgba(255,255,255,0.06)_0deg,rgba(255,59,48,0.72)_72deg,rgba(255,204,0,0.58)_108deg,rgba(52,199,89,0.68)_144deg,rgba(10,132,255,0.82)_198deg,rgba(191,90,242,0.72)_252deg,rgba(255,45,85,0.64)_306deg,rgba(255,255,255,0.06)_360deg)]"
                transition={{ duration: 5, ease: "linear", repeat: Infinity }}
              />
              <div className="relative flex flex-col gap-3 rounded-[23px] border border-sky-100 bg-white p-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                 
                  <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-white px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-22px_rgba(59,130,246,0.18)]">
                    <Globe className="size-4 text-sky-500" />
                    <input
                      className="w-full bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-500"
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://example.com"
                      value={url}
                    />
                  </div>
                </div>
                <button
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.35)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                  disabled={isScanning}
                  onClick={handleRunScan}
                  type="button"
                >
                  <CircleDashed className={cn("size-4", isScanning && "animate-spin")} />
                  {isScanning ? "Running audit..." : "Run audit"}
                </button>
              </div>
            </div>
            {runError ? (
              <div className="w-full max-w-[1120px] rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {runError}
              </div>
            ) : null}
          </div>
        </section>

        <AnimatePresence>
          {isScanning ? (
            <motion.section
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.28)]"
              exit={{ opacity: 0, y: -12 }}
              initial={{ opacity: 0, y: -12 }}
            >
              <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    <CircleDashed className="size-3.5 animate-spin" />
                    Background job running
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Live worker status
                  </h2>
                  <p className="text-sm leading-6 text-slate-600">
                    This panel shows the actual worker state and log output coming back from the job endpoint.
                  </p>
                  <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-4">
                    <p className="text-sm font-medium text-slate-900">{scanStatus}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      Job {currentJobId || "pending"}
                    </p>
                    <div className="mt-4 h-2 rounded-full bg-slate-200">
                      <motion.div
                        animate={{ width: `${progressValue}%` }}
                        className="h-2 rounded-full bg-slate-900"
                        transition={{ ease: "easeInOut" }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{progressValue}% complete</p>
                  </div>
                </div>
                <div className="grid gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5">
                  {scanSteps.map((step, index) => {
                    const state =
                      index < scanIndex ? "done" : index === scanIndex ? "active" : "queued";

                    return (
                      <div
                        className={cn(
                          "flex items-center justify-between rounded-[18px] px-4 py-3 text-sm",
                          state === "done" && "bg-emerald-50 text-emerald-700",
                          state === "active" && "bg-white text-slate-900 ring-1 ring-slate-200",
                          state === "queued" && "bg-white/60 text-slate-500"
                        )}
                        key={step}
                      >
                        <span>{step}</span>
                        <span className="text-xs uppercase tracking-[0.18em]">{state}</span>
                      </div>
                    );
                  })}
                  <div className="rounded-[18px] border border-slate-200/80 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <TerminalSquare className="size-4 text-slate-500" />
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Worker log</p>
                    </div>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {jobLogs || "Waiting for worker output..."}
                    </pre>
                  </div>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <ReadinessGauge score={readinessScore} />
          <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Score drivers
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Why the score looks like this
                </h3>
              </div>
              <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                Live from audit metrics
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {readinessBreakdown.map((item) => (
                <div
                  className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 p-4"
                  key={item.label}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="text-lg font-semibold tracking-tight text-slate-950">
                      {item.value}%
                    </p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-slate-900"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
            <p className="text-sm text-slate-500">Loaded Report</p>
            <p className="mt-2 break-all text-lg font-semibold tracking-tight text-slate-950">
              {report.targetUrl || "N/A"}
            </p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>Generated: {formatDate(report.generatedAt)}</p>
              <p>Source file: {report.reportPath || "N/A"}</p>
            </div>
          </div>
          <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]">
            <p className="text-sm text-slate-500">Current Audit Job</p>
            <p className="mt-2 break-all text-lg font-semibold tracking-tight text-slate-950">
              {activeJob?.url || "No active audit running"}
            </p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>Status: {activeJob?.status || "idle"}</p>
              <p>Step: {activeJob?.step || "N/A"}</p>
              <p>Job ID: {activeJob?.id || "N/A"}</p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader
            action={
              <div className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                Direct report sections
              </div>
            }
            description="These cards are based on the values saved by the audit run. No extra interpretation is added here."
            icon={ListTree}
            title="Audit sections"
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {report.detailSections.map((section) => (
              <DetailSection key={section.id} section={section} />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader
            action={
              <div className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                Raw bot rows
              </div>
            }
            description="Table view of the bot output that came back from the audit."
            icon={Bot}
            title="Bot results"
          />
          <BotTable bots={bots} />
        </section>

        <section className="space-y-6">
          <SectionHeader
            action={
              <div className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                Screenshots and HTML
              </div>
            }
            description="Evidence cards from the saved per-bot output."
            icon={Bot}
            title="Bot evidence"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {bots.map((bot) => (
              <BotEvidenceCard assetVersion={assetVersion} bot={bot} key={bot.bot} />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader
            description="Complete report payload currently loaded into the UI."
            icon={FileJson}
            title="Raw JSON"
          />
          <RawJsonCard data={report} />
        </section>
      </div>
    </main>
  );
}
