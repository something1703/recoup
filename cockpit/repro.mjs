// Local reproduction of the composer crash: serve dist via server.mjs (real
// proxy to trueforge), open in headless Chromium, type into the composer,
// and report every console error. Run: node repro.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:8899";
const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text().slice(0, 300));
});
page.on("pageerror", (err) => errors.push("PAGEERROR: " + String(err.message).slice(0, 300)));

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const textarea = page.locator("textarea").first();
const found = (await textarea.count()) > 0;
console.log("composer textarea found:", found);

if (found) {
  await textarea.click();
  await page.keyboard.type("hello from repro", { delay: 40 });
  await page.waitForTimeout(1500);
  const value = await textarea.inputValue().catch(() => "<unreadable>");
  console.log("composer value after typing:", JSON.stringify(value));
}

await page.screenshot({ path: "repro.png", fullPage: false });
console.log("console errors:", errors.length);
for (const e of errors.slice(0, 8)) console.log("  -", e);
await browser.close();
process.exit(errors.some((e) => e.includes("Maximum update depth")) ? 2 : 0);
