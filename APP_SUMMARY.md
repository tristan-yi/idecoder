# idecoder — what this app does

idecoder is a personal coding practice site with two separate drills:

1. **Practice pads** — paste a question and get a **LeetCode-style problem on the left** and a **CoderPad-style editor on the right**.
2. **AI-assisted review practice** — drop into an unfamiliar full-stack codebase with a vague bug report and an AI assistant that is confidently wrong some of the time. Scored on what you catch.

Live site: [https://idecoder.vercel.app](https://idecoder.vercel.app)

---

## Home page

- Paste any interview prompt, LeetCode-style statement, or short idea.
- Click **Create pad**. An LLM rewrites it into a structured problem:
  - title and Easy / Medium / Hard
  - topic tags (Array, Hash Table, and so on)
  - description in LeetCode tone
  - examples with input, output, and explanations
  - constraints
  - follow-up questions
  - empty starter code
  - example tests and hidden tests
- Built-in samples (no generation needed): **Two Sum**, **Valid Parentheses**, **Best Time to Buy and Sell Stock**.
- **Recent pads** lists pads from this browser. You can reopen or delete them.

---

## The pad (practice IDE)

A full-screen split layout:

| Left | Right |
| --- | --- |
| Problem statement, examples, constraints, follow-ups | Monaco code editor on top, console on the bottom |

You can drag the splitters to resize the panes. On a narrow screen, switch between **Problem** and **Code**.

### Buttons

- **Similar question** — generates a *new* related problem (same skills/topics, different story) and opens it as a new pad so the current one is kept.
- **Language** — JavaScript, TypeScript, Python. Java and C++ are editor-only (see below).
- **Run** — executes your file and shows stdout/stderr (CoderPad-style).
- **Test** — runs the visible example cases and shows pass/fail per case. Shortcut: Cmd/Ctrl+Enter.
- **Submit** — runs example tests plus hidden tests.
- **Settings** — optional LLM provider, API key, and model if you are not using the server key.

**Run**, **Test** and **Submit** all work for **JavaScript, TypeScript and Python**.

---

## How code is run

Everything executes in your browser. There is no execution server.

- **JavaScript** runs in a Web Worker, with a 4s timeout so infinite loops cannot hang the tab.
- **TypeScript** is stripped to JavaScript with `sucrase` and runs through that same worker.
- **Python** runs on **Pyodide** (real CPython compiled to WebAssembly). The runtime is a ~10MB download fetched from a CDN the first time you pick Python, so the language picker shows a one-time "Downloading Python" indicator. After that the interpreter is kept warm and reused, and each run gets a fresh namespace so nothing leaks between runs. A run that exceeds 10s is killed.
- **Java and C++** have no runner. They cannot run in the browser, and the hosted service this app used (Piston, `emkc.org`) shut down permanently on 2026-08-31. They are still selectable so you can write and save code, and they are labelled "editor only"; pressing Run/Test/Submit explains the situation rather than failing with a network error.

For tests, the app wraps your starter function or `Solution` class and compares returned values to the expected JSON test cases. Python comparison treats a list and a tuple as equivalent to a JSON array and an int as equivalent to a float, while keeping booleans distinct from numbers.

---

## Where things are stored

- Pads (problem + your code per language) live in **this browser’s localStorage** (up to 50 recent pads). Clearing site data removes them.
- Opening the same URL on another device or browser will not show those pads.
- Optional browser Settings (provider / key / model) also stay local.
- Problem generation uses an LLM. The deployed site is configured with a server OpenAI key so **Create pad** and **Similar question** work without pasting a key. You can still override that in Settings.

Supported LLM providers in Settings: OpenAI, Anthropic, OpenRouter.

---

## AI-assisted review practice (`/review`)

A second mode that drills a different skill: reading unfamiliar code and pushing back on an AI assistant instead of accepting whatever it writes.

### What you get

Each session generates a small full-stack app — shared TypeScript types, an Express server with an in-memory store, and a React client. One feature works end to end and is there as the reference pattern; a second feature is broken. The domain is re-skinned every time (support forum, inventory, task board, and so on) so you cannot memorise one codebase.

The ticket is written the way a PM or support engineer would write it, not as a spec. It is deliberately underspecified — each one leaves about three things genuinely undecided, and there is a **Show what was left open** panel to check your clarifying questions against after you have thought about them yourself.

### The loop

1. Read the ticket and the code. Every file is editable, with a file tree and tabs.
2. **Run scenarios** exercises the app against scripted requests and shows pass/fail per scenario with the actual vs expected result.
3. Ask the assistant anything about the codebase, or ask it to write the fix.
4. When it proposes code you get a **diff**, and you must choose **Accept**, **Accept with changes**, or **Reject**, plus a written reason, before it can land in your files.
5. After you submit, the session reveals whether a defect was planted and whether you named it.
6. **Finish and score** grades the session.

### The planted defects

Roughly half of the assistant's proposals carry a deliberate, subtle defect, drawn from a fixed catalogue and applied only to lines the proposal actually touched:

- **Mismatched request field** — reading `req.body.id` where the route defines `:id`
- **Missing edge case** — a dropped not-found or validation guard
- **Convention violation** — error handling that disagrees with every other handler in the file
- **React stale state** — mutating state directly, or a closure that captures a stale value

Only about half of these turn a scenario red. Green scenarios are not a review — that is the point of the mode.

### Scoring

You are scored on whether you **named the actual defect**, not on whether your final code compiles. Confidently describing a different flaw counts as a miss, and the report says which defect you walked past. The end-of-session report shows defects caught, suggestions reviewed, and false alarms (pushing back on a clean suggestion), plus per-explanation feedback on clarity, whether you referenced the codebase's existing convention, and whether you named a concrete breaking input.

Sessions are stored in localStorage like pads, so you can leave and come back.

---

## Typical flow

1. Go to the site.
2. Paste a question → **Create pad** (or click a sample).
3. Read the LeetCode-style statement on the left.
4. Write a solution on the right.
5. **Test**, then **Submit**.
6. Click **Similar question** when you want another problem in the same family.
7. Return later via **Recent pads** on the home page.
