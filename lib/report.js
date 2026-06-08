import fs from "fs";
import path from "path";

function pct(value) {
  return Math.round(value * 100);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

const BOT_WEIGHTS = {
  "OAI-SearchBot": 26,
  GPTBot: 22,
  "ChatGPT-User": 18,
  Gemini: 12,
  Copilot: 10,
  "Google StoreBot Desktop": 6,
  "Google StoreBot Mobile": 6,
};

const CRITICAL_BOT_PENALTIES = {
  "OAI-SearchBot": 24,
  GPTBot: 18,
  "ChatGPT-User": 14,
  Gemini: 10,
  Copilot: 8,
};

function getFileName(filePath) {
  if (!filePath) {
    return null;
  }

  return filePath.split(/[/\\]/).pop();
}

function getSeverity(score) {
  if (score < 45) {
    return "Critical";
  }

  if (score < 75) {
    return "Warning";
  }

  return "Opportunity";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "None";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getBotWeight(botName) {
  return BOT_WEIGHTS[botName] || 5;
}

function getBlockedBotPenalty(botName) {
  return CRITICAL_BOT_PENALTIES[botName] || 0;
}

export function getReportData(inputReportPath) {
  const reportPath =
    inputReportPath || path.join(process.cwd(), "reports", "report.json");
  const raw = fs.readFileSync(reportPath, "utf-8");
  const report = JSON.parse(raw);

  const seo = report.seoSecurityAudit || {};
  const botAudit = report.aiBotCrawlabilityAudit || {};
  const bots = botAudit.results || [];
  const contentSeo = seo.contentSeo || {};
  const performance = seo.performance || {};

  const allowedBots = bots.filter((bot) => bot.success && !bot.blocked);
  const blockedBots = bots.filter((bot) => bot.blocked);
  const totalBotWeight = bots.reduce((sum, bot) => sum + getBotWeight(bot.bot), 0);
  const allowedBotWeight = allowedBots.reduce((sum, bot) => sum + getBotWeight(bot.bot), 0);
  const blockedBotPenalty = clamp(
    blockedBots.reduce((sum, bot) => sum + getBlockedBotPenalty(bot.bot), 0),
    0,
    45
  );
  const averageLoadTime = bots.length
    ? Math.round(
        bots.reduce((sum, bot) => sum + Number.parseInt(bot.loadTime || "0", 10), 0) /
          bots.length
      )
    : 0;

  const technicalSignals = [
    seo.robots?.found,
    seo.canonical?.found,
    seo.canonical?.isSelfReferencing,
    seo.security?.https,
    !seo.mixedContent?.length,
    !seo.adminUrls?.length,
    seo.schema?.organization,
    contentSeo.properHeadingHierarchy,
    contentSeo.titleOptimized,
    contentSeo.metaDescriptionOptimized,
    contentSeo.h1Optimized,
  ];

  const llmSignals = [
    botAudit.success,
    seo.llms?.found,
    !seo.robots?.blockedBots?.includes("GPTBot"),
    !seo.robots?.blockedBots?.includes("OAI-SearchBot"),
    allowedBots.length >= Math.max(1, Math.ceil(bots.length / 2)),
    contentSeo.faqStyleContent,
    contentSeo.hasDefinitions,
    contentSeo.hasBulletPoints,
    contentSeo.hasMultimedia,
    !contentSeo.thinContent,
  ];

  const contentSignals = [
    contentSeo.titleOptimized,
    contentSeo.metaDescriptionOptimized,
    contentSeo.h1Optimized,
    contentSeo.properHeadingHierarchy,
    contentSeo.faqStyleContent,
    contentSeo.hasDefinitions,
    contentSeo.hasComparisons,
    contentSeo.hasBulletPoints,
    contentSeo.hasMultimedia,
    contentSeo.hasKeyTakeaways,
    contentSeo.freshnessSignals,
  ];

  const technicalScore = pct(
    technicalSignals.filter(Boolean).length / Math.max(technicalSignals.length, 1)
  );
  const llmScore = pct(llmSignals.filter(Boolean).length / Math.max(llmSignals.length, 1));
  const contentScore = pct(
    contentSignals.filter(Boolean).length / Math.max(contentSignals.length, 1)
  );
  const botAccessScore = bots.length ? pct(allowedBots.length / bots.length) : 0;
  const weightedBotAccessScore = totalBotWeight ? pct(allowedBotWeight / totalBotWeight) : 0;
  const trustScoreBase = Math.round(
    technicalScore * 0.2 +
      llmScore * 0.2 +
      contentScore * 0.1 +
      weightedBotAccessScore * 0.5
  );
  const trustScore = clamp(
    Math.round(
      trustScoreBase - blockedBotPenalty
    )
  );

  const findings = [
    !seo.llms?.found && {
      title: "No llms.txt detected",
      description:
        "AI systems do not have an explicit machine-readable guide for preferred indexing and content retrieval.",
      severity: "Critical",
      area: "AI discoverability",
    },
    blockedBots.some((bot) => bot.bot === "OAI-SearchBot") && {
      title: "OpenAI search crawler blocked",
      description:
        "OAI-SearchBot is blocked by the current edge or firewall rules, limiting visibility in AI search experiences.",
      severity: "Critical",
      area: "Bot crawlability",
    },
    !seo.security?.hsts && {
      title: "HSTS header missing",
      description:
        "The domain is HTTPS-enabled but lacks transport hardening, which weakens enterprise-grade trust signals.",
      severity: "Warning",
      area: "Security",
    },
    !seo.security?.csp && {
      title: "Content Security Policy missing",
      description:
        "The site does not advertise a CSP header, reducing security posture and browser-side protection.",
      severity: "Warning",
      area: "Security",
    },
    (seo.accessibility?.missingAccessibleLabels || 0) > 20 && {
      title: "Accessibility labeling debt",
      description:
        "A large number of interactive elements are missing accessible labels, which also reduces parser clarity for extraction systems.",
      severity: "Warning",
      area: "Accessibility",
    },
    !contentSeo.hasComparisons && {
      title: "Comparison content opportunity",
      description:
        "Adding comparison-style content can improve LLM answer extraction and broaden non-branded informational coverage.",
      severity: "Opportunity",
      area: "Content",
    },
    !contentSeo.hasKeyTakeaways && {
      title: "Key takeaways module missing",
      description:
        "A short summary section would improve extraction density for answer engines and speed up human comprehension.",
      severity: "Opportunity",
      area: "Content",
    },
    !contentSeo.freshnessSignals && {
      title: "Weak freshness signals",
      description:
        "There are limited visible signs of recent updates, which can reduce confidence for AI systems evaluating recency.",
      severity: "Opportunity",
      area: "Content",
    },
    (seo.metaTags?.missingTwitter?.length || 0) > 0 && {
      title: "Twitter/X cards incomplete",
      description:
        "Social metadata is incomplete, which weakens rich sharing previews and can reduce machine-readable content summaries.",
      severity: "Warning",
      area: "Metadata",
    },
    (seo.adminUrls?.length || 0) > 0 && {
      title: "Common admin paths exposed",
      description:
        "Publicly reachable admin-style endpoints were detected and should be reviewed for unnecessary exposure.",
      severity: "Warning",
      area: "Security",
    },
    performance.pageSpeed?.success &&
      performance.pageSpeed.performanceScore !== null &&
      performance.pageSpeed.performanceScore < 70 && {
        title: "Performance score is below target",
        description:
          "PageSpeed indicates a slower than ideal experience, which can harm crawl efficiency and rendered extraction quality.",
        severity: "Warning",
        area: "Performance",
      },
    performance.crux?.success &&
      performance.crux.inpMs !== null &&
      performance.crux.inpMs > 200 && {
        title: "Real-user interactivity is weak",
        description:
          "CrUX INP is outside the ideal range, which suggests a slower interactive experience for users and rendered bots.",
        severity: "Warning",
        area: "Performance",
      },
  ].filter(Boolean);

  const metrics = {
    aiReadiness: trustScore,
    botAccess: botAccessScore,
    weightedBotAccess: weightedBotAccessScore,
    blockedBotPenalty,
    technicalScore,
    llmScore,
    contentScore,
    extractionScore: clamp(Math.round((contentScore * 0.55 + llmScore * 0.45) / 1)),
    trustScore,
  };

  const radarData = [
    { subject: "Crawlability", score: botAccessScore },
    { subject: "Technical", score: technicalScore },
    { subject: "LLM", score: llmScore },
    { subject: "Content", score: contentScore },
    { subject: "Trust", score: trustScore },
    { subject: "Extraction", score: metrics.extractionScore },
  ];

  const donutData = [
    { name: "Allowed", value: allowedBots.length, fill: "#2563eb" },
    { name: "Blocked", value: blockedBots.length, fill: "#f97316" },
    {
      name: "Failed",
      value: Math.max(0, bots.length - allowedBots.length - blockedBots.length),
      fill: "#94a3b8",
    },
  ];

  const timelineData = bots.map((bot) => ({
    name: bot.bot.replace("Google StoreBot", "StoreBot"),
    loadTime: Number.parseInt(bot.loadTime || "0", 10),
    requests: bot.totalRequests || 0,
  }));

  const gaugeData = {
    loadTime: averageLoadTime,
    ideal: 8500,
    max: 20000,
  };

  const extractionNodes = [
    { id: "Origin", label: "Website", value: metrics.technicalScore },
    { id: "Markup", label: "Structured Data", value: seo.schema?.organization ? 88 : 42 },
    { id: "Content", label: "Content Blocks", value: metrics.contentScore },
    { id: "Policy", label: "AI Signals", value: metrics.llmScore },
    { id: "Bots", label: "Bot Access", value: metrics.botAccess },
    { id: "Answer", label: "LLM Output", value: metrics.extractionScore },
  ];

  const heatmap = [
    { label: "Robots", value: seo.robots?.found ? 92 : 18 },
    { label: "Canonical", value: seo.canonical?.isSelfReferencing ? 91 : 34 },
    { label: "Schema", value: seo.schema?.organization ? 76 : 30 },
    { label: "LLMS", value: seo.llms?.found ? 95 : 20 },
    { label: "Meta", value: (seo.metaTags?.missingTwitter?.length || 0) < 2 ? 74 : 35 },
    { label: "Content", value: metrics.contentScore },
    { label: "Security", value: metrics.technicalScore },
    { label: "Bots", value: metrics.botAccess },
  ];

  const sidePanelFixes = findings.slice(0, 5).map((finding, index) => ({
    id: index + 1,
    severity: finding.severity,
    title: finding.title,
    impact: finding.area,
    recommendation:
      finding.severity === "Critical"
        ? "Address this in the next release cycle and validate with a fresh crawl."
        : finding.severity === "Warning"
          ? "Add this to the platform backlog and monitor its effect on scan quality."
          : "Package this as a content or UX enhancement to improve AI extraction quality.",
  }));

  const detailSections = [
    {
      id: "robots",
      title: "Robots & Discovery",
      rows: [
        { label: "robots.txt found", value: formatValue(seo.robots?.found) },
        { label: "Blocked major bots", value: formatValue(seo.robots?.blockedBots || []) },
        { label: "Sitemap", value: formatValue(seo.robots?.sitemap) },
        { label: "llms.txt found", value: formatValue(seo.llms?.found) },
        { label: "llms.txt title", value: formatValue(seo.llms?.hasTitle) },
        { label: "llms.txt description", value: formatValue(seo.llms?.hasDescription) },
        { label: "llms.txt links", value: formatValue(seo.llms?.links || []) },
      ],
    },
    {
      id: "canonical-structure",
      title: "Canonical, Schema & Structure",
      rows: [
        { label: "Canonical found", value: formatValue(seo.canonical?.found) },
        { label: "Canonical value", value: formatValue(seo.canonical?.value) },
        { label: "Self-referencing", value: formatValue(seo.canonical?.isSelfReferencing) },
        { label: "FAQ schema", value: formatValue(seo.schema?.faq) },
        { label: "Breadcrumb schema", value: formatValue(seo.schema?.breadcrumb) },
        { label: "Product/Service schema", value: formatValue(seo.schema?.productOrService) },
        { label: "Organization schema", value: formatValue(seo.schema?.organization) },
        { label: "Article schema", value: formatValue(seo.schema?.article) },
        { label: "Semantic HTML", value: formatValue(seo.semanticHtml || []) },
      ],
    },
    {
      id: "security",
      title: "Security & Metadata",
      rows: [
        { label: "HTTPS", value: formatValue(seo.security?.https) },
        { label: "HSTS", value: formatValue(seo.security?.hsts) },
        { label: "CSP", value: formatValue(seo.security?.csp) },
        { label: "X-Frame-Options", value: formatValue(seo.security?.xFrameOptions) },
        {
          label: "X-Content-Type-Options",
          value: formatValue(seo.security?.xContentTypeOptions),
        },
        { label: "Mixed content", value: formatValue(seo.mixedContent || []) },
        {
          label: "Missing Open Graph tags",
          value: formatValue(seo.metaTags?.missingOpenGraph || []),
        },
        {
          label: "Missing Twitter tags",
          value: formatValue(seo.metaTags?.missingTwitter || []),
        },
        { label: "Admin paths", value: formatValue((seo.adminUrls || []).map((item) => `${item.path} (${item.status})`)) },
      ],
    },
    {
      id: "content",
      title: "Content SEO",
      rows: [
        { label: "Title optimized", value: formatValue(contentSeo.titleOptimized) },
        { label: "Title length", value: formatValue(contentSeo.titleLength) },
        {
          label: "Meta description optimized",
          value: formatValue(contentSeo.metaDescriptionOptimized),
        },
        {
          label: "Meta description length",
          value: formatValue(contentSeo.metaDescriptionLength),
        },
        { label: "H1 optimized", value: formatValue(contentSeo.h1Optimized) },
        { label: "H1 count", value: formatValue(contentSeo.h1Count) },
        { label: "H2 count", value: formatValue(contentSeo.h2Count) },
        { label: "H3 count", value: formatValue(contentSeo.h3Count) },
        {
          label: "Heading hierarchy",
          value: formatValue(contentSeo.properHeadingHierarchy),
        },
        { label: "FAQ-style content", value: formatValue(contentSeo.faqStyleContent) },
        { label: "Thin content", value: formatValue(contentSeo.thinContent) },
        { label: "Word count", value: formatValue(contentSeo.wordCount) },
        { label: "Definitions", value: formatValue(contentSeo.hasDefinitions) },
        { label: "Comparisons", value: formatValue(contentSeo.hasComparisons) },
        { label: "Bullet points", value: formatValue(contentSeo.hasBulletPoints) },
        { label: "Bullet count", value: formatValue(contentSeo.bulletCount) },
        { label: "Has multimedia", value: formatValue(contentSeo.hasMultimedia) },
        { label: "Image count", value: formatValue(contentSeo.imageCount) },
        { label: "Video count", value: formatValue(contentSeo.videoCount) },
        { label: "Iframe count", value: formatValue(contentSeo.iframeCount) },
        { label: "Has summary/takeaways", value: formatValue(contentSeo.hasKeyTakeaways) },
        { label: "Freshness signals", value: formatValue(contentSeo.freshnessSignals) },
      ],
    },
    {
      id: "performance",
      title: "PageSpeed & CrUX",
      rows: [
        {
          label: "PageSpeed success",
          value: formatValue(performance.pageSpeed?.success),
        },
        {
          label: "Performance score",
          value: formatValue(performance.pageSpeed?.performanceScore),
        },
        {
          label: "PageSpeed error",
          value: formatValue(performance.pageSpeed?.error),
        },
        { label: "TTFB (ms)", value: formatValue(performance.pageSpeed?.ttfbMs) },
        { label: "LCP (ms)", value: formatValue(performance.pageSpeed?.lcpMs) },
        { label: "CLS", value: formatValue(performance.pageSpeed?.cls) },
        {
          label: "Total blocking time (ms)",
          value: formatValue(performance.pageSpeed?.totalBlockingTimeMs),
        },
        {
          label: "Compression enabled",
          value: formatValue(performance.pageSpeed?.compressionEnabled),
        },
        {
          label: "Compression encoding",
          value: formatValue(performance.pageSpeed?.compressionEncoding),
        },
        { label: "CrUX success", value: formatValue(performance.crux?.success) },
        { label: "CrUX error", value: formatValue(performance.crux?.error) },
        { label: "INP p75 (ms)", value: formatValue(performance.crux?.inpMs) },
        { label: "CrUX LCP p75 (ms)", value: formatValue(performance.crux?.lcpMs) },
        { label: "CrUX CLS p75", value: formatValue(performance.crux?.cls) },
      ],
    },
    {
      id: "accessibility",
      title: "Accessibility",
      rows: [
        {
          label: "Missing accessible labels",
          value: formatValue(seo.accessibility?.missingAccessibleLabels),
        },
      ],
    },
  ];

  return {
    ...report,
    summary: {
      allowedBots: allowedBots.length,
      blockedBots: blockedBots.length,
      totalBots: bots.length,
      averageLoadTime,
      criticalFindings: findings.filter((item) => item.severity === "Critical").length,
      warnings: findings.filter((item) => item.severity === "Warning").length,
      opportunities: findings.filter((item) => item.severity === "Opportunity").length,
    },
    metrics,
    findings,
    charts: {
      radarData,
      donutData,
      timelineData,
      gaugeData,
      heatmap,
      extractionNodes,
    },
    bots: bots.map((bot) => ({
      ...bot,
      screenshotFile: getFileName(bot.screenshot),
      htmlSnapshotFile: getFileName(bot.htmlSnapshot),
      severity: getSeverity(bot.success && !bot.blocked ? 86 : bot.blocked ? 28 : 52),
    })),
    sidePanelFixes,
    detailSections,
  };
}
