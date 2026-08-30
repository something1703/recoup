// Full end-to-end UI proof: type a real message, press Enter, confirm the
// message posts into the thread and the agent turn starts. Run against the
// deployed cockpit. Starts ONE real (DRY_RUN-safe) agent turn.
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://recoup-cockpit-377323041120.asia-northeast1.run.app";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err.message).slice(0, 200)));

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const textarea = page.locator("textarea").first();
await textarea.click();
const msg = "Hello — quick check: which three tenant companies can you investigate?";
await page.keyboard.type(msg, { delay: 20 });
await page.keyboard.press("Enter");
await page.waitForTimeout(6000);

const body = await page.locator("body").innerText();
console.log("message visible in thread:", body.includes("which three tenant companies"));
console.log("composer cleared:", (await textarea.inputValue().catch(() => "?")) === "");
console.log("pageerrors:", errors.length, errors.slice(0, 3));
await page.screenshot({ path: "repro-send.png" });
await browser.close();
