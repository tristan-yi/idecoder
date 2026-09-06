/**
 * Drive system Chrome against the diagnostic page so we wait for real
 * network, unlike --virtual-time-budget which can abort importScripts.
 */
import puppeteer from "puppeteer-core";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.env.DIAG_URL || "http://localhost:3002/pyodide-diag.html";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("DIAGNOSTIC COMPLETE"),
      { timeout: 180_000 },
    );
  } catch (err) {
    console.error("wait ended:", err instanceof Error ? err.message : err);
  }
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text);
  process.exit(text.includes("SMOKE_OK") ? 0 : 1);
} finally {
  await browser.close();
}
