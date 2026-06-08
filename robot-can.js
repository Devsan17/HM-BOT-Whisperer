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

function detectBlock(html, status, title, bodyText) {
  const content = `${html}\n${title}\n${bodyText}`.toLowerCase();
  const patterns = [
    "access denied",
    "forbidden",
    "temporarily unavailable",
    "request blocked",
    "attention required",
    "cf-browser-verification",
    "checking your browser",
    "please wait while your request is being verified",
    "verify you are human",
    "sucuri",
    "akamai",
    "datadome",
    "perimeterx",
    "bot protection",
    "security check",
    "bad bot access attempt",
    "challenge-platform",
  ];

  const matchedPattern = patterns.find((pattern) =>
    content.includes(pattern)
  );

  const normalizedTitle = (title || "").toLowerCase();
  const suspiciousTitle =
    normalizedTitle.includes("access denied") ||
    normalizedTitle.includes("forbidden") ||
    normalizedTitle.includes("attention required");

  const tinyPage = (bodyText || "").trim().length < 50;

  return {
    blocked:
      status === 401 ||
      status === 403 ||
      status === 429 ||
      Boolean(matchedPattern) ||
      suspiciousTitle ||
      tinyPage,
    reason:
      matchedPattern ||
      (suspiciousTitle ? "suspicious-title" : null) ||
      (tinyPage ? "tiny-page" : null),
  };
}

async function safeMeta(page, selector) {
  try {
    return await page.locator(selector).getAttribute("content");
  } catch {
    return null;
  }
}

async function runSeoSecurityAudit(url) {
  const result = {
    url,
    baseUrl: new URL(url).origin,
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
    const robotsRes = await axios.get(robotsUrl, {
      timeout: 10000,
      proxy: false,
    });
    const robotsText = robotsRes.data;
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
    result.robots.error = error.message;
    console.log("robots.txt missing");
  }

  console.log("\n============================");
  console.log("FETCHING PAGE");
  console.log("============================\n");

  const response = await axios.get(url, {
    timeout: 15000,
    proxy: false,
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    maxRedirects: 10,
  });

  const html = response.data;
  const headers = response.headers;
  const $ = cheerio.load(html);

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

  const schemaScripts = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const json = JSON.parse($(element).html());
      if (Array.isArray(json)) {
        schemaScripts.push(...json);
      } else if (json["@graph"]) {
        schemaScripts.push(...json["@graph"]);
      } else {
        schemaScripts.push(json);
      }
    } catch {}
  });

  const findSchema = (types) =>
    schemaScripts.find((item) => {
      const type = item["@type"];
      if (!type) {
        return false;
      }

      if (Array.isArray(type)) {
        return type.some((entry) => types.includes(entry));
      }

      return types.includes(type);
    });

  result.schema.faq = Boolean(findSchema(["FAQPage"]));
  result.schema.breadcrumb = Boolean(findSchema(["BreadcrumbList"]));

  const productSchema = findSchema(["Product", "Service"]);
  result.schema.productOrService = productSchema
    ? productSchema["@type"]
    : null;

  result.schema.organization = Boolean(
    findSchema(["Organization", "Corporation", "LocalBusiness"])
  );

  const articleSchema = findSchema(["Article", "BlogPosting", "NewsArticle"]);
  result.schema.article = articleSchema ? articleSchema["@type"] : null;

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
    const llmsRes = await axios.get(llmsUrl, {
      timeout: 10000,
      proxy: false,
    });
    const llmsText = llmsRes.data;

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
    result.llms.error = error.message;
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

      const psiRes = await axios.get(psiUrl, {
        timeout: 60000,
      });

      const lighthouse =
        psiRes.data.lighthouseResult;

      const audits = lighthouse.audits;

      // ==========================================
      // TTFB
      // ==========================================

      const ttfb =
        audits["server-response-time"]
          ?.numericValue || 0;
      result.performance.pageSpeed.success = true;
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
        response.headers[
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

      console.log(
        `✅ Performance Score: ${performanceScore}`
      );

    } catch (err) {
      result.performance.pageSpeed.error =
        err.message;
      console.log(
        "❌ Failed to fetch PageSpeed data"
      );
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

  page.on("response", async (response) => {
    try {
      networkLogs.push({
        url: response.url(),
        status: response.status(),
      });
    } catch {}
  });

  try {
    await page.route('**/*.{woff,woff2,ttf,otf}', (route) => route.abort());

    const start = Date.now();
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: MAX_TIMEOUT,
    });

    await page.waitForTimeout(5000);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    const loadTime = Date.now() - start;
    const html = await page.content();
    const title = await page.title();
    const headers = response.headers();
    const status = response.status();
    const finalUrl = page.url();
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
      finalUrl,
      success: status >= 200 && status < 400 && !block.blocked,
      status,
      blocked: block.blocked,
      blockReason: block.reason,
      title,
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
      renderedTextPreview: renderedText,
      screenshot: screenshotPath,
      htmlSnapshot: htmlPath,
    };

    console.log(
      result.blocked
        ? `${bot.name} BLOCKED (${result.blockReason})`
        : `${bot.name} ALLOWED`
    );
    console.log({
      status: result.status,
      title: result.title,
      blocked: result.blocked,
      reason: result.blockReason,
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
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runCombinedAudit,
};
