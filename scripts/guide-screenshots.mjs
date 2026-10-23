#!/usr/bin/env node
/**
 * Captures the screenshots used in docs/user-guides/*.md — one folder per role.
 * Needs a running dev/prod server with the demo seed loaded.
 *   BASE_URL=http://localhost:3100 node scripts/guide-screenshots.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "docs/user-guides/screenshots";
const PW = "Demo@12345";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const GEO = { latitude: 13.0418, longitude: 80.2341, accuracy: 15 };

function dir(name) {
  const p = path.join(OUT, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

async function shot(page, folder, file, opts = {}) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(folder, file), fullPage: opts.fullPage ?? true });
  console.log(`  📸 ${file}`);
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button:has-text("Sign in")')]);
}

async function go(page, pathname) {
  await page.goto(`${BASE}${pathname}`, { waitUntil: "networkidle", timeout: 60000 });
}

async function captureLoginAndMarketing(browser) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const folder = dir("common");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await shot(page, folder, "login.png", { fullPage: false });
  await ctx.close();
}

/** Full desktop walkthrough — used for Owner. Admin reuses these images (identical UI) in its doc. */
async function captureOwner(browser) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const folder = dir("owner");
  await login(page, "owner@zeedra.demo");

  await go(page, "/dashboard");
  await shot(page, folder, "01-dashboard.png");

  await go(page, "/leads");
  await shot(page, folder, "02-leads-list.png");

  await go(page, "/leads/new");
  await shot(page, folder, "03-new-lead.png");

  await go(page, "/leads?sort=score");
  await page.click("tbody tr:first-child a");
  await page.waitForURL(/\/leads\/[^/]+$/);
  await shot(page, folder, "04-lead-detail.png");

  try {
    await page.click('button:has-text("Analyse")');
    await page.waitForSelector("text=Next best action", { timeout: 60000 });
    await shot(page, folder, "05-ai-copilot.png");
  } catch {
    console.log("  (skipped AI co-pilot shot — no response in time)");
  }

  try {
    await page.click('button:has-text("Book visit")');
    await page.waitForSelector("text=Available slots");
    await page.waitForTimeout(600);
    await shot(page, folder, "06-book-visit.png", { fullPage: false });
    await page.keyboard.press("Escape");
  } catch {
    console.log("  (skipped booking modal shot)");
  }

  await go(page, "/pipeline");
  await shot(page, folder, "07-pipeline.png");

  await go(page, "/appointments");
  await shot(page, folder, "08-appointments.png");

  await go(page, "/tasks");
  await shot(page, folder, "09-tasks.png");

  await go(page, "/whatsapp");
  await shot(page, folder, "10-whatsapp.png");

  await go(page, "/field");
  await shot(page, folder, "11-field-app.png");

  await go(page, "/quotations");
  await shot(page, folder, "12-quotations-list.png");

  try {
    await page.click("tbody tr:first-child a");
    await page.waitForURL(/\/quotations\/[^/]+$/);
    await shot(page, folder, "13-quotation-detail.png");
  } catch {
    console.log("  (skipped quotation detail shot)");
  }

  await go(page, "/tracking");
  await shot(page, folder, "14-field-tracking.png");

  await go(page, "/projects");
  await shot(page, folder, "15-installations-board.png");
  try {
    await page.click("button.card >> nth=0");
    await page.waitForSelector("text=Execution stages", { timeout: 10000 });
    await shot(page, folder, "16-installation-detail.png", { fullPage: false });
    await page.keyboard.press("Escape");
  } catch {
    console.log("  (skipped installation detail shot)");
  }

  await go(page, "/automations");
  await shot(page, folder, "17-automations.png");

  await go(page, "/calculator");
  await shot(page, folder, "18-calculator.png");

  for (const [tab, file] of [
    ["company", "19-settings-company.png"],
    ["pricing", "20-settings-pricing.png"],
    ["team", "21-settings-team.png"],
    ["templates", "22-settings-templates.png"],
    ["integrations", "23-settings-integrations.png"],
    ["billing", "24-settings-billing.png"],
  ]) {
    await go(page, `/settings?tab=${tab}`);
    await shot(page, folder, file);
  }

  await ctx.close();
}

/** Admin is identical to Owner except it has no Billing tab — capture just the differences. */
async function captureAdmin(browser) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const folder = dir("admin");
  await login(page, "admin@zeedra.demo");

  await go(page, "/dashboard");
  await shot(page, folder, "01-dashboard.png");

  await go(page, "/settings?tab=team");
  await shot(page, folder, "02-settings-team.png");

  await ctx.close();
}

