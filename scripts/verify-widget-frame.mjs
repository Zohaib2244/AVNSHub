// Renders the widget in app/dev/widget-frame/target.ts at each requested box
// and reports content that doesn't fit. Driven by lib/widget-creator/
// verifyWidget.ts, which runs it as its own process so Chromium never lives in
// the Next server. Playwright isn't a project dependency: the caller passes the
// path of an install it found (see findPlaywright there).
//
// stdin: { playwright, baseUrl, slug, outDir, shots: [{ label, preset, w, h }] }
// stdout: { results: [{ label, preset, w, h, problems: string[], screenshot? }] }

import { pathToFileURL } from "node:url";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const job = JSON.parse(Buffer.concat(chunks).toString("utf8"));

const { chromium } = await import(pathToFileURL(job.playwright).href);

// Runs in the page. A problem is something the user can't see or reach:
// text or a control extending past the card, or text cut inside its own box.
// Scroll containers are allowed to hold more than fits (only the container
// itself has to fit), decorative aria-hidden content is ignored, and
// ellipsis truncation counts as deliberate.
function findProblems() {
  const cell = document.querySelector(".slot-cell");
  if (!cell) return ["the frame rendered no cell"];
  const card = cell.querySelector(".block") ?? cell.querySelector(".capsule") ?? cell;
  const box = card.getBoundingClientRect();
  const TOL = 1;
  const problems = [];
  const flagged = [];

  const scrollerOf = (el) => {
    for (let p = el.parentElement; p && p !== card; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) return p;
    }
    return null;
  };
  const isScroller = (el) => {
    const cs = getComputedStyle(el);
    return /(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX);
  };
  const ownText = (el) =>
    [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
  const isControl = (el) => /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName);
  const fullyOutside = (r) =>
    r.top >= box.bottom - TOL || r.bottom <= box.top + TOL || r.left >= box.right - TOL || r.right <= box.left + TOL;
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) s += "." + cls.join(".");
    const text = (el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return text ? `${s} "${text}"` : s;
  };
  // the extent of what's actually drawn: the text itself for text elements
  // (text can spill past a fixed-width box that doesn't clip), else the box
  const extent = (el, texts) => {
    if (!texts.length) return el.getBoundingClientRect();
    const range = document.createRange();
    let r = null;
    for (const t of texts) {
      range.selectNodeContents(t);
      const tr = range.getBoundingClientRect();
      if (!tr.width && !tr.height) continue;
      r = r
        ? { left: Math.min(r.left, tr.left), top: Math.min(r.top, tr.top), right: Math.max(r.right, tr.right), bottom: Math.max(r.bottom, tr.bottom) }
        : { left: tr.left, top: tr.top, right: tr.right, bottom: tr.bottom };
    }
    return r ?? el.getBoundingClientRect();
  };

  for (const el of card.querySelectorAll("*")) {
    const texts = ownText(el);
    const scroller = isScroller(el);
    if (!texts.length && !isControl(el) && !scroller) continue;
    if (el.closest("[aria-hidden='true']")) continue;
    if (scrollerOf(el)) continue;
    if (flagged.some((f) => f.contains(el))) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const own = el.getBoundingClientRect();
    if (!own.width && !own.height) continue;

    const r = extent(el, texts);
    const over = {
      right: r.right - box.right,
      bottom: r.bottom - box.bottom,
      left: box.left - r.left,
      top: box.top - r.top,
    };
    const worst = Object.entries(over).filter(([, v]) => v > TOL).sort((a, b) => b[1] - a[1])[0];
    if (worst) {
      // report a wholly hidden block (a list row pushed below the card) once,
      // as its outermost fully-outside container, not once per text inside it
      let top = el;
      while (top.parentElement && top.parentElement !== card && fullyOutside(top.parentElement.getBoundingClientRect())) {
        top = top.parentElement;
      }
      const hidden = fullyOutside(top.getBoundingClientRect());
      problems.push(hidden
        ? `${describe(top)} is entirely outside the card (${worst[0]} edge) — not visible at all`
        : `${describe(el)} sticks out ${Math.round(worst[1])}px past the card's ${worst[0]} edge`);
      flagged.push(top);
      continue;
    }
    // text cut inside its own box (overflow hidden, no ellipsis)
    if (texts.length && cs.textOverflow !== "ellipsis") {
      const cutX = cs.overflowX !== "visible" && el.scrollWidth > el.clientWidth + TOL;
      const cutY = cs.overflowY !== "visible" && el.scrollHeight > el.clientHeight + TOL;
      if (cutX || cutY) {
        problems.push(`${describe(el)} is cut off inside its own box (${cutX ? "width" : "height"})`);
        flagged.push(el);
      }
    }
  }
  if (card.querySelector("[style*='status-down']") && /render error/i.test(card.textContent || "")) {
    problems.unshift("the widget crashed while rendering (error boundary shown)");
  }
  return problems;
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  // the frame must never change the hub's state
  await context.route("**/api/**", (route) => (route.request().method() === "GET" ? route.continue() : route.abort()));
  const page = await context.newPage();
  let errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${String(e.message ?? e).slice(0, 300)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && /\[widget:|render error/i.test(m.text())) errors.push(m.text().slice(0, 300));
  });

  for (const shot of job.shots) {
    errors = [];
    const url = `${job.baseUrl}/dev/widget-frame?preset=${shot.preset}&w=${shot.w}&h=${shot.h}`;
    // a just-rewritten target can take a moment to compile; the ready marker
    // carries the slug so a stale build of the page is never measured
    let ready = false;
    for (let attempt = 0; attempt < 4 && !ready; attempt++) {
      await page.goto(url, { waitUntil: "load", timeout: 90_000 }).catch(() => {});
      ready = await page
        .waitForSelector(`[data-verify-ready="${job.slug}"]`, { timeout: 20_000 })
        .then(() => true, () => false);
      if (!ready) await page.waitForTimeout(1500);
    }
    if (!ready) {
      results.push({ ...shot, problems: ["the verify frame never rendered this widget", ...errors] });
      continue;
    }
    const problems = [...errors, ...(await page.evaluate(findProblems))];
    const screenshot = `${job.outDir}/${job.slug}-${shot.label}.png`;
    await page.locator(".slot-cell").screenshot({ path: screenshot }).catch(() => {});
    results.push({ ...shot, problems, screenshot });
  }
} finally {
  await browser.close();
}
process.stdout.write(JSON.stringify({ results }));
