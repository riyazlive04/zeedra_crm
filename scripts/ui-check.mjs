#!/usr/bin/env node
/**
 * Browser-level UI check: logs in through the real login form, visits every page on desktop and
 * mobile viewports, fails on console errors / uncaught exceptions / hydration mismatches,
 * and saves screenshots.   BASE_URL=http://localhost:3000 SHOTS=./screenshots node scripts/ui-check.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

const PLAN = [
  {
    user: "owner@zeedra.demo",
    viewport: { width: 1440, height: 900 },
    tag: "desktop",
    pages: ["/dashboard", "/leads", "/leads/new", "/pipeline", "/appointments", "/whatsapp", "/quotations", "/tracking", "/projects", "/automations", "/calculator", "/settings?tab=pricing", "/settings?tab=integrations", "/tasks"],
  },
  { user: "field@zeedra.demo", viewport: { width: 390, height: 844 }, tag: "mobile", pages: ["/field", "/leads", "/dashboard"] },
];

let failures = 0;
const browser = await chromium.launch();
try {
  for (const plan of PLAN) {
    const ctx = await browser.newContext({ viewport: plan.viewport, geolocation: { latitude: 13.0418, longitude: 80.2341, accuracy: 15 }, permissions: ["geolocation"] });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => {
      const t = m.text();
      // Map tiles may fail offline; that's not an app error.
      if (m.type() === "error" && !/tile\.openstreetmap|ERR_INTERNET_DISCONNECTED|favicon/i.test(t)) errors.push(t);
      if (/hydration|did not match/i.test(t)) errors.push(`HYDRATION: ${t}`);
    });
    page.on("pageerror", (e) => errors.push(`PAGEERROR @ ${new URL(page.url()).pathname}: ${e.message.slice(0, 160)}`));

    await page.goto(`${BASE}/login`);
    await page.screenshot({ path: path.join(SHOTS, `${plan.tag}-login.png`) });
    await page.fill('input[type="email"]', plan.user);
    await page.fill('input[type="password"]', "Demo@12345");
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button:has-text("Sign in")')]);
    console.log(`\n${plan.tag} · ${plan.user} → landed on ${new URL(page.url()).pathname}`);

    for (const p of plan.pages) {
      errors.length = 0;
      const res = await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(600);
      const file = `${plan.tag}-${p.replace(/[/?=&]+/g, "_").replace(/^_/, "") || "root"}.png`;
      await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const ok = res?.status() === 200 && errors.length === 0 && overflow <= 1;
      if (!ok) failures++;
      console.log(`  ${ok ? "✓" : "✗"} ${p} [${res?.status()}]${overflow > 1 ? ` horizontal overflow ${overflow}px` : ""}${errors.length ? `\n      ${errors.slice(0, 3).join("\n      ")}` : ""}`);
    }

    if (plan.tag === "desktop") {
      // Interaction: open the first lead, run the AI co-pilot (rule mode works offline), open booking modal.
      await page.goto(`${BASE}/leads?sort=score`, { waitUntil: "networkidle" });
      await page.click("tbody tr:first-child a");
      await page.waitForURL(/\/leads\/[^/]+$/);
      await page.click('button:has-text("Analyse")');
      await page.waitForSelector("text=Next best action", { timeout: 60000 });
      await page.screenshot({ path: path.join(SHOTS, "desktop-lead-detail.png"), fullPage: true });
      await page.click('button:has-text("Book visit")');
      await page.waitForSelector("text=Available slots");
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SHOTS, "desktop-book-modal.png") });
      console.log("  ✓ lead detail → AI co-pilot → booking modal");
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${failures ? `❌ ${failures} page(s) with problems` : "✅ All pages clean"} — screenshots in ${SHOTS}`);
process.exit(failures ? 1 : 0);
