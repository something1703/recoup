// Same repro against the unminified vite dev server, capturing full stacks.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push(String(err.stack ?? err.message)));
const debugLogs = [];
page.on("console", (msg) => { const t = msg.text(); if (t.includes("TAP-LOOP-DEBUG")) debugLogs.push(t); });

await page.goto("http://localhost:5173", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);

const textarea = page.locator("textarea").first();
console.log("composer textarea found:", (await textarea.count()) > 0);
await textarea.click();
await page.keyboard.type("hi", { delay: 60 });
await page.waitForTimeout(2000);

console.log("pageerrors:", errors.length);
// Print the FIRST full stack — that's the original loop, before cascading repeats.
if (errors.length > 0) console.log(errors[0].slice(0, 1500));
console.log("=== TAP-LOOP-DEBUG lines ===");
for (const l of debugLogs.slice(0, 6)) console.log(l.slice(0, 700));
await browser.close();
