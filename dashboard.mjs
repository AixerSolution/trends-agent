#!/usr/bin/env node

import { createServer } from "http";
import { readFileSync, readdirSync, existsSync } from "fs";

const PORT = process.env.PORT || 3333;
const OUTPUT_DIR = new URL("./output", import.meta.url).pathname;
const HTML_FILE = new URL("./dashboard.html", import.meta.url).pathname;

function getRuns() {
  if (!existsSync(OUTPUT_DIR)) return [];
  return readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => {
      try {
        const data = JSON.parse(readFileSync(`${OUTPUT_DIR}/${f}`, "utf8"));
        return {
          id: f.replace(".json", ""),
          timestamp: data.timestamp,
          opportunity_count: data.opportunities?.length ?? 0,
          top_product: data.opportunities?.[0]?.product ?? "—",
          top_score: data.opportunities?.[0]?.opportunity_score ?? 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(readFileSync(HTML_FILE, "utf8"));
    } catch {
      res.writeHead(500);
      res.end("dashboard.html not found");
    }
    return;
  }

  if (url.pathname === "/api/runs") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(getRuns()));
    return;
  }

  const runMatch = url.pathname.match(/^\/api\/runs\/(.+)$/);
  if (runMatch) {
    const filepath = `${OUTPUT_DIR}/${runMatch[1]}.json`;
    if (!existsSync(filepath)) {
      res.writeHead(404);
      res.end("Run not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(readFileSync(filepath, "utf8"));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n📊 Trends Agent Dashboard running`);
  console.log(`   → http://localhost:${PORT}\n`);
  console.log(`   Run 'node trends_agent.mjs' to generate a report, then refresh the dashboard.\n`);
});
