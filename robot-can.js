const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const robotsParser = require("robots-parser");
const { chromium } = require("playwright");

const TARGET_URL = "https://www.drfixit.co.in/";
const MAX_TIMEOUT = 45000;

const bots = [
  {
    name: "OAI-SearchBot",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot",
  },
  {
    name: "GPTBot",
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot",
  },
  {
    name: "ChatGPT-User",
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  },
  {
    name: "Google StoreBot Desktop",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Safari/537.36",
  },
  {
    name: "Google StoreBot Mobile",
    userAgent:
      "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36",
  },
  {
    name: "Gemini",
    userAgent:
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; GoogleOther)",
  },
  {
    name: "Copilot",
    userAgent:
      "Mozilla/5.0 (compatible; Microsoft-Copilot/1.0; +https://www.microsoft.com/copilot)",
  },
];

const screenshotsDir = path.join(__dirname, "screenshots");
const htmlDir = path.join(__dirname, "html-snapshots");
const reportsDir = path.join(__dirname, "reports");

[screenshotsDir, htmlDir, reportsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function cleanFileName(name) {
  return name.replace(/[^a-z0-9]/gi, "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(task, options = {}) {
  const {
    retries = 1,
    delayMs = 1500,
    label = "Operation",
    shouldRetry = () => true,
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === retries || !shouldRetry(error, attempt)) {
        break;
      }

      console.log(
        `${label} failed (attempt ${attempt + 1}/${retries + 1}): ${error.message}`
      );
      console.log(`Retrying ${label.toLowerCase()}...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function formatHttpError(error, fallbackUrl) {
  const status = error?.response?.status;
  const statusText = error?.response?.statusText;
  const url = error?.config?.url || fallbackUrl || "unknown URL";
  const server = error?.response?.headers?.server || null;
  const body = typeof error?.response?.data === "string" ? error.response.data.toLowerCase() : "";

  let reason = error?.message || "Request failed";

  if (body.includes("request blocked")) {
    reason = "Request blocked by site protection";
  } else if (body.includes("access denied")) {
    reason = "Access denied by the target site";
  } else if (status === 403) {
    reason = "Access forbidden by the target site";
  } else if (status === 429) {
    reason = "Rate limited by the target site";
  }

  return {
    message: `${reason}${status ? ` (${status}${statusText ? ` ${statusText}` : ""})` : ""}`,
    summary: {
      url,
      status: status || null,
      statusText: statusText || null,
      server,
      reason,
    },
  };
}

function getHttpStatus(error) {
  return error?.response?.status || null;
}

function isMissingTextResource(message, fileName) {
  return message === `${fileName} not found`;
}

function isSameOriginUrl(referenceUrl, candidateUrl) {
  try {
    return new URL(referenceUrl).origin === new URL(candidateUrl).origin;
  } catch {
    return false;
  }
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function resolveRedirectUrl(baseUrl, location) {
  if (!location) {
    return null;
  }

  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return location;
  }
}

function extractTitleFromHtml(html) {
  if (typeof html !== "string") {
    return null;
  }

  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function detectBlock(html, status, title, bodyText) {
  const visibleContent = `${title}\n${bodyText}`.toLowerCase();
  const htmlContent = (html || "").toLowerCase();
  const visiblePatterns = [
    "access denied",
    "forbidden",
    "temporarily unavailable",
    "request blocked",
    "attention required",
    "please wait while your request is being verified",
    "verify you are human",
    "bot protection",
    "security check",
    "bad bot access attempt",
    "not allowed",
  ];
  const htmlChallengePatterns = [
    "cf-browser-verification",
    "challenge-platform",
    "captcha",
    "/cdn-cgi/challenge-platform/",
    "window._cf_chl_opt",
    "datadomecaptcha",
    "geo.captcha-delivery.com",
    "please enable javascript and cookies to continue",
    "checking your browser",
    "challenge-platform",
  ];

  const matchedVisiblePattern = visiblePatterns.find((pattern) =>
    visibleContent.includes(pattern)
  );
  const matchedHtmlChallengePattern = htmlChallengePatterns.find((pattern) =>
    htmlContent.includes(pattern)
  );

  const normalizedTitle = (title || "").toLowerCase();
  const suspiciousTitle =
    normalizedTitle.includes("access denied") ||
    normalizedTitle.includes("forbidden") ||
    normalizedTitle.includes("attention required") ||
    normalizedTitle.includes("not allowed");

  const tinyPage = (bodyText || "").trim().length < 50;
  const challengeOnlyPage = tinyPage && Boolean(matchedHtmlChallengePattern);

  return {
    blocked:
      status === 401 ||
      status === 403 ||
      status === 429 ||
      Boolean(matchedVisiblePattern) ||
      suspiciousTitle ||
      challengeOnlyPage,
    reason:
      matchedVisiblePattern ||
      matchedHtmlChallengePattern ||
      (suspiciousTitle ? "suspicious-title" : null) ||
      (challengeOnlyPage ? "challenge-page" : null),
  };
}

async function safeMeta(page, selector) {
  try {
    return await page.locator(selector).getAttribute("content");
  } catch {
    return null;
  }
}

async function fetchPageWithBrowser(url) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const preflightResponse = await axios.get(url, {
      timeout: 10000,
      proxy: false,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const preflightFinalUrl = resolveRedirectUrl(
      url,
      preflightResponse.headers?.location || null
    );

    if (
      isRedirectStatus(preflightResponse.status) &&
      preflightFinalUrl &&
      !isSameOriginUrl(url, preflightFinalUrl)
    ) {
      return {
        html: "",
        headers: preflightResponse.headers || {},
        status: preflightResponse.status,
        finalUrl: preflightFinalUrl,
        title: "",
        fetchedWithBrowser: false,
        redirectedOffOrigin: true,
      };
    }

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0",
      viewport: {
        width: 1366,
        height: 768,
      },
      locale: "en-US",
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(MAX_TIMEOUT);
    let blockedNavigationUrl = null;

    await page.route("**/*", async (route) => {
      const request = route.request();
      const isMainFrameDocument =
        request.isNavigationRequest() &&
        request.resourceType() === "document" &&
        request.frame() === page.mainFrame();

      if (isMainFrameDocument && !isSameOriginUrl(url, request.url())) {
        blockedNavigationUrl = request.url();
        await route.abort();
        return;
      }

      await route.continue();
    });

    await page.route("**/*.{woff,woff2,ttf,otf}", (route) => route.abort());

    let response = null;

    try {
      response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: MAX_TIMEOUT,
      });
    } catch (error) {
      if (blockedNavigationUrl) {
        await context.close();
        return {
          html: "",
          headers: preflightResponse.headers || {},
          status: preflightResponse.status,
          finalUrl: blockedNavigationUrl,
          title: "",
          fetchedWithBrowser: false,
          redirectedOffOrigin: true,
        };
      }

      throw error;
    }

    await page.waitForTimeout(3000);

    const html = await page.content();
    const finalUrl = page.url();
    const title = await page.title().catch(() => "");

    const headers = response ? await response.allHeaders() : {};
    const status = response ? response.status() : 200;

    await context.close();

    return {
      html,
      headers,
      status,
      finalUrl,
      title,
      fetchedWithBrowser: true,
      redirectedOffOrigin: false,
    };
  } finally {
    await browser.close();
  }
}

async function fetchTextResourceWithBrowser(url) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0",
      viewport: {
        width: 1366,
        height: 768,
      },
      locale: "en-US",
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(MAX_TIMEOUT);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: MAX_TIMEOUT,
    });

    await page.waitForTimeout(1000);

    const text = await page.evaluate(() => {
      const pre = document.querySelector("pre");
      if (pre?.textContent?.trim()) {
        return pre.textContent;
      }

      return document.body?.innerText || document.documentElement?.innerText || "";
    });

    const headers = response ? await response.allHeaders() : {};
    const status = response ? response.status() : 200;
    const finalUrl = page.url();

    await context.close();

    return {
      text,
      headers,
      status,
      finalUrl,
    };
  } finally {
    await browser.close();
  }
}

async function runSeoSecurityAudit(url) {
  const result = {
    url,
    baseUrl: new URL(url).origin,
    fetch: {
      success: false,
      method: "http",
      status: null,
      finalUrl: url,
      title: null,
      error: null,
      fetchedWithBrowser: false,
    },
    robots: {
      found: false,
      blockedBots: [],
      sitemap: null,
      error: null,
    },
    canonical: {
      found: false,
      count: 0,
      value: null,
      isAbsolute: null,
      isSelfReferencing: null,
    },
    schema: {
      faq: false,
      breadcrumb: false,
      productOrService: null,
      organization: false,
      article: null,
      webPage: false,
      webSite: false,
      softwareApplication: false,
      person: false,
      localBusiness: false,
      foundTypes: [],
      detectionMethods: {
        jsonLd: false,
        microdata: false,
        rdfa: false,
      },
    },
    security: {
      https: url.startsWith("https://"),
      hsts: false,
      csp: false,
      xFrameOptions: false,
      xContentTypeOptions: false,
    },
    mixedContent: [],
    adminUrls: [],
    llms: {
      found: false,
      hasTitle: false,
      hasDescription: false,
      links: [],
      tooSmall: false,
      error: null,
    },
    metaTags: {
      missingOpenGraph: [],
      missingTwitter: [],
    },
    semanticHtml: [],
    accessibility: {
      missingAccessibleLabels: 0,
    },
    performance: {
      pageSpeed: {
        success: false,
        performanceScore: null,
        ttfbMs: null,
        lcpMs: null,
        cls: null,
        totalBlockingTimeMs: null,
        compressionEnabled: false,
        compressionEncoding: null,
        error: null,
      },
      crux: {
        success: false,
        inpMs: null,
        lcpMs: null,
        cls: null,
        error: null,
      },
    },
    contentSeo: {
      titleOptimized: false,
      titleLength: 0,
      metaDescriptionOptimized: false,
      metaDescriptionLength: 0,
      h1Optimized: false,
      h1Count: 0,
      h2Count: 0,
      h3Count: 0,
      properHeadingHierarchy: true,
      faqStyleContent: false,
      thinContent: false,
      wordCount: 0,
      hasDefinitions: false,
      hasComparisons: false,
      hasBulletPoints: false,
      bulletCount: 0,
      hasMultimedia: false,
      imageCount: 0,
      videoCount: 0,
      iframeCount: 0,
      hasKeyTakeaways: false,
      freshnessSignals: false,
    },


  };

  console.log("\n============================");
  console.log("FULL SEO + SECURITY + AI AUDIT");
  console.log("============================\n");

  console.log("ROBOTS.TXT CHECK\n");

  try {
    const robotsUrl = `${result.baseUrl}/robots.txt`;
    let robotsText = "";

    try {
      const robotsRes = await axios.get(robotsUrl, {
        timeout: 10000,
        proxy: false,
      });
      robotsText = robotsRes.data;
    } catch (error) {
      if (getHttpStatus(error) === 404) {
        console.log("robots.txt not found");
        throw new Error("robots.txt not found");
      }

      const formatted = formatHttpError(error, robotsUrl);
      console.log(`Direct robots.txt fetch failed: ${formatted.message}`);
      console.log("Falling back to browser-visible robots.txt");

      const browserRobots = await fetchTextResourceWithBrowser(robotsUrl);
      if (browserRobots.status >= 400 || !browserRobots.text.trim()) {
        throw new Error(
          browserRobots.status >= 400
            ? `robots.txt blocked in browser (${browserRobots.status})`
            : "robots.txt returned no visible content"
        );
      }

      robotsText = browserRobots.text;
    }

    const robots = robotsParser(robotsUrl, robotsText);

    result.robots.found = true;
    console.log("robots.txt found");

    const majorBots = [
      "Googlebot",
      "GPTBot",
      "ChatGPT-User",
      "OAI-SearchBot",
      "Google-Extended",
    ];

    result.robots.blockedBots = majorBots.filter(
      (bot) => !robots.isAllowed(url, bot)
    );

    if (result.robots.blockedBots.length === 0) {
      console.log("All major bots are allowed");
    } else {
      console.log(`Blocked Bots: ${result.robots.blockedBots.join(", ")}`);
    }

    const sitemapMatch = robotsText.match(/Sitemap:\s?(.*)/i);
    if (sitemapMatch) {
      result.robots.sitemap = sitemapMatch[1];
      console.log(`Sitemap Found: ${result.robots.sitemap}`);
    } else {
      console.log("No sitemap found");
    }
  } catch (error) {
    if (!isMissingTextResource(error.message, "robots.txt")) {
      result.robots.error = error.message;
    }
    console.log("robots.txt missing");
  }

  console.log("\n============================");
  console.log("FETCHING PAGE");
  console.log("============================\n");

  let html;
  let headers;
  let finalUrl = url;
  result.url = url;
  result.baseUrl = new URL(url).origin;

  try {
    const browserFetch = await fetchPageWithBrowser(url);

    result.fetch = {
      success:
        browserFetch.status >= 200 &&
        browserFetch.status < 400 &&
        !browserFetch.redirectedOffOrigin,
      method: "browser",
      status: browserFetch.status,
      finalUrl: browserFetch.finalUrl,
      title: browserFetch.title || null,
      error:
        browserFetch.redirectedOffOrigin
          ? `Redirected off origin to ${browserFetch.finalUrl}`
          : browserFetch.status >= 400
          ? `Browser-visible page returned ${browserFetch.status}`
          : null,
      fetchedWithBrowser: browserFetch.fetchedWithBrowser,
    };

    if (browserFetch.redirectedOffOrigin) {
      console.log(`Browser-visible page redirected off origin to ${browserFetch.finalUrl}`);
      throw new Error(`Redirected off origin to ${browserFetch.finalUrl}`);
    }

    html = browserFetch.html;
    headers = browserFetch.headers;
    finalUrl = browserFetch.finalUrl;

    console.log(
      `Browser-visible page loaded (${browserFetch.status}${browserFetch.title ? `, ${browserFetch.title}` : ""})`
    );
  } catch (error) {
    const formatted = formatHttpError(error, url);
    console.log(`Page fetch failed: ${formatted.message}`);
    if (formatted.summary.server) {
      console.log(`Blocking layer: ${formatted.summary.server}`);
    }
    result.fetch = {
      success: false,
      method: "browser",
      status: error?.response?.status || null,
      finalUrl: url,
      title: null,
      error: formatted.message,
      fetchedWithBrowser: true,
    };
    throw new Error(formatted.message);
  }

  const $ = cheerio.load(html);
  result.url = finalUrl;
  result.baseUrl = new URL(finalUrl).origin;

  console.log("CANONICAL CHECK\n");

  const canonicalTags = $('link[rel="canonical"]');
  result.canonical.count = canonicalTags.length;
  result.canonical.found = canonicalTags.length > 0;

  if (canonicalTags.length === 0) {
    console.log("No canonical tag found");
  }

  if (canonicalTags.length > 1) {
    console.log("Multiple canonical tags found");
  }

  if (canonicalTags.length === 1) {
    const canonical = canonicalTags.attr("href");
    const normalizedCurrent = url.replace(/\/$/, "");
    const normalizedCanonical = (canonical || "").replace(/\/$/, "");

    result.canonical.value = canonical;
    result.canonical.isAbsolute = canonical.startsWith("http");
    result.canonical.isSelfReferencing =
      normalizedCurrent === normalizedCanonical;

    console.log(`Canonical Found: ${canonical}`);
    console.log(
      result.canonical.isAbsolute
        ? "Canonical is absolute URL"
        : "Canonical is not absolute URL"
    );
    console.log(
      result.canonical.isSelfReferencing
        ? "Self-referencing canonical"
        : "Canonical points to different URL"
    );
  }

  console.log("\n============================");
  console.log("SCHEMA CHECK");
  console.log("============================\n");

  const schemaEntries = [];

  const normalizeSchemaType = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const withoutFragment = trimmed.split("#").pop();
    const withoutQuery = withoutFragment.split("?")[0];
    const parts = withoutQuery.split("/");
    return parts[parts.length - 1] || withoutQuery;
  };

  const normalizeTypeList = (value) => {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((entry) => normalizeSchemaType(entry))
      .filter(Boolean);
  };

  const addSchemaEntry = (types, method, source) => {
    const normalizedTypes = normalizeTypeList(types);
    if (normalizedTypes.length === 0) {
      return;
    }

    schemaEntries.push({
      types: normalizedTypes,
      method,
      source,
    });

    if (method && Object.hasOwn(result.schema.detectionMethods, method)) {
      result.schema.detectionMethods[method] = true;
    }
  };

  const collectJsonLdEntries = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => collectJsonLdEntries(item));
      return;
    }

    if (node["@type"]) {
      addSchemaEntry(node["@type"], "jsonLd", "application/ld+json");
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        collectJsonLdEntries(value);
      }
    }
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const raw = $(element).html();
      if (!raw) {
        return;
      }

      const json = JSON.parse(raw);
      collectJsonLdEntries(json);
    } catch {}
  });

  $("[itemscope][itemtype]").each((_, element) => {
    addSchemaEntry($(element).attr("itemtype"), "microdata", "itemtype");
  });

  $("[typeof]").each((_, element) => {
    const rdfaTypes = ($(element).attr("typeof") || "")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    addSchemaEntry(rdfaTypes, "rdfa", "typeof");
  });

  result.schema.foundTypes = Array.from(
    new Set(schemaEntries.flatMap((entry) => entry.types))
  ).sort((a, b) => a.localeCompare(b));

  const findSchema = (types) => {
    const normalizedTargets = normalizeTypeList(types);
    return schemaEntries.find((entry) =>
      entry.types.some((type) => normalizedTargets.includes(type))
    );
  };

  result.schema.faq = Boolean(findSchema(["FAQPage", "Question", "Answer"]));
  result.schema.breadcrumb = Boolean(findSchema(["BreadcrumbList", "ListItem"]));

  const productSchema = findSchema([
    "Product",
    "Service",
    "SoftwareApplication",
    "SaaS",
  ]);
  result.schema.productOrService = productSchema
    ? productSchema.types.find((type) =>
        ["Product", "Service", "SoftwareApplication", "SaaS"].includes(type)
      ) || productSchema.types[0]
    : null;

  result.schema.organization = Boolean(
    findSchema([
      "Organization",
      "Corporation",
      "LocalBusiness",
      "ProfessionalService",
      "Person",
    ])
  );
  result.schema.localBusiness = Boolean(
    findSchema(["LocalBusiness", "ProfessionalService"])
  );
  result.schema.person = Boolean(findSchema(["Person"]));

  const articleSchema = findSchema([
    "Article",
    "BlogPosting",
    "NewsArticle",
    "TechArticle",
    "Report",
  ]);
  result.schema.article = articleSchema
    ? articleSchema.types.find((type) =>
        ["Article", "BlogPosting", "NewsArticle", "TechArticle", "Report"].includes(type)
      ) || articleSchema.types[0]
    : null;

  result.schema.webPage = Boolean(findSchema(["WebPage", "CollectionPage", "AboutPage"]));
  result.schema.webSite = Boolean(findSchema(["WebSite"]));
  result.schema.softwareApplication = Boolean(
    findSchema(["SoftwareApplication", "MobileApplication", "WebApplication"])
  );

  console.log(result.schema.faq ? "FAQ schema found" : "FAQ schema missing");
  console.log(
    result.schema.breadcrumb
      ? "Breadcrumb schema found"
      : "Breadcrumb schema missing"
  );
  console.log(
    result.schema.productOrService
      ? `${result.schema.productOrService} schema found`
      : "Product/Service schema missing"
  );
  console.log(
    result.schema.organization
      ? "Organization schema found"
      : "Organization schema missing"
  );
  console.log(
    result.schema.article
      ? `${result.schema.article} schema found`
      : "Article schema missing"
  );
  console.log(
    result.schema.webPage
      ? "WebPage schema found"
      : "WebPage schema missing"
  );
  console.log(
    result.schema.webSite
      ? "WebSite schema found"
      : "WebSite schema missing"
  );
  console.log(
    result.schema.softwareApplication
      ? "Software/Application schema found"
      : "Software/Application schema missing"
  );
  console.log(
    result.schema.foundTypes.length
      ? `Detected schema types: ${result.schema.foundTypes.join(", ")}`
      : "No schema types detected"
  );

  console.log("\n============================");
  console.log("SECURITY CHECKS");
  console.log("============================\n");

  result.security.hsts = Boolean(headers["strict-transport-security"]);
  result.security.csp = Boolean(headers["content-security-policy"]);
  result.security.xFrameOptions = Boolean(headers["x-frame-options"]);
  result.security.xContentTypeOptions = Boolean(
    headers["x-content-type-options"]
  );

  console.log(result.security.https ? "HTTPS enabled" : "HTTPS not enabled");
  console.log(result.security.hsts ? "HSTS enabled" : "HSTS missing");
  console.log(result.security.csp ? "CSP enabled" : "CSP missing");
  console.log(
    result.security.xFrameOptions
      ? "X-Frame-Options enabled"
      : "X-Frame-Options missing"
  );
  console.log(
    result.security.xContentTypeOptions
      ? "X-Content-Type-Options enabled"
      : "X-Content-Type-Options missing"
  );

  console.log("\n============================");
  console.log("MIXED CONTENT CHECK");
  console.log("============================\n");

  $("img, script, link[rel='stylesheet']").each((_, element) => {
    const resource =
      $(element).attr("src") || $(element).attr("href") || null;
    if (resource && resource.startsWith("http://")) {
      result.mixedContent.push(resource);
    }
  });

  if (result.mixedContent.length === 0) {
    console.log("No mixed content detected");
  } else {
    console.log("Mixed content detected");
    result.mixedContent.forEach((item) => console.log(` - ${item}`));
  }

  console.log("\n============================");
  console.log("ADMIN URL CHECK");
  console.log("============================\n");

  const adminPaths = [
    "/admin",
    "/wp-admin",
    "/login",
    "/dashboard",
    "/cpanel",
    "/phpmyadmin",
  ];

  for (const adminPath of adminPaths) {
    try {
      const checkUrl = `${result.baseUrl}${adminPath}`;
      const adminResponse = await axios.get(checkUrl, {
        timeout: 5000,
        proxy: false,
        validateStatus: () => true,
      });

      if (adminResponse.status < 400) {
        result.adminUrls.push({
          path: adminPath,
          status: adminResponse.status,
        });
      }
    } catch {}
  }

  if (result.adminUrls.length === 0) {
    console.log("No common admin URLs exposed");
  } else {
    console.log("Exposed admin URLs detected");
    result.adminUrls.forEach((item) =>
      console.log(` - ${item.path} (${item.status})`)
    );
  }

  console.log("\n============================");
  console.log("LLMS.TXT CHECK");
  console.log("============================\n");

  try {
    const llmsUrl = `${result.baseUrl}/llms.txt`;
    let llmsText = "";

    try {
      const llmsRes = await axios.get(llmsUrl, {
        timeout: 10000,
        proxy: false,
      });
      llmsText = llmsRes.data;
    } catch (error) {
      if (getHttpStatus(error) === 404) {
        console.log("llms.txt not found");
        throw new Error("llms.txt not found");
      }

      const formatted = formatHttpError(error, llmsUrl);
      console.log(`Direct llms.txt fetch failed: ${formatted.message}`);
      console.log("Falling back to browser-visible llms.txt");

      const browserLlms = await fetchTextResourceWithBrowser(llmsUrl);
      if (browserLlms.status >= 400 || !browserLlms.text.trim()) {
        throw new Error(
          browserLlms.status >= 400
            ? `llms.txt blocked in browser (${browserLlms.status})`
            : "llms.txt returned no visible content"
        );
      }

      llmsText = browserLlms.text;
    }

    result.llms.found = true;
    result.llms.hasTitle = /^#\s.+/m.test(llmsText);
    result.llms.hasDescription = llmsText.length > 100;
    result.llms.links = llmsText.match(/https?:\/\/[^\s]+/g) || [];
    result.llms.tooSmall = llmsText.trim().length < 20;

    console.log("llms.txt found");
    console.log(result.llms.hasTitle ? "Title found" : "Title missing");
    console.log(
      result.llms.hasDescription
        ? "Description found"
        : "Description missing"
    );
    console.log(
      result.llms.links.length > 0
        ? `${result.llms.links.length} links found`
        : "No links found"
    );
    if (result.llms.tooSmall) {
      console.log("llms.txt appears too small");
    }
  } catch (error) {
    if (!isMissingTextResource(error.message, "llms.txt")) {
      result.llms.error = error.message;
    }
    console.log("llms.txt missing");
  }

  console.log("\n============================");
  console.log("META TAG CHECKS");
  console.log("============================\n");

  const ogTags = ["og:title", "og:description", "og:image", "og:url"];
  const twitterTags = [
    "twitter:card",
    "twitter:title",
    "twitter:description",
    "twitter:image",
  ];

  result.metaTags.missingOpenGraph = ogTags.filter(
    (tag) => $(`meta[property="${tag}"]`).length === 0
  );
  result.metaTags.missingTwitter = twitterTags.filter(
    (tag) => $(`meta[name="${tag}"]`).length === 0
  );

  console.log(
    result.metaTags.missingOpenGraph.length === 0
      ? "Open Graph tags found"
      : `Missing OG tags: ${result.metaTags.missingOpenGraph.join(", ")}`
  );
  console.log(
    result.metaTags.missingTwitter.length === 0
      ? "Twitter cards found"
      : `Missing Twitter tags: ${result.metaTags.missingTwitter.join(", ")}`
  );

  console.log("\n============================");
  console.log("SEMANTIC HTML CHECK");
  console.log("============================\n");

  const semanticTags = [
    "header",
    "nav",
    "main",
    "section",
    "article",
    "aside",
    "footer",
  ];

  result.semanticHtml = semanticTags.filter((tag) => $(tag).length > 0);

  console.log(
    result.semanticHtml.length > 0
      ? `Semantic HTML used (${result.semanticHtml.join(", ")})`
      : "No semantic HTML tags found"
  );

  console.log("\n============================");
  console.log("ACCESSIBILITY CHECK");
  console.log("============================\n");

  let missingAria = 0;

  $("button").each((_, element) => {
    const aria = $(element).attr("aria-label");
    const text = $(element).text().trim();
    if (!aria && !text) {
      missingAria += 1;
    }
  });

  $("input").each((_, element) => {
    const aria = $(element).attr("aria-label");
    const placeholder = $(element).attr("placeholder");
    const id = $(element).attr("id");
    const hasLabel = id && $(`label[for="${id}"]`).length > 0;

    if (!aria && !placeholder && !hasLabel) {
      missingAria += 1;
    }
  });

  $("a").each((_, element) => {
    const aria = $(element).attr("aria-label");
    const text = $(element).text().trim();
    if (!aria && !text) {
      missingAria += 1;
    }
  });

  result.accessibility.missingAccessibleLabels = missingAria;

  console.log(
    missingAria === 0
      ? "Basic ARIA accessibility looks good"
      : `${missingAria} elements missing accessible labels`
  );
    // =====================================================
  // CONTENT SEO CHECKS
  // =====================================================

  console.log("\n============================");
  console.log("CONTENT SEO CHECKS");
  console.log("============================\n");

  // ==========================================
  // TITLE TAG
  // ==========================================

  const title = $("title").text().trim();
  result.contentSeo.titleLength = title.length;

  if (title.length >= 30 && title.length <= 65) {
    result.contentSeo.titleOptimized = true;
    console.log(`✅ Optimized title (${title.length} chars)`);
  } else {
    console.log(`❌ Poor title length (${title.length} chars)`);
  }

  // ==========================================
  // META DESCRIPTION
  // ==========================================

  const metaDescription = $(
    'meta[name="description"]'
  ).attr("content") || "";
  result.contentSeo.metaDescriptionLength = metaDescription.length;

  if (
    metaDescription.length >= 120 &&
    metaDescription.length <= 170
  ) {
    result.contentSeo.metaDescriptionOptimized = true;

    console.log(
      `✅ Optimized meta description (${metaDescription.length} chars)`
    );
  } else {
    console.log(
      `❌ Poor meta description (${metaDescription.length} chars)`
    );
  }

  // ==========================================
  // H1 CHECK
  // ==========================================

  const h1s = $("h1");
  result.contentSeo.h1Count = h1s.length;

  if (h1s.length === 1) {
    const h1Text = h1s.first().text().trim();

    if (h1Text.length > 10) {
      result.contentSeo.h1Optimized = true;
      console.log("✅ Optimized H1");
    } else {
      console.log("❌ Weak H1");
    }
  } else {
    console.log(
      `❌ Invalid H1 count (${h1s.length})`
    );
  }

  // ==========================================
  // H2 / H3
  // ==========================================

  result.contentSeo.h2Count = $("h2").length;
  result.contentSeo.h3Count = $("h3").length;

  console.log(
    `✅ H2 Count: ${result.contentSeo.h2Count}`
  );

  console.log(
    `✅ H3 Count: ${result.contentSeo.h3Count}`
  );

  // ==========================================
  // HEADER HIERARCHY
  // ==========================================

  const headings = [];

  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    headings.push(el.tagName.toLowerCase());
  });

  let badHierarchy = false;

  for (let i = 1; i < headings.length; i++) {
    const prev = Number(headings[i - 1][1]);
    const current = Number(headings[i][1]);

    if (current - prev > 1) {
      badHierarchy = true;
      break;
    }
  }

  result.contentSeo.properHeadingHierarchy =
    !badHierarchy;

  console.log(
    !badHierarchy
      ? "✅ Proper heading hierarchy"
      : "❌ Poor heading hierarchy"
  );

  // ==========================================
  // FAQ / ANSWER STYLE CONTENT
  // ==========================================

  const bodyText = $("body").text().toLowerCase();

  const faqPatterns = [
    "what is",
    "how to",
    "why does",
    "frequently asked questions",
    "faq",
  ];

  const hasFaqStyle = faqPatterns.some((pattern) =>
    bodyText.includes(pattern)
  );

  result.contentSeo.faqStyleContent =
    hasFaqStyle;

  console.log(
    hasFaqStyle
      ? "✅ Answer-style content found"
      : "❌ No answer-style content"
  );

  // ==========================================
  // THIN CONTENT
  // ==========================================

  const wordCount = bodyText
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").length;
  result.contentSeo.wordCount = wordCount;

  result.contentSeo.thinContent =
    wordCount < 250;

  console.log(
    wordCount >= 250
      ? `✅ Content length good (${wordCount} words)`
      : `❌ Thin content (${wordCount} words)`
  );

  // ==========================================
  // DEFINITIONS
  // ==========================================

  const definitionPatterns = [
    "is defined as",
    "refers to",
    "means",
  ];

  const hasDefinitions =
    definitionPatterns.some((pattern) =>
      bodyText.includes(pattern)
    );

  result.contentSeo.hasDefinitions =
    hasDefinitions;

  console.log(
    hasDefinitions
      ? "✅ Definitions found"
      : "❌ No definitions found"
  );

  // ==========================================
  // COMPARISONS
  // ==========================================

  const comparisonPatterns = [
    "vs",
    "versus",
    "compared to",
    "difference between",
  ];

  const hasComparisons =
    comparisonPatterns.some((pattern) =>
      bodyText.includes(pattern)
    );

  result.contentSeo.hasComparisons =
    hasComparisons;

  console.log(
    hasComparisons
      ? "✅ Comparisons found"
      : "❌ No comparisons found"
  );

  // ==========================================
  // BULLET POINTS
  // ==========================================

  const bulletCount =
    $("ul li").length + $("ol li").length;
  result.contentSeo.bulletCount = bulletCount;

  result.contentSeo.hasBulletPoints =
    bulletCount > 3;

  console.log(
    bulletCount > 3
      ? `✅ Bullet points found (${bulletCount})`
      : "❌ Few/no bullet points"
  );

  // ==========================================
  // MULTIMODAL CONTENT
  // ==========================================

  const imageCount = $("img").length;
  const videoCount = $("video").length;
  const iframeCount = $("iframe").length;
  result.contentSeo.imageCount = imageCount;
  result.contentSeo.videoCount = videoCount;
  result.contentSeo.iframeCount = iframeCount;

  result.contentSeo.hasMultimedia =
    imageCount > 0 ||
    videoCount > 0 ||
    iframeCount > 0;

  console.log(
    result.contentSeo.hasMultimedia
      ? `✅ Multimedia found (Images: ${imageCount}, Videos: ${videoCount})`
      : "❌ No multimedia found"
  );

  // ==========================================
  // KEY TAKEAWAYS / SUMMARY
  // ==========================================

  const takeawayPatterns = [
    "key takeaways",
    "summary",
    "conclusion",
    "final thoughts",
  ];

  const hasTakeaways =
    takeawayPatterns.some((pattern) =>
      bodyText.includes(pattern)
    );

  result.contentSeo.hasKeyTakeaways =
    hasTakeaways;

  console.log(
    hasTakeaways
      ? "✅ Key takeaway/summary section found"
      : "❌ No summary section found"
  );

  // ==========================================
  // FRESHNESS SIGNALS
  // ==========================================

  const freshnessPatterns = [
    "updated",
    "last updated",
    "published",
  ];

  const hasFreshness =
    freshnessPatterns.some((pattern) =>
      bodyText.includes(pattern)
    );

  result.contentSeo.freshnessSignals =
    hasFreshness;

  console.log(
    hasFreshness
      ? "✅ Freshness/update signals found"
      : "❌ No freshness signals found"
  );

      // =====================================================
    // PAGE SPEED + CRUX CHECK
    // =====================================================

    console.log("\n============================");
    console.log("PAGE SPEED CHECK");
    console.log("============================\n");

    const PAGE_SPEED_API_KEY =
      "AIzaSyAe-ZpRm_MTOIiF5CyfHHVykFG-1FIBNtM";

    const CRUX_API_KEY =
      "AIzaSyAt9dAZsmYCqMxklDYB6vEFcckS40eqrWw";

    try {
      // ==========================================
      // PAGE SPEED API
      // ==========================================

      const psiUrl =
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
          url
        )}&key=${PAGE_SPEED_API_KEY}`;

      const psiRes = await withRetry(
        () =>
          axios.get(psiUrl, {
            timeout: 120000,
          }),
        {
          retries: 2,
          delayMs: 3000,
          label: "PageSpeed request",
          shouldRetry: (error) =>
            error?.code === "ECONNABORTED" ||
            error?.message?.toLowerCase().includes("timeout") ||
            (error?.response?.status >= 500 && error?.response?.status < 600) ||
            error?.response?.status === 429,
        }
      );

      const lighthouse =
        psiRes.data.lighthouseResult;

      const audits = lighthouse.audits;

      // ==========================================
      // TTFB
      // ==========================================

      const ttfb =
        audits["server-response-time"]
          ?.numericValue || 0;
      result.performance.pageSpeed.ttfbMs = Math.round(ttfb);

      if (ttfb <= 400) {
        console.log(
          `✅ Fast server response (${Math.round(
            ttfb
          )}ms)`
        );
      } else {
        console.log(
          `❌ Slow server response (${Math.round(
            ttfb
          )}ms)`
        );
      }

      // ==========================================
      // LCP
      // ==========================================

      const lcp =
        audits[
          "largest-contentful-paint"
        ]?.numericValue || 0;
      result.performance.pageSpeed.lcpMs = Math.round(lcp);

      if (lcp <= 2500) {
        console.log(
          `✅ LCP Passed (${(
            lcp / 1000
          ).toFixed(2)}s)`
        );
      } else {
        console.log(
          `❌ LCP Failed (${(
            lcp / 1000
          ).toFixed(2)}s)`
        );
      }

      // ==========================================
      // CLS
      // ==========================================

      const cls =
        audits[
          "cumulative-layout-shift"
        ]?.numericValue || 0;
      result.performance.pageSpeed.cls = Number(cls.toFixed(3));

      if (cls <= 0.1) {
        console.log(
          `✅ CLS Passed (${cls.toFixed(3)})`
        );
      } else {
        console.log(
          `❌ CLS Failed (${cls.toFixed(3)})`
        );
      }

      // ==========================================
      // JS BLOCKING
      // ==========================================

      const totalBlockingTime =
        audits["total-blocking-time"]
          ?.numericValue || 0;
      result.performance.pageSpeed.totalBlockingTimeMs =
        Math.round(totalBlockingTime);

      if (totalBlockingTime <= 200) {
        console.log(
          `✅ Minimal JS blocking (${Math.round(
            totalBlockingTime
          )}ms)`
        );
      } else {
        console.log(
          `❌ Heavy JS blocking (${Math.round(
            totalBlockingTime
          )}ms)`
        );
      }

      // ==========================================
      // COMPRESSION
      // ==========================================

      const encoding =
        headers?.[
          "content-encoding"
        ];
      result.performance.pageSpeed.compressionEncoding =
        encoding || null;

      if (
        encoding &&
        (
          encoding.includes("gzip") ||
          encoding.includes("br")
        )
      ) {
        result.performance.pageSpeed.compressionEnabled = true;
        console.log(
          `✅ Compression enabled (${encoding})`
        );
      } else {
        console.log(
          "❌ GZIP/Brotli compression missing"
        );
      }

      // ==========================================
      // PERFORMANCE SCORE
      // ==========================================

      const performanceScore =
        lighthouse.categories.performance
          .score * 100;
      result.performance.pageSpeed.performanceScore =
        Math.round(performanceScore);
      result.performance.pageSpeed.success = true;

      console.log(
        `✅ Performance Score: ${performanceScore}`
      );

    } catch (err) {
      result.performance.pageSpeed.success = false;
      result.performance.pageSpeed.error =
        err?.code === "ECONNABORTED" || err?.message?.toLowerCase().includes("timeout")
          ? "PageSpeed API timed out after multiple attempts"
          : err.message;
      console.log(
        "❌ Failed to fetch PageSpeed data"
      );
      if (result.performance.pageSpeed.error) {
        console.log(result.performance.pageSpeed.error);
      }
    }

    // =====================================================
    // CRUX REAL USER DATA
    // =====================================================

    console.log("\n============================");
    console.log("CRUX REAL USER DATA");
    console.log("============================\n");

    try {
      const cruxRes = await axios.post(
        `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_API_KEY}`,
        {
          url,
        },
        {
          timeout: 30000,
        }
      );

      const metrics =
        cruxRes.data.record.metrics;

      // ==========================================
      // INP
      // ==========================================

      const inp =
        metrics.interaction_to_next_paint
          ?.percentiles?.p75 || 0;
      result.performance.crux.success = true;
      result.performance.crux.inpMs = inp;

      if (inp <= 200) {
        console.log(
          `✅ INP Passed (${inp}ms)`
        );
      } else {
        console.log(
          `❌ INP Failed (${inp}ms)`
        );
      }

      // ==========================================
      // REAL USER LCP
      // ==========================================

      const realLcp =
        metrics.largest_contentful_paint
          ?.percentiles?.p75 || 0;
      result.performance.crux.lcpMs = realLcp;

      console.log(
        `✅ Real User LCP: ${(
          realLcp / 1000
        ).toFixed(2)}s`
      );

      // ==========================================
      // REAL USER CLS
      // ==========================================

      const realCls =
        metrics.cumulative_layout_shift
          ?.percentiles?.p75 || 0;
      result.performance.crux.cls =
        Number((realCls / 1000).toFixed(3));

      console.log(
        `✅ Real User CLS: ${(
          realCls / 1000
        ).toFixed(3)}`
      );

    } catch (err) {
      result.performance.crux.error =
        err.message;
      console.log(
        "❌ Failed to fetch CrUX data"
      );
    }

    

//   console.log("\n============================");
//   console.log("SEO + SECURITY AUDIT COMPLETE");
//   console.log("============================\n");

  return result;
}

async function auditBot(browser, bot, url) {
  console.log(`\nTesting ${bot.name}`);

  const context = await browser.newContext({
    userAgent: bot.userAgent,
    viewport: {
      width: 1366,
      height: 768,
    },
    locale: "en-US",
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(MAX_TIMEOUT);

  const networkLogs = [];
  const documentNavigations = [];
  let blockedNavigationUrl = null;

  let preflight = {
    status: null,
    location: null,
    finalUrl: null,
    title: null,
  };

  page.on("response", async (response) => {
    try {
      networkLogs.push({
        url: response.url(),
        status: response.status(),
      });

      if (response.request().resourceType() === "document") {
        documentNavigations.push({
          url: response.url(),
          status: response.status(),
        });
      }
    } catch {}
  });

  try {
    const preflightResponse = await axios.get(url, {
      timeout: 10000,
      proxy: false,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: {
        "User-Agent": bot.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    preflight = {
      status: preflightResponse.status,
      location: preflightResponse.headers?.location || null,
      finalUrl: resolveRedirectUrl(url, preflightResponse.headers?.location || null),
      title: extractTitleFromHtml(preflightResponse.data),
    };

    if (preflight.status >= 400) {
      const result = {
        bot: bot.name,
        testedUrl: url,
        initialUrl: url,
        finalUrl: url,
        success: false,
        status: preflight.status,
        blocked: true,
        blockReason: preflight.status === 429 ? "rate-limited" : `http-${preflight.status}`,
        navigatedAfterLoad: false,
        title: preflight.title,
        h1: null,
        canonical: null,
        robotsMeta: null,
        googlebotMeta: null,
        loadTime: "0 ms",
        totalRequests: 0,
        server: preflightResponse.headers?.server || null,
        xRobotsTag: preflightResponse.headers?.["x-robots-tag"] || null,
        contentType: preflightResponse.headers?.["content-type"] || null,
        cfRay: preflightResponse.headers?.["cf-ray"] || null,
        documentNavigations: [{ url, status: preflight.status }],
        renderedTextPreview:
          typeof preflightResponse.data === "string"
            ? preflightResponse.data.replace(/\s+/g, " ").trim().slice(0, 1500)
            : "",
        screenshot: null,
        htmlSnapshot: null,
        preflight,
      };

      console.log(`${bot.name} BLOCKED (${result.blockReason})`);
      console.log({
        status: result.status,
        testedUrl: result.testedUrl,
        initialUrl: result.initialUrl,
        finalUrl: result.finalUrl,
        title: result.title,
        blocked: result.blocked,
        reason: result.blockReason,
        navigatedAfterLoad: result.navigatedAfterLoad,
        documentNavigations: result.documentNavigations,
        preflight: result.preflight,
      });

      await context.close();
      return result;
    }

    if (
      isRedirectStatus(preflight.status) &&
      preflight.finalUrl &&
      !isSameOriginUrl(url, preflight.finalUrl)
    ) {
      const result = {
        bot: bot.name,
        testedUrl: url,
        initialUrl: url,
        finalUrl: preflight.finalUrl,
        success: false,
        status: preflight.status,
        blocked: true,
        blockReason: "redirected-off-origin",
        navigatedAfterLoad: false,
        title: null,
        h1: null,
        canonical: null,
        robotsMeta: null,
        googlebotMeta: null,
        loadTime: "0 ms",
        totalRequests: 0,
        server: preflightResponse.headers?.server || null,
        xRobotsTag: preflightResponse.headers?.["x-robots-tag"] || null,
        contentType: preflightResponse.headers?.["content-type"] || null,
        cfRay: preflightResponse.headers?.["cf-ray"] || null,
        documentNavigations: [{ url, status: preflight.status }],
        renderedTextPreview: "",
        screenshot: null,
        htmlSnapshot: null,
        preflight,
      };

      console.log(`${bot.name} BLOCKED (redirected-off-origin)`);
      console.log({
        status: result.status,
        testedUrl: result.testedUrl,
        initialUrl: result.initialUrl,
        finalUrl: result.finalUrl,
        title: result.title,
        blocked: result.blocked,
        reason: result.blockReason,
        navigatedAfterLoad: result.navigatedAfterLoad,
        documentNavigations: result.documentNavigations,
        preflight: result.preflight,
      });

      await context.close();
      return result;
    }

    await page.route("**/*", async (route) => {
      const request = route.request();
      const isMainFrameDocument =
        request.isNavigationRequest() &&
        request.resourceType() === "document" &&
        request.frame() === page.mainFrame();

      if (isMainFrameDocument && !isSameOriginUrl(url, request.url())) {
        blockedNavigationUrl = request.url();
        await route.abort();
        return;
      }

      await route.continue();
    });

    await page.route('**/*.{woff,woff2,ttf,otf}', (route) => route.abort());

    const start = Date.now();
    let response = null;

    try {
      response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: MAX_TIMEOUT,
      });
    } catch (error) {
      if (blockedNavigationUrl) {
        const result = {
          bot: bot.name,
          testedUrl: url,
          initialUrl: url,
          finalUrl: url,
          success: true,
          status: preflight.status,
          blocked: false,
          blockReason: null,
          navigatedAfterLoad: false,
          title: preflight.title,
          h1: null,
          canonical: null,
          robotsMeta: null,
          googlebotMeta: null,
          loadTime: `${Date.now() - start} ms`,
          totalRequests: networkLogs.length,
          server: preflightResponse.headers?.server || null,
          xRobotsTag: preflightResponse.headers?.["x-robots-tag"] || null,
          contentType: preflightResponse.headers?.["content-type"] || null,
          cfRay: preflightResponse.headers?.["cf-ray"] || null,
          documentNavigations,
          renderedTextPreview: "",
          screenshot: null,
          htmlSnapshot: null,
          browserAttemptedOffOriginUrl: blockedNavigationUrl,
          preflight,
        };

        console.log(`${bot.name} ALLOWED (validated on requested URL; browser tried off-origin navigation)`);
        console.log({
          status: result.status,
          testedUrl: result.testedUrl,
          initialUrl: result.initialUrl,
          finalUrl: result.finalUrl,
          title: result.title,
          blocked: result.blocked,
          reason: result.blockReason,
          navigatedAfterLoad: result.navigatedAfterLoad,
          documentNavigations: result.documentNavigations,
          preflight: result.preflight,
        });

        await context.close();
        return result;
      }

      throw error;
    }

    const loadTime = Date.now() - start;
    const initialUrl = page.url();
    const html = await page.content();
    const title = await page.title();
    const headers = response.headers();
    const status = response.status();
    const robotsMeta = await safeMeta(page, 'meta[name="robots"]');
    const googlebotMeta = await safeMeta(page, 'meta[name="googlebot"]');
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href")
      .catch(() => null);
    const h1 = await page.locator("h1").first().textContent().catch(() => null);
    const renderedText = await page.evaluate(() =>
      (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1500)
    );
    const bodyText = await page.evaluate(() => document.body.innerText || "");
    const block = detectBlock(html, status, title, bodyText);
    const redirectedOffOrigin = !isSameOriginUrl(url, initialUrl);
    const blocked = block.blocked;
    const blockReason = block.reason;

    await page.waitForTimeout(5000);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    const postInteractionUrl = page.url();
    const navigatedAfterLoad = postInteractionUrl !== initialUrl;

    const safeName = cleanFileName(bot.name);
    const screenshotPath = path.join(screenshotsDir, `${safeName}.png`);
    const htmlPath = path.join(htmlDir, `${safeName}.html`);

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: MAX_TIMEOUT,
    });

    fs.writeFileSync(htmlPath, html);

    const result = {
      bot: bot.name,
      testedUrl: url,
      initialUrl: redirectedOffOrigin ? url : initialUrl,
      finalUrl: redirectedOffOrigin ? url : initialUrl,
      success: status >= 200 && status < 400 && !blocked,
      status,
      blocked,
      blockReason,
      navigatedAfterLoad: redirectedOffOrigin ? false : navigatedAfterLoad,
      title: redirectedOffOrigin ? preflight.title : title,
      h1,
      canonical,
      robotsMeta,
      googlebotMeta,
      loadTime: `${loadTime} ms`,
      totalRequests: networkLogs.length,
      server: headers.server || null,
      xRobotsTag: headers["x-robots-tag"] || null,
      contentType: headers["content-type"] || null,
      cfRay: headers["cf-ray"] || null,
      documentNavigations,
      renderedTextPreview: renderedText,
      screenshot: redirectedOffOrigin ? null : screenshotPath,
      htmlSnapshot: redirectedOffOrigin ? null : htmlPath,
      browserAttemptedOffOriginUrl: redirectedOffOrigin ? initialUrl : null,
      preflight,
    };

    console.log(
      result.blocked
        ? `${bot.name} BLOCKED (${result.blockReason})`
        : `${bot.name} ALLOWED`
    );
    console.log({
      status: result.status,
      testedUrl: result.testedUrl,
      initialUrl: result.initialUrl,
      finalUrl: result.finalUrl,
      title: result.title,
      blocked: result.blocked,
      reason: result.blockReason,
      navigatedAfterLoad: result.navigatedAfterLoad,
      documentNavigations: result.documentNavigations,
      preflight: result.preflight,
    });

    await context.close();
    return result;
  } catch (error) {
    console.log(`${bot.name} FAILED`);
    console.log(error.message);

    await context.close();

    return {
      bot: bot.name,
      testedUrl: url,
      success: false,
      error: error.message,
    };
  }
}

async function auditBotWithRetry(browser, bot, url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await auditBot(browser, bot, url);
    if (result.success || !result.error || attempt === retries) return result;
    console.log(`\nRetrying ${bot.name} (attempt ${attempt + 2}/${retries + 1})`);
  }
}

async function runBotCrawlabilityAudit(url) {
  console.log("\n====================================");
  console.log("AI BOT CRAWLABILITY AUDITOR");
  console.log("====================================");
  try {
    const browser = await chromium.launch({
      headless: true,
    });

    const results = [];

    try {
      const botResults = await Promise.all(
        bots.map((bot) => auditBotWithRetry(browser, bot, url))
      );

      results.push(...botResults);

      console.log("\nBOT AUDIT COMPLETE\n");
      return {
        success: true,
        results,
        error: null,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.log("\nBOT AUDIT COULD NOT START\n");
    console.log(error.message);
    return {
      success: false,
      results: [],
      error: error.message,
    };
  }
}

async function runCombinedAudit(url = TARGET_URL) {
  try {
    const [seoSecurityAudit, aiBotCrawlabilityAudit] =
      await Promise.all([
        runSeoSecurityAudit(url),
        runBotCrawlabilityAudit(url),
      ]);

    const combinedReport = {
      targetUrl: url,
      generatedAt: new Date().toISOString(),
      seoSecurityAudit,
      aiBotCrawlabilityAudit,
    };

    const reportPath = path.join(reportsDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(combinedReport, null, 2));

    console.log("\n====================================");
    console.log("COMBINED REPORT SAVED");
    console.log(reportPath);
    console.log("====================================");

    return combinedReport;
  } catch (error) {
    console.error("\nError:", error.message);
    throw error;
  }
}

if (require.main === module) {
  const cliUrl = process.argv[2];
  const targetUrl = cliUrl || TARGET_URL;

  runCombinedAudit(targetUrl).catch((error) => {
    const formatted = formatHttpError(error, targetUrl);
    console.error("Audit failed:", formatted.message);
    process.exitCode = 1;
  });
}

module.exports = {
  runCombinedAudit,
};