async function captureSalesManager(browser) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const folder = dir("sales-manager");
  await login(page, "manager@zeedra.demo");

  await go(page, "/dashboard");
  await shot(page, folder, "01-dashboard.png");

  await go(page, "/leads");
  await shot(page, folder, "02-leads-list.png");

  await go(page, "/leads?sort=score");
  await page.click("tbody tr:first-child a");
  await page.waitForURL(/\/leads\/[^/]+$/);
  await shot(page, folder, "03-lead-detail.png");

  await go(page, "/pipeline");
  await shot(page, folder, "04-pipeline.png");

  await go(page, "/appointments");
  await shot(page, folder, "05-appointments.png");

  await go(page, "/tasks?team=1");
  await shot(page, folder, "06-team-tasks.png");

  await go(page, "/whatsapp");
  await shot(page, folder, "07-whatsapp.png");

  await go(page, "/quotations");
  await shot(page, folder, "08-quotations-list.png");

  await go(page, "/tracking");
  await shot(page, folder, "09-field-tracking.png");

  await go(page, "/projects");
  await shot(page, folder, "10-installations-board.png");

  await go(page, "/automations");
  await shot(page, folder, "11-automations.png");

  await go(page, "/calculator");
  await shot(page, folder, "12-calculator.png");

  await go(page, "/settings?tab=profile");
  await shot(page, folder, "13-my-profile.png");

  await ctx.close();
}

async function captureTelecaller(browser) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const folder = dir("telecaller");
  await login(page, "telecaller@zeedra.demo");

  await go(page, "/dashboard");
  await shot(page, folder, "01-dashboard.png");

  await go(page, "/leads");
  await shot(page, folder, "02-leads-list.png");

  await go(page, "/leads/new");
  await shot(page, folder, "03-new-lead.png");

  await go(page, "/leads?sort=score");
  await page.click("tbody tr:first-child a");
  await page.waitForURL(/\/leads\/[^/]+$/);
  await shot(page, folder, "04-lead-detail.png");

  try {
    await page.click('button:has-text("Book visit")');
    await page.waitForSelector("text=Available slots");
    await page.waitForTimeout(600);
    await shot(page, folder, "05-book-visit.png", { fullPage: false });
    await page.keyboard.press("Escape");
  } catch {
    console.log("  (skipped booking modal shot)");
  }

  await go(page, "/pipeline");
  await shot(page, folder, "06-pipeline.png");

  await go(page, "/appointments");
  await shot(page, folder, "07-appointments.png");

  await go(page, "/tasks");
  await shot(page, folder, "08-tasks.png");

  await go(page, "/whatsapp");
  await shot(page, folder, "09-whatsapp.png");

  await go(page, "/calculator");
  await shot(page, folder, "10-calculator.png");

  await ctx.close();
}

async function captureFieldSales(browser) {
  const ctx = await browser.newContext({ viewport: MOBILE, geolocation: GEO, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const folder = dir("field-sales");
  await login(page, "field@zeedra.demo");

  await go(page, "/field");
  await shot(page, folder, "01-field-app-home.png");

  try {
    if ((await page.locator('a:has-text("Quote")').count()) === 0) {
      await page.locator('button:has-text("Check in")').first().click();
      await page.waitForTimeout(2000);
    }
    await page.locator('a:has-text("Quote")').first().click();
    await page.waitForURL(/\/field\/quote\//);
    await shot(page, folder, "02-field-quote-builder.png");
  } catch {
    console.log("  (skipped field quote builder shot — no appointment with a Quote action today)");
  }

  await go(page, "/leads");
  await shot(page, folder, "03-my-leads.png");

  await go(page, "/leads?sort=score");
  try {
    await page.locator("tbody tr:first-child a, ul > li a").first().click();
    await page.waitForURL(/\/leads\/[^/]+$/);
    await shot(page, folder, "04-lead-detail.png");
  } catch {
    console.log("  (skipped lead detail mobile shot)");
  }

  await go(page, "/appointments");
  await shot(page, folder, "05-appointments.png");

  await go(page, "/tasks");
  await shot(page, folder, "06-tasks.png");

  await go(page, "/whatsapp");
  await shot(page, folder, "07-whatsapp.png");

  await go(page, "/quotations");
  await shot(page, folder, "08-quotations-list.png");

  await go(page, "/calculator");
  await shot(page, folder, "09-calculator.png");

  await ctx.close();
}

async function captureInstaller(browser) {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  const folder = dir("installer");
  await login(page, "installer@zeedra.demo");

  await go(page, "/projects");
  await shot(page, folder, "01-installations-board.png");

  try {
    await page.click("button.card >> nth=0");
    await page.waitForSelector("text=Execution stages", { timeout: 10000 });
    await shot(page, folder, "02-installation-detail.png", { fullPage: false });
    await page.keyboard.press("Escape");
  } catch {
    console.log("  (skipped installation detail shot)");
  }

  await ctx.close();
}

async function main() {
  console.log(`Guide screenshots → ${BASE}, saving to ${OUT}`);
  const browser = await chromium.launch();
  try {
    await captureLoginAndMarketing(browser);

    console.log("\n▸ Owner");
    await captureOwner(browser);
    console.log("\n▸ Admin");
    await captureAdmin(browser);
    console.log("\n▸ Sales Manager");
    await captureSalesManager(browser);
    console.log("\n▸ Tele-caller");
    await captureTelecaller(browser);
    console.log("\n▸ Field Sales");
    await captureFieldSales(browser);
    console.log("\n▸ Installer");
    await captureInstaller(browser);
  } finally {
    await browser.close();
  }
  console.log("\n✅ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
