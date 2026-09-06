/**
 * Drive the real pad in system Chrome: Python Test must pass a correct
 * Two Sum and fail a wrong one.
 */
import puppeteer from "puppeteer-core";

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE_URL || "http://localhost:3002";

const GOOD = `from typing import List

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []
`;

const BAD = `from typing import List

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        return [0, 1]
`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});

async function setEditor(page, code) {
  await page.waitForFunction(
    () => window.monaco?.editor?.getEditors?.()?.length > 0,
  );
  await page.evaluate((src) => {
    for (const editor of window.monaco.editor.getEditors()) {
      editor.getModel()?.setValue(src);
    }
  }, code);
}

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some((b) =>
        (b.textContent || "").includes("Try Two Sum"),
      ),
  );
  const buttons = await page.$$("button");
  let clicked = false;
  for (const b of buttons) {
    const t = await page.evaluate((el) => el.textContent || "", b);
    if (t.includes("Try Two Sum")) {
      await b.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    console.error("Try Two Sum button not found");
    process.exit(1);
  }
  try {
    await page.waitForFunction(() => location.pathname.startsWith("/pad/"), {
      timeout: 15_000,
    });
  } catch {
    const now = await page.evaluate(
      () => location.href + "\n" + document.body.innerText.slice(0, 800),
    );
    console.error("did not reach /pad/. page:\n" + now);
    process.exit(1);
  }
  console.log("on pad", await page.evaluate(() => location.pathname));
  await page.select("select", "python");
  await page.waitForFunction(() => {
    const editors = window.monaco?.editor?.getEditors?.() || [];
    return editors.some((e) => (e.getValue?.() || "").includes("class Solution"));
  });
  await setEditor(page, GOOD);
  await page.waitForFunction(() => {
    const editors = window.monaco?.editor?.getEditors?.() || [];
    return editors.some((e) => (e.getValue?.() || "").includes("seen = {}"));
  });
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll("button")) {
      if ((btn.textContent || "").trim() === "Test" && !btn.disabled) btn.click();
    }
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => document.body.innerText);
    if (
      text.includes("passed") ||
      text.includes("Could not load") ||
      text.includes("failed") ||
      text.includes("CONSOLE")
    ) {
      // Keep waiting until a result line exists, not just the CONSOLE header.
      if (
        text.includes("Case 1 passed") ||
        text.includes("Could not load") ||
        text.includes("timed out")
      ) {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const afterGood = await page.evaluate(() => document.body.innerText);
  const goodOk =
    afterGood.includes("Case 1 passed") &&
    afterGood.includes("Case 2 passed") &&
    afterGood.includes("Case 3 passed") &&
    !afterGood.includes("failed") &&
    !afterGood.includes("Could not load the Python runtime");
  console.log("--- after correct solution ---");
  console.log(
    afterGood
      .split("\n")
      .filter((l) => /passed|failed|CONSOLE|Python|runtime|Case|Error|Indentation|Traceback/.test(l))
      .slice(0, 40)
      .join("\n"),
  );
  const debug = await page.evaluate(() => {
    const editors = window.monaco?.editor?.getEditors?.() || [];
    const values = editors.map((e) => (e.getValue?.() || "").slice(0, 200));
    const raw = localStorage.getItem("idecoder.sessions.v1");
    return { values, raw: raw ? raw.slice(0, 500) : null };
  });
  console.log("editor heads:", JSON.stringify(debug.values));
  console.log("storage head:", debug.raw);

  await setEditor(page, BAD);
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll("button")) {
      if ((btn.textContent || "").trim() === "Test" && !btn.disabled) btn.click();
    }
  });
  await page.waitForFunction(
    () => /failed|0\/\d+ passed/.test(document.body.innerText),
    { timeout: 60_000 },
  );
  const afterBad = await page.evaluate(() => document.body.innerText);
  const badOk = afterBad.includes("failed");
  console.log("--- after wrong solution ---");
  console.log(
    afterBad
      .split("\n")
      .filter((l) => /passed|failed|CONSOLE|Python|runtime|Case/.test(l))
      .slice(0, 30)
      .join("\n"),
  );

  if (!goodOk) {
    console.error("FAIL: correct Python solution did not pass");
    process.exit(1);
  }
  if (!badOk) {
    console.error("FAIL: wrong Python solution did not fail");
    process.exit(1);
  }
  console.log("\nPAD PYTHON TEST: pass on correct, fail on wrong.");
} finally {
  await browser.close();
}
