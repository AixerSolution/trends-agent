#!/usr/bin/env node

/**
 * TRENDS AGENT
 * Real-Time Southeast Asian Consumer Trend & Sentiment Analyzer
 *
 * Multi-Agent System:
 *   Sentiment Analyzer  → consumer buying sentiments across e-commerce & social
 *   Trend Detector      → emerging products with high growth velocity
 *   Market Evaluator    → saturation, competition, import viability
 *   Intelligence Synthesizer → ranked opportunity report
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { GoogleTrendsConnector } from "./data-integration.mjs";

// Load .env if present
if (existsSync(new URL(".env", import.meta.url).pathname)) {
  const env = readFileSync(new URL(".env", import.meta.url).pathname, "utf-8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY is not set. Copy .env.example → .env and add your key.");
  process.exit(1);
}

const client = new Anthropic();

const COUNTRY_CODE = {
  Thailand: "TH", Vietnam: "VN", Indonesia: "ID",
  Philippines: "PH", Malaysia: "MY", Singapore: "SG",
};

const googleTrends = process.env.SEARCHAPI_KEY
  ? new GoogleTrendsConnector(process.env.SEARCHAPI_KEY)
  : null;

// =============================================================================
// AGENT TOOL DEFINITIONS
// =============================================================================

const TOOLS = [
  // ── Sentiment Analyzer ──────────────────────────────────────────────────
  {
    name: "query_ecommerce_sentiment",
    description:
      "Query real-time consumer sentiment from SE Asian e-commerce platforms (Shopee, Lazada, TikTok Shop)",
    input_schema: {
      type: "object",
      properties: {
        country: {
          type: "string",
          enum: ["Thailand", "Vietnam", "Indonesia", "Philippines", "Malaysia", "Singapore"],
          description: "Target country",
        },
        category: {
          type: "string",
          description: "Product category, e.g. fashion, electronics, beauty",
        },
        sentiment_type: {
          type: "string",
          enum: ["positive", "negative", "neutral", "all"],
          description: "Filter by sentiment type",
        },
      },
      required: ["country", "category"],
    },
  },
  {
    name: "analyze_social_sentiment",
    description: "Analyze sentiment from social media (TikTok, Instagram, Facebook) in SE Asia",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["TikTok", "Instagram", "Facebook"] },
        country: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        timeframe: { type: "string", enum: ["24h", "7d", "30d"] },
      },
      required: ["platform", "country"],
    },
  },

  // ── Trend Detector ───────────────────────────────────────────────────────
  {
    name: "detect_trending_products",
    description: "Detect rapidly growing products using search volume and sales velocity data",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", description: "SE Asia region or specific country" },
        time_window: {
          type: "string",
          enum: ["1d", "7d", "30d", "90d"],
          description: "Period to measure trend growth",
        },
        growth_threshold: {
          type: "number",
          description: "Minimum % growth to flag as a trend (default: 50)",
        },
        product_categories: { type: "array", items: { type: "string" } },
      },
      required: ["region"],
    },
  },
  {
    name: "identify_pattern_shifts",
    description: "Identify shifts in consumer behaviour patterns and emerging sub-trends",
    input_schema: {
      type: "object",
      properties: {
        analysis_type: {
          type: "string",
          enum: ["seasonal", "demographic_shift", "price_sensitivity", "channel_migration"],
        },
        country: { type: "string" },
        data_source: {
          type: "string",
          enum: ["ecommerce", "social_commerce", "search_trends"],
        },
      },
      required: ["country", "analysis_type"],
    },
  },
  {
    name: "get_category_velocity",
    description: "Get sales velocity metrics for a product category",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string" },
        country: { type: "string" },
        metric: { type: "string", enum: ["daily_growth", "weekly_growth", "momentum_score"] },
      },
      required: ["category", "country"],
    },
  },

  // ── Market Evaluator ─────────────────────────────────────────────────────
  {
    name: "analyze_market_saturation",
    description: "Analyse market saturation and competitive landscape for a product",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        country: { type: "string" },
        competitor_analysis: {
          type: "boolean",
          description: "Include competitor pricing and positioning",
        },
      },
      required: ["product", "country"],
    },
  },
  {
    name: "evaluate_import_viability",
    description: "Evaluate logistics, tariffs, and import feasibility for SE Asian markets",
    input_schema: {
      type: "object",
      properties: {
        product_type: { type: "string" },
        origin_country: { type: "string", description: "Where the product would be sourced" },
        target_market: { type: "string" },
      },
      required: ["product_type", "target_market"],
    },
  },
  {
    name: "calculate_opportunity_score",
    description: "Calculate market opportunity score based on trend strength and viability",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        trend_velocity: { type: "number", description: "Growth rate %" },
        saturation_level: { type: "number", description: "Market saturation 0–100" },
        demand_signal: { type: "number", description: "Consumer demand signal 0–100" },
        countries: { type: "array", items: { type: "string" } },
      },
      required: ["product", "countries"],
    },
  },

  // ── Intelligence Synthesizer ─────────────────────────────────────────────
  {
    name: "generate_opportunity_report",
    description: "Generate a comprehensive opportunity report with ranked recommendations",
    input_schema: {
      type: "object",
      properties: {
        opportunities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product: { type: "string" },
              market: { type: "string" },
              opportunity_score: { type: "number" },
              key_insights: { type: "array", items: { type: "string" } },
            },
          },
        },
        analysis_date: { type: "string" },
      },
      required: ["opportunities"],
    },
  },
  {
    name: "rank_opportunities",
    description: "Rank market opportunities by viability and ROI potential",
    input_schema: {
      type: "object",
      properties: {
        ranking_criteria: {
          type: "array",
          items: { type: "string" },
          description: "e.g. trend_strength, market_size, competition_level, profit_margin",
        },
      },
    },
  },
  {
    name: "save_run_report",
    description: "Save the final structured analysis to disk for dashboard display. Call this as your LAST action after generate_opportunity_report.",
    input_schema: {
      type: "object",
      properties: {
        opportunities: {
          type: "array",
          description: "Top 5 ranked opportunities with full detail",
          items: {
            type: "object",
            properties: {
              rank: { type: "number" },
              product: { type: "string" },
              opportunity_score: { type: "number", description: "0-100" },
              primary_market: { type: "string" },
              secondary_markets: { type: "array", items: { type: "string" } },
              growth_velocity: { type: "string", description: "e.g. '245%'" },
              saturation_pct: { type: "number", description: "Market saturation 0-100" },
              sentiment_score: { type: "number" },
              action_window: { type: "string", description: "e.g. '60 days'" },
              key_insights: { type: "array", items: { type: "string" } },
              sourcing: { type: "string" },
              risks: { type: "array", items: { type: "string" } },
            },
            required: ["rank", "product", "opportunity_score", "primary_market"],
          },
        },
        themes: { type: "array", items: { type: "string" }, description: "Cross-cutting market themes" },
        executive_summary: { type: "string", description: "2-3 sentence summary of findings" },
      },
      required: ["opportunities"],
    },
  },
];

// =============================================================================
// MOCK DATA  (replace with real API connectors from data-integration.mjs)
// =============================================================================

const MOCK = {
  trendingProducts: {
    Thailand: [
      { product: "AI-powered makeup mirrors", growth: 245, sentiment: 94 },
      { product: "Smart pet feeders", growth: 178, sentiment: 88 },
      { product: "Eco-friendly packaging solutions", growth: 156, sentiment: 85 },
      { product: "Wireless gaming mice", growth: 134, sentiment: 82 },
    ],
    Vietnam: [
      { product: "Mobile gaming controllers", growth: 267, sentiment: 91 },
      { product: "Cold brew coffee makers", growth: 189, sentiment: 87 },
      { product: "LED ring lights for content creators", growth: 198, sentiment: 89 },
      { product: "Portable projectors", growth: 145, sentiment: 81 },
    ],
    Indonesia: [
      { product: "Affordable smartwatches", growth: 223, sentiment: 90 },
      { product: "Compact air fryers", growth: 201, sentiment: 86 },
      { product: "USB-C multi-chargers", growth: 167, sentiment: 84 },
      { product: "Wireless earbuds cases", growth: 156, sentiment: 80 },
    ],
    Philippines: [
      { product: "Streaming camera equipment", growth: 189, sentiment: 87 },
      { product: "Fitness tracking bands", growth: 167, sentiment: 85 },
      { product: "Phone cooling fans", growth: 145, sentiment: 79 },
    ],
    Malaysia: [
      { product: "Minimalist desk organisers", growth: 134, sentiment: 81 },
      { product: "Low-latency gaming keyboards", growth: 156, sentiment: 83 },
      { product: "Hydration reminder bottles", growth: 123, sentiment: 78 },
    ],
    Singapore: [
      { product: "Premium cable organisers", growth: 112, sentiment: 79 },
      { product: "Adjustable monitor stands", growth: 134, sentiment: 81 },
    ],
  },

  marketSaturation: {
    Thailand: { "AI-powered makeup mirrors": 15, "Smart pet feeders": 22 },
    Vietnam: { "Mobile gaming controllers": 28, "LED ring lights": 35 },
    Indonesia: { "Affordable smartwatches": 42, "Compact air fryers": 38 },
    Philippines: { "Streaming equipment": 24, "Fitness trackers": 31 },
    Malaysia: { "Gaming keyboards": 45, "Desk organisers": 18 },
    Singapore: { "Monitor stands": 52 },
  },
};

// =============================================================================
// TOOL HANDLERS
// =============================================================================

async function executeTool(name, input) {
  switch (name) {
    case "query_ecommerce_sentiment": {
      const { country, category } = input;
      const products = MOCK.trendingProducts[country] || [];
      const match = products.find((p) =>
        p.product.toLowerCase().includes(category.toLowerCase())
      );
      return {
        status: "success",
        country,
        category,
        sentiment_score: match?.sentiment ?? 85,
        volume: Math.floor(Math.random() * 5000 + 1000),
        price_trends: "Stable with seasonal fluctuations",
        peak_times: "7–10 PM and lunch hours (12–1 PM)",
        top_buyers: "Ages 18–35, urban areas, digitally native",
      };
    }

    case "analyze_social_sentiment": {
      const { platform, country } = input;
      return {
        platform,
        country,
        total_mentions: Math.floor(Math.random() * 50000 + 10000),
        positive_sentiment_pct: Math.floor(Math.random() * 20 + 75),
        engagement_rate: "6.5–8.2%",
        growth_trend: "↑ 45% week-over-week",
        viral_drivers: "Content creator reviews driving 70% of engagement",
      };
    }

    case "detect_trending_products": {
      const { region, product_categories } = input;
      if (googleTrends) {
        try {
          const cc = COUNTRY_CODE[region] || "TH";
          const categories = product_categories?.length
            ? product_categories
            : ["gaming accessories", "skincare", "smart home gadgets", "fitness tracker", "kitchen gadgets"];
          const NEWS_NOISE = /\b(news|today|price|update|review|rumor|release|date|vs|leak|stock|recycle|how to|what is|dividend|earnings)\b/i;
          const seen = new Set();
          const rising = [];
          for (const cat of categories.slice(0, 3)) {
            const raw = await googleTrends.getRelatedQueries(cat, cc);
            const risingItems = raw.related_queries?.rising || [];
            const topItems = raw.related_queries?.top || [];
            // Prefer rising (breakout growth); supplement with top when rising is sparse
            const candidates = risingItems.length >= 3 ? risingItems : [...risingItems, ...topItems];
            for (const item of candidates) {
              if (!NEWS_NOISE.test(item.query) && !seen.has(item.query)) {
                seen.add(item.query);
                rising.push({
                  product: item.query,
                  growth: Math.min(item.extracted_value || 100, 999),
                  sentiment: Math.floor(Math.random() * 10 + 82),
                  category: cat,
                });
              }
            }
          }
          if (rising.length > 0) {
            return {
              region,
              trending_products: rising.slice(0, 5),
              detection_method: "Google Trends rising queries (live)",
              confidence_level: "real-time",
            };
          }

          // RELATED_QUERIES throttled — fall back to TIMESERIES on candidate products
          console.log("  ⚠️  RELATED_QUERIES throttled — using TIMESERIES candidate scan");
          const candidates = [
            "gaming controller", "wireless earbuds", "smart watch", "air fryer",
            "ring light", "skincare serum", "face mask", "bluetooth speaker",
            "robot vacuum", "phone stand", "fitness tracker", "led strip lights",
          ];
          const scored = [];
          for (const kw of candidates.slice(0, 6)) {
            const raw = await googleTrends.getInterestOverTime(kw, cc);
            const tl = raw.interest_over_time?.timeline_data || [];
            if (tl.length < 8) continue;
            const vals = tl.map((t) => t.values?.[0]?.extracted_value ?? 0);
            const recent = vals.slice(-4).reduce((a, b) => a + b, 0) / 4;
            const older = vals.slice(-12, -4).reduce((a, b) => a + b, 0) / Math.max(vals.slice(-12, -4).length, 1);
            const growth = older > 0 ? Math.round(((recent - older) / older) * 100) : 0;
            scored.push({ product: kw, growth, sentiment: Math.floor(Math.random() * 10 + 82) });
          }
          scored.sort((a, b) => b.growth - a.growth);
          if (scored.length > 0) {
            return {
              region,
              trending_products: scored.slice(0, 5),
              detection_method: "Google Trends velocity scan (live)",
              confidence_level: "real-time",
            };
          }
        } catch (err) {
          console.error(`  SearchAPI error (detect_trending_products): ${err.message} — using mock`);
        }
      }
      const products = MOCK.trendingProducts[region] || [];
      return {
        region,
        trending_products: products.slice(0, 3),
        detection_method: "Search volume + sales velocity (mock)",
        confidence_level: "92–98%",
      };
    }

    case "identify_pattern_shifts": {
      const { country, analysis_type } = input;
      const shifts = {
        seasonal: "Post-holiday recovery trend emerging; Q2 surge expected",
        demographic_shift: "Gen Z dominance up 35% YoY across SE Asia",
        price_sensitivity: "Growing demand for 'affordable premium' segment",
        channel_migration: "TikTok Shop adoption up 156%; traditional e-commerce stable",
      };
      return {
        country,
        analysis_type,
        pattern_detected: shifts[analysis_type] ?? "No significant shift detected",
        impact: "High — affects inventory and marketing strategy",
        timeline: "3–6 months to full market saturation",
      };
    }

    case "get_category_velocity": {
      const { category, country } = input;
      if (googleTrends) {
        try {
          const cc = COUNTRY_CODE[country] || "TH";
          const raw = await googleTrends.getInterestOverTime(category, cc);
          const timeline = raw.interest_over_time?.timeline_data || [];
          if (timeline.length >= 8) {
            const vals = timeline.map((t) => t.values?.[0]?.extracted_value ?? 50);
            const recent = vals.slice(-4).reduce((a, b) => a + b, 0) / 4;
            const older = vals.slice(-12, -4).reduce((a, b) => a + b, 0) / Math.max(vals.slice(-12, -4).length, 1);
            const weeklyGrowth = older > 0 ? Math.round(((recent - older) / older) * 100) : 0;
            return {
              category,
              country,
              daily_growth: Math.round(weeklyGrowth / 7) + "%",
              weekly_growth: weeklyGrowth + "%",
              momentum_score: Math.min(100, Math.round(recent)),
              velocity_trend: weeklyGrowth > 20 ? "Accelerating" : weeklyGrowth > 0 ? "Growing" : "Declining",
              source: "Google Trends live",
            };
          }
        } catch (err) {
          console.error(`  SearchAPI error (get_category_velocity): ${err.message} — using mock`);
        }
      }
      return {
        category,
        country,
        daily_growth: Math.floor(Math.random() * 15 + 5) + "%",
        weekly_growth: Math.floor(Math.random() * 45 + 25) + "%",
        momentum_score: Math.floor(Math.random() * 30 + 70),
        velocity_trend: "Accelerating",
      };
    }

    case "analyze_market_saturation": {
      const { product, country } = input;
      const saturation =
        MOCK.marketSaturation[country]?.[product] ?? Math.floor(Math.random() * 50);
      return {
        product,
        country,
        saturation_pct: saturation,
        opportunity_level: saturation < 30 ? "High" : saturation < 50 ? "Medium" : "Low",
        competitor_count: Math.floor(Math.random() * 500 + 50),
        market_maturity: saturation < 30 ? "Early stage" : "Growth phase",
      };
    }

    case "evaluate_import_viability": {
      const { product_type, target_market } = input;
      return {
        product_type,
        target_market,
        import_feasibility: "High",
        estimated_tariff_rate: "5–12%",
        logistics_complexity: "Low-Medium",
        recommended_suppliers: "China (quality), India (cost), Vietnam (balance)",
        shipping_time: "15–25 days via standard shipping",
        customs_documentation: "Standard — no special permits needed",
      };
    }

    case "calculate_opportunity_score": {
      const { product, trend_velocity = 100, saturation_level = 50, demand_signal = 75 } = input;
      const raw =
        trend_velocity * 0.4 + (100 - saturation_level) * 0.35 + demand_signal * 0.25;
      const score = Math.min(100, Math.round(raw));
      return {
        product,
        opportunity_score: score,
        score_breakdown: {
          trend_component: trend_velocity,
          saturation_component: 100 - saturation_level,
          demand_component: demand_signal,
        },
        recommendation:
          score >= 80
            ? "HIGHLY RECOMMENDED"
            : score >= 65
              ? "RECOMMENDED"
              : "MONITOR",
      };
    }

    case "generate_opportunity_report": {
      const { opportunities } = input;
      return {
        report_status: "Generated",
        total_opportunities: opportunities.length,
        report_format: "Executive summary with per-product detail",
        next_refresh: "24 hours",
      };
    }

    case "rank_opportunities": {
      return {
        ranking_method: "Multi-criteria decision analysis",
        top_opportunities: [
          { rank: 1, product: "AI-powered makeup mirrors", score: 87 },
          { rank: 2, product: "Mobile gaming controllers", score: 85 },
          { rank: 3, product: "Smart pet feeders", score: 81 },
          { rank: 4, product: "LED ring lights for content creators", score: 79 },
          { rank: 5, product: "Compact air fryers", score: 76 },
        ],
      };
    }

    case "save_run_report": {
      const timestamp = new Date().toISOString();
      const safeTs = timestamp.replace(/[:.]/g, "-").slice(0, 19);
      const outputDir = new URL("./output", import.meta.url).pathname;
      mkdirSync(outputDir, { recursive: true });
      const filename = `run_${safeTs}.json`;
      const data = { timestamp, ...input };
      writeFileSync(`${outputDir}/${filename}`, JSON.stringify(data, null, 2));
      console.log(`\n💾 Report saved → output/${filename}`);
      return { status: "saved", filename, opportunities_saved: input.opportunities?.length ?? 0 };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// =============================================================================
// AGENT ORCHESTRATOR  — correct agentic loop
// =============================================================================

async function runTrendsAgent() {
  const divider = "=".repeat(80);

  console.log("\n🚀 TRENDS AGENT STARTING...\n");
  console.log(googleTrends
    ? "✅  SearchAPI connected — trend detection will use live Google Trends data"
    : "⚠️   SEARCHAPI_KEY not set — using mock trend data");
  console.log(divider);
  console.log("MULTI-AGENT SYSTEM: Real-Time SE Asian Consumer Trend Analysis");
  console.log(divider + "\n");

  const systemPrompt = `You are a MULTI-AGENT SYSTEM for real-time consumer trend analysis in Southeast Asia.

Your objective: Identify the TOP 5 MOST LUCRATIVE product opportunities for import/resale in Southeast Asian markets over the next 60 days.

AGENTS YOU EMBODY:
1. Sentiment Analyzer — consumer buying sentiments from e-commerce and social media
2. Trend Detector — emerging products with >120% growth velocity
3. Market Evaluator — saturation (<40% target), competition, import viability
4. Intelligence Synthesizer — ranked recommendations with confidence scores

ANALYSIS FRAMEWORK (follow in order):
1. Use query_ecommerce_sentiment for the top 3 categories showing consumer interest
2. Use detect_trending_products to surface products with >120% growth
3. Use analyze_social_sentiment to validate engagement signals
4. Use identify_pattern_shifts to spot behavioural channel shifts
5. Use get_category_velocity for momentum confirmation
6. Use analyze_market_saturation for each shortlisted product
7. Use evaluate_import_viability for top candidates
8. Use calculate_opportunity_score to score each candidate
9. Use rank_opportunities then generate_opportunity_report for the narrative report
10. Call save_run_report as your LAST action — provide all 5 ranked opportunities in structured format so the dashboard can display them

TARGET COUNTRIES: Vietnam, Thailand, Indonesia, Philippines, Malaysia, Singapore
SCORING TARGETS: Sentiment >80 | Growth >100% | Saturation <35%

Deliver:
• Top 5 products with opportunity scores (0–100)
• Market insights per opportunity
• Actionable import/sourcing recommendations
• Key risks and mitigations`;

  const messages = [
    {
      role: "user",
      content:
        "Run a comprehensive SE Asian market trend analysis and deliver the top 5 product opportunities for import/resale.",
    },
  ];

  let round = 0;

  while (true) {
    round++;
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Always record the assistant turn first
    messages.push({ role: "assistant", content: response.content });

    // Print any text blocks
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        console.log(block.text);
      }
    }

    if (response.stop_reason !== "tool_use") {
      // Model finished — no more tool calls
      break;
    }

    // Collect and execute ALL tool calls from this response in one batch
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      console.log(`\n📊 [${block.name}]`);
      console.log("   Input:", JSON.stringify(block.input, null, 4).replace(/\n/g, "\n   "));

      const result = await executeTool(block.name, block.input);
      console.log("   Result:", JSON.stringify(result, null, 4).replace(/\n/g, "\n   "), "\n");

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    // Return all results in a single user message
    messages.push({ role: "user", content: toolResults });
  }

  console.log("\n" + divider);
  console.log("✅  ANALYSIS COMPLETE");
  console.log(divider + "\n");
}

runTrendsAgent().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
