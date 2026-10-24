#!/usr/bin/env node
/**
 * Turns docs/user-guides/*.md into polished, printable PDFs with the screenshots embedded.
 *   node scripts/guide-pdfs.mjs
 * Output: docs/user-guides/pdf/<role>.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = path.join(__dirname, "..", "docs", "user-guides");
const OUT_DIR = path.join(GUIDES_DIR, "pdf");
fs.mkdirSync(OUT_DIR, { recursive: true });

const DOCS = [
  { file: "owner.md", title: "Owner Guide" },
  { file: "admin.md", title: "Admin Guide" },
  { file: "sales-manager.md", title: "Sales Manager Guide" },
  { file: "telecaller.md", title: "Tele-caller Guide" },
  { file: "field-sales.md", title: "Field Sales Guide" },
  { file: "installer.md", title: "Installer Guide" },
];

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

const renderer = {
  heading({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const plain = tokens.map((t) => ("text" in t ? t.text : "")).join("");
    const id = slugify(plain);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  },
  image({ href, title, text }) {
    // Left as the original relative path — the temp HTML file this gets written into lives
    // in GUIDES_DIR too, so "screenshots/owner/01-dashboard.png" resolves on its own. Chromium
    // refuses to load file:// subresources from a page.setContent() document (null origin),
    // so we can't use absolute file:// URLs there either way — see buildOne().
    const cap = text ? `<figcaption>${text}</figcaption>` : "";
    return `<figure><img src="${href}" alt="${text ?? ""}" title="${title ?? ""}" loading="eager" />${cap}</figure>`;
  },
};
marked.use({ renderer });

function rewriteCrossDocLinks(html, selfFile) {
  // Links like "owner.md#dashboard" only make sense inside the website docs. In a standalone
  // PDF they should point at the sibling PDF instead (dropping the fragment, since separate
  // PDF files don't share named destinations).
  return html.replace(/href="([a-z-]+)\.md(#[-\w]*)?"/g, (m, base) => (base === selfFile.replace(".md", "") ? m : `href="${base}.pdf"`));
}

function wrapHtml({ title, bodyHtml, role }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  :root {
    --ink: #0f172a;
    --slate: #334155;
    --muted: #64748b;
    --line: #e2e8f0;
    --sun: #f59e0b;
    --sun-dark: #b45309;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: var(--slate);
    font-size: 11.5px;
    line-height: 1.55;
    margin: 0;
    padding: 0 6px;
  }
  .cover {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 20px 22px;
    margin: 0 0 22px 0;
    border-radius: 14px;
    background: linear-gradient(135deg, #fff7ed 0%, #fff 60%);
    border: 1px solid #fde8c8;
  }
  .cover .eyebrow {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sun-dark);
  }
  .cover h1 {
    margin: 2px 0 0 0;
    font-size: 24px;
    font-weight: 800;
    color: var(--ink);
    border: none;
    padding: 0;
  }
  .cover .role {
    margin-top: 2px;
    font-size: 12.5px;
    color: var(--muted);
  }
  h1 { display: none; } /* the markdown's own "# Title" is replaced by the cover block above */
  h2 {
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
    margin: 26px 0 8px 0;
    padding-top: 6px;
    border-top: 2px solid var(--line);
    page-break-after: avoid;
  }
  h2:first-of-type { border-top: none; margin-top: 4px; }
  h3 {
    font-size: 13px;
    font-weight: 700;
    color: var(--sun-dark);
    margin: 16px 0 6px 0;
    page-break-after: avoid;
  }
  p { margin: 7px 0; }
  ul, ol { margin: 7px 0; padding-left: 20px; }
  li { margin: 3px 0; }
  a { color: #c2410c; text-decoration: none; }
  strong { color: var(--ink); font-weight: 700; }
  hr { display: none; }
  figure {
    margin: 10px 0 16px 0;
    page-break-inside: avoid;
    text-align: center;
  }
  figure img {
    max-width: 560px;
    width: 100%;
    border-radius: 8px;
    border: 1px solid var(--line);
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
  }
  figcaption {
    margin-top: 5px;
    font-size: 10px;
    color: var(--muted);
    font-style: italic;
  }
  nav.toc {
    page-break-after: always;
  }
  nav.toc h2 { border-top: none; margin-top: 0; }
  nav.toc ol { padding-left: 18px; }
  nav.toc a { color: var(--slate); }
  section.body > p:first-of-type {
    font-size: 12.5px;
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="eyebrow">Zeedra Solar CRM &middot; User Guide</div>
    <h1>${title}</h1>
    <div class="role">Signed in as: ${role}</div>
  </div>
  <section class="body">
  ${bodyHtml}
  </section>
</body>
</html>`;
}

function splitOutContentsAsToc(html) {
  // The "## Contents" section becomes its own TOC page (nicer than inline numbered links mid-flow).
  const m = html.match(/<h2 id="contents">Contents<\/h2>([\s\S]*?)(?=<h2 )/);
  if (!m) return html;
  const tocBody = m[0];
  const rest = html.replace(tocBody, "");
  return `<nav class="toc">${tocBody}</nav>${rest}`;
}

async function buildOne(browser, { file, title }) {
  const role = title.replace(" Guide", "");
  const md = fs.readFileSync(path.join(GUIDES_DIR, file), "utf8");
  let bodyHtml = marked.parse(md);
  bodyHtml = rewriteCrossDocLinks(bodyHtml, file);
  bodyHtml = splitOutContentsAsToc(bodyHtml);
  const html = wrapHtml({ title, bodyHtml, role });

  // Written next to the markdown (not into a subfolder) so the images' relative paths resolve,
  // and loaded via file:// navigation rather than page.setContent() — Chromium refuses file://
  // subresources on a setContent() page since its document origin is null/about:blank.
  const tmp = path.join(GUIDES_DIR, `._tmp-${file.replace(".md", ".html")}`);
  fs.writeFileSync(tmp, html, "utf8");

  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : new Promise((res) => (img.onload = img.onerror = res)))),
      );
    });
    const out = path.join(OUT_DIR, file.replace(".md", ".pdf"));
    await buildPdf(page, out, role);
  } finally {
    await page.close();
    fs.rmSync(tmp, { force: true });
  }
}

async function buildPdf(page, out, role) {
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 14mm;font-family:Segoe UI,Arial,sans-serif;">Zeedra Solar CRM &middot; ${role} Guide</div>`,
    footerTemplate: `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 14mm;display:flex;justify-content:flex-end;font-family:Segoe UI,Arial,sans-serif;"><span class="pageNumber"></span>&nbsp;/&nbsp;<span class="totalPages"></span></div>`,
  });
  console.log(`  ✓ ${path.relative(process.cwd(), out)}`);
}

async function main() {
  console.log(`Building PDFs from ${path.relative(process.cwd(), GUIDES_DIR)} → ${path.relative(process.cwd(), OUT_DIR)}`);
  const browser = await chromium.launch();
  try {
    for (const doc of DOCS) await buildOne(browser, doc);
  } finally {
    await browser.close();
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
