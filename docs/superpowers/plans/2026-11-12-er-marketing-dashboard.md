# ER Marketing Dashboard v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily, self-validating pipeline that pulls the agency's GHL data, cleans it with ruleset v1, and publishes a static, shareable dashboard. The dashboard tells a non-technical owner where to put next month's budget, by source.

**Architecture:** A Node.js ETL program (`pipeline/`) runs in GitHub Actions every morning. It fetches from GHL, runs batch health checks, applies the record rules, computes metrics, advice and insight text, and commits JSON files into `public/data/`. Vercel serves `public/` as a static site (HTML + Chart.js) that only ever reads those JSON files. The GHL key never leaves GitHub Secrets and the local `.env`. A failed health check commits only a status file, so the page keeps the last good data and shows a note.

**Tech Stack:**
- Node.js ESM with no npm dependencies: built-in `fetch`, built-in test runner `node --test`. Local Node is v26; CI uses Node 22, so use no APIs newer than Node 22.
- Chart.js 4.4.1 from `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`.
- GitHub Actions, Vercel (static, no build step).
- Local preview: `python -m http.server`.

**Spec:** `docs/superpowers/specs/2026-11-12-er-marketing-dashboard-design.md` (section numbers below, e.g. "§7", refer to it).

## Global Constraints

- The GHL key is read only from `process.env.GHL_API_KEY` (and from the local `.env` via the `--env-file` flag). It must never appear in `public/`, in any committed file, in logs, or in error messages. Errors print URLs with the location ID replaced by `<loc>`.
- GHL is read-only. Only `GET` requests, to the three endpoints in §5.
- Names: repo and Vercel project `ER-marketing-dashboard`.
- Thresholds (all in `pipeline/config.mjs`):
  - `VALUE_OUTLIER_MULTIPLIER = 5`
  - `MIN_LEADS_FOR_ADVICE = 20`
  - `ADVICE_BAND = 0.25`
  - `DROP_FAIL_SHARE = 0.20`
  - `REMOVAL_WARN_SHARE = 0.40`
  - `NEW_BADGE_DAYS = 7`
- Agency identity: pipeline name `Sales Pipeline`; tag `dash-project`. The 8 expected stage names, in GHL order: `Qualified Opt In, Disqualified, Booked call, Closed, Cancelled, No Show, Follow Up, Lost`.
- Currency is USD, whole dollars (`$7,000`). Times are shown in `Asia/Beirut`.
- Page copy is plain English with no jargon. Exact strings fixed by the spec:
  - Title: "Marketing Performance — Where should next month's budget go?"
  - Fallback note: "Today's update was paused because the data looked incomplete — showing data from <date>."
  - Revenue badge hover: "<n> sale(s) has an unreliable value ($<value>) — not counted. Revenue may be understated."
  - Advice exemption badge: "Can't judge fairly — a sale's value is missing"
  - Small-source badge: "Too few leads to judge"
- Data from GHL is untrusted text on a public page. Render it only with `textContent` or Chart.js labels, never with `innerHTML`.
- Never invent numbers. An ignored deal value contributes $0 to revenue and is shown as ignored. It is never replaced with a guess.

## Review Focus

1. **Hostile or odd text in names (XSS).** Other sandbox users can type `<img src=x onerror=alert(1)>` as a contact name. The page must show it as literal text. → Task 10 test `render never uses innerHTML for data` (a static scan of `public/js/` for `innerHTML` assignments fed by data) and a fixture name rendered through `textContent`.
2. **GHL fails mid-pagination** (a 500 on page 3, or repeated 429s). The run must fail with a 🔴 status and publish nothing new. A partial download is never treated as complete. → Task 2 test `throws after retries`. Task 8 test `fetch error writes fail status and keeps latest.json`.
3. **A source with 0 sales or 0 deals.** Rates with a zero denominator show as `null` in data and "—" on the page, never `NaN` or `Infinity`. Revenue per lead is $0. The source can still land in "Consider cutting". → Task 5 test `zero denominators yield null`. Task 6 test `zero-sale source is cut not crashed`.
4. **Missing or corrupt previous snapshot** (`public/data/latest.json` absent or not valid JSON). Treat it as a first run: no drop check, no NEW flood, no crash. → Task 8 test `corrupt previous snapshot treated as first run`.
5. **Source-name variants** (`"facebook ad "`, `"Facebook  Ad"`). These should merge into one source, not split a bar. Trim, collapse spaces, and merge case-insensitively into the first-seen spelling. → Task 4 test `source variants merge`.

---

## File map

```
package.json                     scripts: test, pipeline, pipeline:local, pipeline:raw, preview
vercel.json                      static output = public/, no-cache headers for /data/*
.gitignore                       (exists) + public/data-raw/
.github/workflows/daily.yml      cron + manual run with simulate_failure input
pipeline/config.mjs              constants, funnel/stage definitions
pipeline/text.mjs                normalisation + matching helpers, maskEmail
pipeline/ghl.mjs                 GHL client: fetchAll
pipeline/rules.mjs               A1–A5 removal rules + waterfall
pipeline/annotate.mjs            A6–A9, attribution, multi-deal/orphan handling → leads
pipeline/clean.mjs               cleanData wrapper (normal / raw mode)
pipeline/metrics.mjs             per-source metrics + consistency check
pipeline/advice.mjs              advice cards
pipeline/insights.mjs            rule-based sentences
pipeline/health.mjs              B0–B5 checks
pipeline/tracking.mjs            firstCaught diff + NEW counting
pipeline/run.mjs                 orchestration, file output, CLI flags
public/index.html, public/css/styles.css
public/js/format.js              pure formatting helpers (node-testable)
public/js/render.js              DOM building (textContent only)
public/js/charts.js              Chart.js configs
public/js/app.js                 load JSON, tabs, wire everything
public/data/                     latest.json, status.json, history/YYYY-MM-DD.json (written by the pipeline)
test/*.test.mjs, test/fixtures.mjs
README.md
recon/                           (exists; raw/ gitignored) — recon/raw is used by the local integration test
```

## Shared data shapes (JSDoc in `pipeline/config.mjs`)

These are the interfaces every task uses. Field names are fixed.

```js
// Raw, as returned by GHL (only the fields we use)
// Contact: { id, contactName, email, phone, companyName, source, tags: string[], dateAdded }
// Opp:     { id, name, monetaryValue, pipelineId, pipelineStageId, status, source, contactId }
// RawData: { pipelines: Pipeline[], contacts: Contact[], opportunities: Opp[],
//            totals: { contacts: number, opportunities: number } }   // totals = GHL meta.total
// Ctx:     { pipelineId: string, stageNameById: Map<string,string>, stages: string[] } // stages in GHL order

// Cleaned
// Deal:          { id, name, stage, status, value: number|null, originalValue: number|null, valueIgnored: boolean }
// Lead:          { id, name, email, source, deal: Deal|null }
// RemovedRecord: { id, name, maskedEmail, source, rule: 'A2'|'A3'|'A3b'|'A4'|'A5', reason, firstCaught: string|null }
// IgnoredValue:  { id /*deal id*/, dealName, source, stage, value, reason, firstCaught: string|null }
// WaterfallStep: { rule: 'START'|'A1'|'A2'|'A3'|'A3b'|'A4'|'A5', label, reason, removed: number, remaining: number }
// CleanResult:   { leads: Lead[], removed: RemovedRecord[], removedA1Count: number, scopeCount: number,
//                  waterfall: WaterfallStep[], ignoredValues: IgnoredValue[],
//                  annotations: { stageStatusMismatch: number, unknownSource: number, extraDeals: number, orphanDeals: number } }
```

`latest.json` (written by Task 8, read by Tasks 9–10):

```js
{ schemaVersion: 1, generatedAt /*ISO*/, mode: 'clean'|'raw',
  stages: string[], stageGroups: { moving: string[], won: ['Closed'], dead: string[] },
  totals: { leads, deals, sales, revenue },
  sources: SourceMetrics[],            // Task 5
  advice: Advice,                      // Task 6
  insights: Insights,                  // Task 6
  audit: { waterfall, removed, ignoredValues, removedA1Count, annotations, newSuspiciousCount, newSince /*date|null*/ },
  health: { result: 'pass'|'warn', checks: Check[] } }
```

`status.json`: `{ lastAttempt /*ISO*/, lastSuccess /*ISO|null*/, result: 'pass'|'warn'|'fail', notes: string[] }`

---

### Task 1: Project scaffold, config and text helpers

**Files:**
- Create: `package.json`, `vercel.json`, `pipeline/config.mjs`, `pipeline/text.mjs`, `test/text.test.mjs`
- Modify: `.gitignore` (add `public/data-raw/`)

**Interfaces:**
- Produces:
  - `config.mjs` exports the threshold constants (Global Constraints), `AGENCY_PIPELINE_NAME`, `AGENCY_TAG`, `EXPECTED_STAGES`, `STAGE_GROUPS = { moving: ['Qualified Opt In','Booked call','Follow Up'], won: ['Closed'], dead: ['Disqualified','Cancelled','No Show','Lost'] }`, `OPEN_STAGES` (= moving), `DECIDED_STAGES` (= won + dead), and `FUNNEL_STEPS`:
    ```js
    [ { key:'lead', label:'Lead' }, { key:'pipeline', label:'Entered pipeline' },
      { key:'qualified', label:'Qualified', stages: all except 'Disqualified' },
      { key:'booked', label:'Booked a call', stages: ['Booked call','Cancelled','No Show','Follow Up','Closed','Lost'] },
      { key:'attended', label:'Attended the call', stages: ['Follow Up','Closed','Lost'] },
      { key:'won', label:'Won', stages: ['Closed'] } ]
    ```
  - `text.mjs`:
    - `norm(s: string|null): string`: lowercase, trim, collapse whitespace; null → `''`
    - `hasWholeWord(text: string, words: string[]): boolean`: word boundaries on letters, so `demo` matches `demo@example.com`, `Demo Company` and `demo-data`, but not `Demos` or `Demolition`
    - `emailBaseKey(email): string`: normalised email with a trailing `.<digits>` before `@` removed
    - `phoneKey(phone): string`: digits only
    - `maskEmail(email): string`

- [ ] **Step 1: Write the failing tests** in `test/text.test.mjs`:
  - `norm('  Facebook   Ad ')` → `'facebook ad'`
  - `hasWholeWord` is true for `'demo@example.com'`, `'Demo Company'`, `'demo-data'`, `'TEST - LeadPulse'`, `'leadpulse-test'`
  - `hasWholeWord` is false for `'Demos Haddad'`, `'Demolition Experts'`, `'Contest Winners'`
  - `emailBaseKey('Fadi.Gerges161.2@Example.com')` → `'fadi.gerges161@example.com'`
  - `emailBaseKey('fadi.gerges161@example.com')` is unchanged
  - `maskEmail('fadi.gerges161@example.com')` → `'fa***@example.com'`
  - `maskEmail('')` → `''`
  - `phoneKey('+1 555-0100 199')` → `'15550100199'`
- [ ] **Step 2:** Run `node --test test/` → FAIL (module not found).
- [ ] **Step 3:** Implement `config.mjs` and `text.mjs`. For whole-word matching, use the regex `(^|[^a-z])word([^a-z]|$)` on `norm(text)`, so digits, `@`, `-` and `.` count as boundaries.
- [ ] **Step 4:** Create the remaining scaffold files:
  - `package.json`: `"type":"module"`, `"engines":{"node":">=22"}`, and these scripts:
    - `test`: `node --test test/`
    - `pipeline`: `node pipeline/run.mjs`
    - `pipeline:local`: `node --env-file=.env pipeline/run.mjs`
    - `pipeline:raw`: `node pipeline/run.mjs --from-file recon/raw --raw --out public/data-raw`
    - `preview`: `python -m http.server 8080 -d public`
  - `vercel.json`: `{ "outputDirectory": "public", "buildCommand": "", "headers": [{ "source": "/data/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }] }`
- [ ] **Step 5:** Run `npm test` → PASS.
- [ ] **Step 6:** Initialise git and commit:

```bash
git init -b main
git add .gitignore package.json vercel.json pipeline test docs recon/fetch.mjs
git commit -m "chore: scaffold project, config and text helpers"
```

Before committing, check `git status` shows no `.env`, no `recon/raw/` and no `.xlsx` (add `recon/*.xlsx` to `.gitignore`).

---

### Task 2: GHL client

**Files:**
- Create: `pipeline/ghl.mjs`, `test/ghl.test.mjs`

**Interfaces:**
- Produces: `fetchAll({ apiKey, locationId, fetchImpl = fetch, sleep = ms => new Promise(r=>setTimeout(r,ms)) }): Promise<RawData>`
  - contacts: `GET /contacts/?locationId=…&limit=100`, following `meta.nextPageUrl` until a page is empty or `nextPageUrl` is null
  - opportunities: `GET /opportunities/search?location_id=…&limit=100&page=N` until the collected count reaches `meta.total` or a page is empty
  - pipelines: `GET /opportunities/pipelines?locationId=…`
  - `totals` = each endpoint's `meta.total`
  - Headers: `Authorization: Bearer <key>`, `Version: 2021-07-28`, `Accept: application/json`

- [ ] **Step 1: Write the failing tests** with a fake `fetchImpl` that serves canned pages:
  - `paginates contacts and opportunities`: 3 contact pages (100+100+20, total 220) and 2 opp pages (total 150) → lengths 220 and 150, and `totals` = `{contacts:220, opportunities:150}`
  - `retries on 429 then succeeds`: the first call returns 429, the next 200 → succeeds, and `sleep` was called at least once
  - `throws after retries`: always 429 (5 attempts) → rejects. Separately, a 500 on page 2 → rejects immediately
  - `never leaks key in errors`: on a 401 the error message contains neither `apiKey` nor `locationId`
- [ ] **Step 2:** Run `node --test test/ghl.test.mjs` → FAIL.
- [ ] **Step 3:** Implement `fetchAll`, adapting `recon/fetch.mjs`. Retry: up to 5 attempts on 429 with backoff `2000*(attempt+1)` ms via the injected `sleep`. Any other non-OK status throws `Error(\`GHL ${status} ${path}\`)` with the location ID replaced by `<loc>`.
- [ ] **Step 4:** Run the tests → PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: GHL read-only client with pagination and retry"`.

---

### Task 3: Removal rules A1–A5 and the waterfall

**Files:**
- Create: `pipeline/rules.mjs`, `test/fixtures.mjs`, `test/rules.test.mjs`

**Interfaces:**
- Consumes: `text.mjs`, `config.mjs`, and the `Ctx` shape.
- Produces:
  - `resolveCtx(raw: RawData): Ctx | null`: finds the pipeline named `Sales Pipeline`. Returns null if it is missing.
  - `applyRemovalRules(raw: RawData, ctx: Ctx): { kept: Array<{contact, opps: Opp[]}>, removed: RemovedRecord[] /*A2–A5 only, firstCaught:null*/, removedA1Count: number, scopeCount: number, waterfall: WaterfallStep[] }`. Here `opps` are the contact's Sales Pipeline deals.
- `test/fixtures.mjs` exports `makeContact(overrides)`, `makeOpp(overrides)` and `makeRaw({contacts, opps})`, which builds a single "Sales Pipeline" with the 8 stage ids `s1..s8` mapped to the expected names in order.

Rule semantics (§7). Apply in order; each record is removed by the first rule that catches it.
- **A1** removes a contact with no `dash-project` tag **and** no Sales Pipeline deal. Counted only; not listed.
- **A2** removes a contact if any of these holds:
  - its tags include `demo-data` or `sandbox`
  - `hasWholeWord(x, ['demo'])` is true for any of: name, email, company, any Sales Pipeline deal name, any tag
- **A3** applies the same check with the words `['test','dummy','fake']`.
- **A3b** removes a contact with no `dash-project` tag **and** a blank `norm(source)` (the contact's own source, or else its deal's source).
- **A4** removes a contact tagged `internal`.
- **A5** removes duplicates.
  - Group the remaining contacts by any of these keys (union of matches):
    - `emailBaseKey`, but only when the base address belongs to a remaining contact
    - non-empty `phoneKey`
    - `norm(name)` + `norm(company)`, when both are non-empty
  - A contact tagged `dq - duplicate` is always the copy.
  - Otherwise keep, in order of preference: the contact with a Sales Pipeline deal; then the furthest-advanced deal (rank by the `FUNNEL_STEPS` depth of its stage); then the earliest `dateAdded`.
  - Removed copies take their deals with them.
- Reasons, written once in `config.mjs` as `RULE_TEXT[rule] = { label, reason }`:
  - A1: "Not this agency's" — "Belongs to another user of the shared sandbox"
  - A2: "Demo record" — "Marked as demo data, not a real lead"
  - A3: "Test record" — "Marked as a test entry"
  - A3b: "Unverified pipeline entry" — "In the pipeline without the agency tag or a source, so it can't be credited to any channel"
  - A4: "Internal" — "Internal contact, not a customer"
  - A5: "Duplicate" — "Same person entered twice; the copy is removed"

- [ ] **Step 1: Write the failing tests:**
  - `A1 removes untagged contacts with no Sales Pipeline deal and only counts them`
  - `an untagged contact with a source and a Sales Pipeline deal is kept` (§7 scope decision)
  - `A2 catches demo-data tag, demo@ email, "Demo Company"`
  - `A2 does not catch a "Demos Haddad" contact`
  - `A3 catches leadpulse-test tag and "TEST - …" deal name`
  - `A3b catches untagged pipeline entry with blank source`
  - `A4 catches internal`
  - `A5 keeps the original with a deal and removes the .2 copy`
  - `A5 with both copies holding deals keeps the more advanced one and removes the other deal`
  - `A5 respects "dq - duplicate" tag`
  - `each record removed once; waterfall sums`: build 10 contacts where one is both `internal` and a duplicate → it appears only under A4, and `waterfall[last].remaining === kept.length` and `START.remaining − Σ removed === kept.length`
- [ ] **Step 2:** Run the tests → FAIL.
- [ ] **Step 3:** Implement `resolveCtx` and `applyRemovalRules` in `pipeline/rules.mjs`. Use a union-find over the duplicate keys for A5.
- [ ] **Step 4:** Run the tests → PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: removal rules A1-A5 with audited waterfall"`.

---

### Task 4: Annotations A6–A9, attribution and leads

**Files:**
- Create: `pipeline/annotate.mjs`, `pipeline/clean.mjs`, `test/annotate.test.mjs`

**Interfaces:**
- Consumes: `applyRemovalRules` and `resolveCtx` (Task 3).
- Produces:
  - `buildLeads(kept, ctx, { raw = false } = {}): { leads: Lead[], ignoredValues: IgnoredValue[], annotations }`
  - `cleanData(rawData: RawData, ctx: Ctx, { raw = false } = {}): CleanResult`
    - Normal mode runs Task 3, then `buildLeads`.
    - Raw mode (`raw:true`) applies only A1, ignores no values, and still returns a full `CleanResult` (waterfall: START + A1 only).

Semantics:
- **Source attribution:** contact source, then the deal's source, else `"Unknown source"` (counted in `annotations.unknownSource`, rule A6).
- **Source canonicalisation:** the first-seen spelling wins for each `norm()` key, so `"facebook ad "` merges into `"Facebook Ad"`.
- **Several Sales Pipeline deals on one contact:** use the furthest-advanced deal as `lead.deal` and count the rest in `annotations.extraDeals`.
- **Orphan deals:** a Sales Pipeline deal whose `contactId` matches no contact is counted in `annotations.orphanDeals` and is not a lead.
- **A7:** compute the median of the non-zero `monetaryValue`s across all kept leads' deals. A deal is `valueIgnored` if `value > VALUE_OUTLIER_MULTIPLIER × median`, or if `stage === 'Closed'` and `value === 0`. Set `deal.value = null` and keep `originalValue`. Push an `IgnoredValue` with reason "Unusually high value — likely a typing mistake" or "Marked as a sale but the value is $0".
- **A8:** a $0 deal that is not Closed is kept unchanged.
- **A9:** count deals whose status contradicts the stage, using the expected pairs: moving→open, Closed→won, Disqualified/Lost→lost, Cancelled/No Show→abandoned. Store the count in `annotations.stageStatusMismatch`. The stage is used everywhere.

- [ ] **Step 1: Write the failing tests:**
  - `source variants merge` (Review Focus 5)
  - `blank source on a tagged lead becomes "Unknown source"`
  - `A7 ignores 145000 when median is 7000 and keeps the sale`: `deal.value === null`, `valueIgnored`, and the lead is still present
  - `A7 ignores $0 on a Closed deal; A8 keeps $0 on an open deal`
  - `A9 counts Disqualified+open as a mismatch and keeps stage`
  - `multiple deals per contact uses furthest-advanced`
  - `orphan deal is counted, not a lead`
  - `raw mode applies only A1 and ignores no values`
- [ ] **Step 2:** Run the tests → FAIL.
- [ ] **Step 3:** Implement `buildLeads` and `cleanData`.
- [ ] **Step 4:** Run the tests → PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: value/attribution annotations and cleanData"`.

---

### Task 5: Metrics and the consistency check

**Files:**
- Create: `pipeline/metrics.mjs`, `test/metrics.test.mjs`

**Interfaces:**
- Consumes: `Lead[]` and `config.mjs`.
- Produces: `computeMetrics(leads: Lead[], stages: string[]): { totals, sources: SourceMetrics[] }`, plus `checkConsistency(metrics): string[]`, which returns an empty array when consistent and otherwise problem messages. `SourceMetrics`:

```js
{ source, leads, deals, stageCounts: {[stage]: number},           // all 8 stages present, zeros included
  funnel: [{ key, label, count }],                                  // 6 steps per FUNNEL_STEPS
  stepRates: [{ from, to, rate: number|null }],                     // step n ÷ step n−1; null if denominator 0
  overallRate: number|null,                                         // won ÷ leads
  sales, revenue, revenuePerLead, closeRate: number|null,
  ignoredWonCount, ignoredWonValues: number[],                      // won deals whose value was ignored
  smallSample: boolean,                                             // leads < MIN_LEADS_FOR_ADVICE
  projection: { per10Sales, per10Revenue } | null,                  // null when smallSample
  openForecast: { openDeals, winRate: number|null, avgWonValue: number|null, expectedRevenue: number|null } | null }
```

Definitions are in §9:
- `winRate = won ÷ (won + dead-stage deals)`.
- `avgWonValue` is the mean of the source's trusted won values. If the source has none, fall back to the agency-wide trusted won mean.
- `openForecast` is null when `smallSample`.
- Sources are sorted by `revenuePerLead` descending.
- `totals.revenue` sums the sources.

- [ ] **Step 1: Write the failing tests** (on a hand-built `Lead[]` with 2 sources):
  - `stage counts sum to deals per source and overall`, and `checkConsistency` returns `[]`
  - `funnel uses "reached at least"`: a Closed deal counts in qualified, booked, attended and won
  - `zero denominators yield null` (Review Focus 3): a source with leads but no deals → `stepRates[1..].rate === null` and `revenuePerLead === 0`
  - `ignored value counts as a sale but adds $0`
  - `small sample source has null projection and forecast`
  - `checkConsistency flags a tampered stageCounts`
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: per-source metrics, funnel and consistency check"`.

---

### Task 6: Budget advice and insight sentences

**Files:**
- Create: `pipeline/advice.mjs`, `pipeline/insights.mjs`, `test/advice.test.mjs`, `test/insights.test.mjs`

**Interfaces:**
- Consumes: `SourceMetrics[]` (Task 5).
- Produces:
  - `computeAdvice(sources): Advice`:

    ```js
    { average: number|null,                       // Σ revenue ÷ Σ leads over eligible sources
      invest: AdviceItem[], keep: AdviceItem[], cut: AdviceItem[], notJudged: AdviceItem[] }
    // AdviceItem: { source, revenuePerLead, ratio: number|null, reason: string, badge: string|null }
    ```

    - Eligible means: not `smallSample`, and not `"Unknown source"`.
    - Ineligible sources go to `notJudged`, with badge "Too few leads to judge" or reason "Source unknown".
  - `buildInsights(metrics, advice): { advice: string[], volume: string[], pipeline: string[], conversion: string[], revenue: string[] }`, with 1–2 plain sentences per section.

Classification:
- `ratio = revenuePerLead ÷ average`
- `ratio ≥ 1 + ADVICE_BAND` → invest
- `ratio ≤ 1 − ADVICE_BAND` → cut, **except** when `ignoredWonCount > 0`: then keep, with badge "Can't judge fairly — a sale's value is missing"
- otherwise → keep

The reason reads like "$X per lead, 1.6× the average". The core branch is a good **Learn-by-Doing** point for the user: during execution, leave the ratio → card decision as a `TODO(human)` inside `computeAdvice`, with the tests already written.

- [ ] **Step 1: Write the failing tests:**
  - `classifies against the pooled average`: A = $4000 over 20 leads ($200/lead), B = $5000 over 100 leads ($50/lead), C = $3000 over 100 leads ($30/lead).
    - Pooled average = $12000/220 ≈ $54.55. A plain mean of the per-source figures would be $93.33 and would wrongly put B in cut.
    - Expect `advice.average ≈ 54.55`, invest = [A], keep = [B] (ratio ≈ 0.92), cut = [C] (ratio ≈ 0.55).
  - `source with ignored won value is never cut`: the same C with `ignoredWonCount:1` → keep, with the badge
  - `small and unknown sources are not judged`
  - `zero-sale source is cut not crashed` (Review Focus 3)
  - `all similar → no invest/cut, and an advice sentence "All sources perform similarly"`
  - Insights: `numbers in sentences match metrics`. For each section, every `$` and number in the text is the formatted value of a metric field. Assert specific strings, e.g. the volume sentence contains the top source's name and lead count.
  - `insights handle a tie for top source` (names both)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (with the `TODO(human)` handoff if running in learning mode). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: budget advice and rule-based insights"`.

---

### Task 7: Health checks and new-record tracking

**Files:**
- Create: `pipeline/health.mjs`, `pipeline/tracking.mjs`, `test/health.test.mjs`, `test/tracking.test.mjs`

**Interfaces:**
- Produces:
  - `runHealthChecks({ raw: RawData, ctx: Ctx|null, clean: CleanResult, metrics, previous: object|null }): { result: 'pass'|'warn'|'fail', checks: Array<{ id, level: 'fail'|'warn', ok: boolean, message: string }> }`
  - `assignFirstCaught(items: Array<{id}>, previousItems: Array<{id, firstCaught}>|null, today: string /*YYYY-MM-DD*/): items` (returns new objects):
    - first run (`previousItems === null`) → `firstCaught: null`
    - id seen before → previous `firstCaught` kept
    - otherwise → `today`
  - `countNew(items, today, days = NEW_BADGE_DAYS): number`: counts items with non-null `firstCaught` where `today − firstCaught < days` days. The page's `isNew` in `format.js` (Task 9) must use the same rule.

The checks (§8). B0 is raised by `run.mjs` (Task 8), not here.
- B1 (fail): `raw.contacts.length === raw.totals.contacts` and the same for opportunities.
- B2 (fail): `ctx` is not null, and `ctx.stages` deep-equals `EXPECTED_STAGES`.
- B3 (fail, skipped when `previous` is null): `totals.leads ≥ previous.totals.leads × (1 − DROP_FAIL_SHARE)`.
- B4 (warn, skipped on first run): every current source name exists in `previous.sources`. The message names the new source.
- B5 (warn): `(clean.scopeCount − leads.length) ÷ clean.scopeCount ≤ REMOVAL_WARN_SHARE`.
- Consistency (fail): `checkConsistency(metrics)` is empty.

`result` is fail if any failing check exists, else warn if any warning exists, else pass.

- [ ] **Step 1: Write the failing tests:**
  - B1 fails when contacts are half of the total
  - B2 fails on a renamed stage and on a missing pipeline
  - B3: fails at a 25% drop, passes at 10%, skipped with no previous
  - B4: warns on "TikTok Ad"
  - B5: warns at 45%
  - pass when all good
  - tracking: first run → all null; seen id keeps its date; new id gets today
  - `countNew` excludes ids older than 7 days and nulls
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: batch health checks and first-caught tracking"`.

---

### Task 8: Orchestration, outputs and the end-to-end test on real data

**Files:**
- Create: `pipeline/run.mjs`, `test/run.test.mjs`, `test/no-secrets.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: `run({ argv, env, now = new Date(), fetchImpl = fetch }): Promise<{ result, latestWritten: boolean }>`, plus a CLI entry when run directly.
- Sets `audit.newSuspiciousCount = countNew(removed) + countNew(ignoredValues)` and `audit.newSince` = the date `NEW_BADGE_DAYS` before today (null on the first run).
- Flags:
  - `--from-file <dir>`: read `pipelines.json`, `contacts.json` and `opportunities.json` instead of calling GHL. `totals` = array lengths, unless a `totals.json` exists.
  - `--raw`: use `cleanData(…, {raw:true})` and stamp `mode:'raw'`.
  - `--out <dir>`: default `public/data`.
  - `--simulate-failure`, or env `SIMULATE_FAILURE=true`: after fetching, keep only the first half of `contacts` (so B1 fails).
- Files:
  - `<out>/latest.json` (shape above): written only when the result is not fail
  - `<out>/status.json`: always written. `lastSuccess` is carried from the previous status on fail, and set to `generatedAt` otherwise.
  - `<out>/history/<YYYY-MM-DD>.json`: always written, containing `{ status, waterfall, removedIds, ignoredIds, checks }`
- On a fetch error (B0), write a fail status with the note "Could not reach GHL" and leave `latest.json` untouched.
- The previous snapshot is read from `<out>/latest.json`. A missing file or unparsable JSON → `previous = null` (first run).
- Before writing, apply `maskEmail` to the removed records, and put no raw email anywhere in `latest.json`.
- Notes in `status.notes` for the page:
  - on fail: the spec's fallback note, using the date of `lastSuccess` in Beirut time
  - on warn: each warning message

- [ ] **Step 1: Write the failing tests** (`test/run.test.mjs`, using a temp dir and fixture data through an injected `fetchImpl` / `--from-file`):
  - `pass run writes latest, status and history`
  - `simulate-failure writes fail status and keeps previous latest.json byte-identical`
  - `fetch error writes fail status and keeps latest.json` (Review Focus 2)
  - `corrupt previous snapshot treated as first run` (Review Focus 4): no B3, every `firstCaught` null
  - `second run marks only newly removed ids as new`
  - `latest.json contains no raw email addresses`
  - **Real-data integration** (skip if `recon/raw/contacts.json` is absent): run with `--from-file recon/raw` → assert:
    - `waterfall.map(s=>s.remaining)` deep-equals `[420,355,322,322,321,306,294]`
    - `totals.deals === 204`
    - `audit.ignoredValues.length === 7`
    - `audit.removedA1Count === 65`
    - `health.result !== 'fail'`
    - `audit.annotations.stageStatusMismatch === 2`

    If any number differs, investigate the data before changing the assertion. The spec says these must be verified.
- [ ] **Step 2:** Write `test/no-secrets.test.mjs`. It lists the files from `git ls-files` (falling back to walking `pipeline/`, `public/`, `test/` and the root files) and asserts that none matches `/pit-[0-9a-f]{8}-[0-9a-f]{4}-/`, and that `.env` is not tracked.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement `run.mjs`. **Step 5:** Run `npm test` → PASS (all suites).
- [ ] **Step 6:** Produce the real files from the snapshot:
  - `node pipeline/run.mjs --from-file recon/raw` → `public/data/latest.json` exists with `mode:'clean'`
  - `npm run pipeline:raw` → `public/data-raw/latest.json` exists (gitignored)
- [ ] **Step 7:** Commit (including `public/data/`): `git commit -m "feat: pipeline orchestration, outputs and fallback"`.

---

### Task 9: Page shell, top bar and the Overview tab

**Files:**
- Create: `public/index.html`, `public/css/styles.css`, `public/js/format.js`, `public/js/render.js`, `public/js/charts.js`, `public/js/app.js`, `test/format.test.mjs`, `.claude/launch.json`

**Interfaces:**
- Consumes: `latest.json` / `status.json` shapes.
- Produces:
  - `format.js`: `money(n)` → `'$7,000'` (and `'—'` for null), `pct(r)` → `'54%'` (and `'—'` for null), `beirutDateTime(iso)` → `'Mon 16 Nov, 06:00'`, `isNew(firstCaught, today, days=7)`
  - `render.js`: functions taking `(container, data)` that build DOM with `createElement`/`textContent` only: `renderTopBar`, `renderAdvice`, `renderScorecard`, `renderSectionInsights`, `renderRatesTable`, `renderFooter`
  - `charts.js`: `volumeChart(canvas, sources)`, `stageChart(canvas, sources, stages, stageGroups)`, `funnelPair(canvasA, canvasB, sourceA, sourceB)`, `revenueChart(canvas, sources)`

Page behaviour (§11):
- `app.js` fetches `data/latest.json` and `data/status.json` with `cache: 'no-store'`.
  - With `?raw=1` it loads `data-raw/latest.json` and shows a red banner: "RAW DATA — not cleaned (local preview only)".
  - Two tabs, Overview and Removed records, are switched with buttons. The hash `#removed` opens tab 2.
  - The new-record alert links to `#removed`.
- **Top bar:**
  - the title
  - "Last updated: " + `beirutDateTime(status.lastSuccess)`
  - a yellow note list from `status.notes` when the result is not pass
  - 🔔 "N new suspicious records since <newSince> — review" when `audit.newSuspiciousCount > 0`
  - "Based on N real leads. M records were left out — see why."
- **Overview** sections, in order:
  0. advice cards + scorecard (⚠️ badges)
  1. volume bar (sorted descending)
  2. stacked horizontal stage bar with totals at the bar ends (blues = moving, green = Closed, greys = dead)
  3. funnel pair with two `<select>`s (default: the top two by revenue per lead), drawn as centred floating horizontal bars, plus the rates table
  4. revenue bar sorted descending, ⚠️ in the label of sources with ignored values and the hover text from Global Constraints; revenue per lead and the forecast labelled "estimate"
  5. footer "How we calculated this"
- Each section shows its `insights.*` sentences.
- Layout: a single column under 720px; no horizontal scroll at 375px.

- [ ] **Step 1: Write the failing tests** in `test/format.test.mjs`:
  - `money(7000)==='$7,000'`, `money(null)==='—'`
  - `pct(0.5427)==='54%'`, `pct(null)==='—'`
  - `isNew('2026-11-10','2026-11-12')===true`, `isNew('2026-11-01','2026-11-12')===false`, `isNew(null,…)===false`
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `format.js` → PASS.
- [ ] **Step 4:** Build the page files. Load Chart.js from the pinned jsdelivr URL with a `<script>` tag. Write `.claude/launch.json` with `{"version":"0.0.1","configurations":[{"name":"dashboard","runtimeExecutable":"python","runtimeArgs":["-m","http.server","8080","-d","public"],"port":8080}]}`.
- [ ] **Step 5: Verify in the browser** (`preview_start` "dashboard"):
  - the page loads with no console errors
  - the top bar shows "Based on 294 real leads"
  - the stacked-bar totals equal the scorecard's deals per source
  - the advice cards show sources with reasons, and Facebook Ad / Instagram Ad carry ⚠️
  - the A-vs-B selects redraw both funnels
  - at 375px width nothing overflows
- [ ] **Step 6:** Commit: `git commit -m "feat: dashboard shell, top bar and overview"`.

---

### Task 10: Removed records tab, raw preview and the XSS guard

**Files:**
- Modify: `public/js/render.js` (add `renderWaterfall`, `renderRemovedList`, `renderIgnoredList`), `public/js/app.js`
- Create: `test/xss.test.mjs`

**Interfaces:**
- Consumes: `audit.*` from `latest.json`; `isNew` from `format.js`.

Tab 2 (§11):
- The waterfall: one row per `WaterfallStep`, with label, reason, removed and remaining. A1 appears here only.
- The removed list (A2–A5): name, source, rule label, reason, masked email, first caught (`—` when null).
- The "Kept, but dollar value ignored" list: deal name, source, stage, `money(value)`, reason, first caught.
- In both lists, NEW badges come from `isNew` and new rows sort to the top.

- [ ] **Step 1: Write the failing test** `render never uses innerHTML for data` (Review Focus 1). It reads every file in `public/js/` and asserts there is no `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`.
- [ ] **Step 2:** Run → it may already pass. If Task 9 used any of these, it fails: replace them.
- [ ] **Step 3:** Implement the tab.
- [ ] **Step 4: Verify in the browser:**
  - the waterfall reads 420 → 355 → 322 → 322 → 321 → 306 → 294
  - 33 + 0 + 1 + 15 + 12 rows are listed (A2, A3, A3b, A4, A5)
  - 7 ignored-value rows
  - emails are masked
  - With a hand-edited copy of `latest.json` in which one removed name is `<img src=x onerror=alert(1)>` and one `firstCaught` is today, the name shows as literal text, no alert fires, and the NEW badge is on the edited row. Afterwards, restore the file with `git checkout public/data/latest.json`.
  - `?raw=1` shows the red raw banner and the uncleaned numbers.
- [ ] **Step 5:** Run `npm test` → PASS. Commit: `git commit -m "feat: removed-records tab, raw preview, xss guard"`.

---

### Task 11: GitHub repo, daily workflow and the Vercel deploy

**Files:**
- Create: `.github/workflows/daily.yml`

`daily.yml`:
- `on.schedule: - cron: '0 4 * * *'`. That is 06:00 Beirut in winter (UTC+2) and 07:00 in summer; document this in the README.
- `on.workflow_dispatch.inputs.simulate_failure`: boolean, default false.
- `permissions: contents: write`.
- Job steps:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with `node-version: 22`
  3. `npm test`
  4. `node pipeline/run.mjs`, with env `GHL_API_KEY: ${{ secrets.GHL_API_KEY }}`, `GHL_LOCATION_ID: ${{ secrets.GHL_LOCATION_ID }}` and `SIMULATE_FAILURE: ${{ inputs.simulate_failure }}`
  5. If `git status --porcelain public/data` is non-empty: commit as `github-actions[bot]` with the message `data: update <date> (<result>)` and push.
- The workflow must not echo env.
- `npm test` runs before the pipeline, so a broken rule never publishes. The real-data test skips in CI because `recon/raw` is gitignored.

- [ ] **Step 1:** Write `daily.yml`. Run `npm test` locally → PASS.
- [ ] **Step 2: Ask the user before anything public happens.** Confirm creating the **public** GitHub repo `ER-marketing-dashboard` and pushing. Run `npm test` (including `no-secrets`) and `git ls-files | grep -E '^\.env|recon/raw'` → expect no output.
- [ ] **Step 3:** Create the repo and push: `gh repo create ER-marketing-dashboard --public --source . --push` if `gh` is installed and logged in; otherwise guide the user through github.com.
- [ ] **Step 4: User steps, guided:**
  1. Add the GitHub Secrets `GHL_API_KEY` and `GHL_LOCATION_ID` (Settings → Secrets and variables → Actions).
  2. Sign in to Vercel with GitHub, import the repo, set framework to "Other" and output to `public`, then deploy.
- [ ] **Step 5: Verify live:**
  - Trigger "Run workflow" (normal). It goes green, a `data: update` commit appears, and Vercel redeploys. The live link shows the dashboard with "Last updated" ≈ now (Beirut).
  - Then "Run workflow" with `simulate_failure` → the run commits a fail status. The live page shows the yellow paused note and keeps the old "Last updated".
  - Then a normal run → the note disappears.
  - Open the live page and confirm (view-source + network tab) that no `pit-` string or GHL URL appears.

---

### Task 12: README

**Files:**
- Create: `README.md`

Contents:
1. What it is, plus the live link.
2. How it works: the 5-step pipeline diagram and the daily schedule.
3. How to read the dashboard, for the owner.
4. **Decisions, one line each with the reason.** Cover:
   - scope (Sales Pipeline + tag)
   - every rule A1–A9 and every check B0–B5
   - the funnel path and the "Lost after the call" assumption
   - revenue per lead as the budget metric
   - the pooled average and the ±25% band
   - the 20-lead minimum
   - the exemption from the cut card
   - never inventing values
   - no trend because of the single import date
   - the fallback behaviour
   - NEW for 7 days
   - A1 shown as a count only
   - masked emails
   - an open link
   - the stack choices (GitHub Actions + Vercel + plain HTML/Chart.js)
   - the cron time
   - the v2 list
5. Data-quality results: the waterfall table and the ignored values.
6. Running locally: `npm test`, `npm run pipeline:local`, `npm run preview`, `npm run pipeline:raw` then `?raw=1`.
7. Security: where the key lives.

- [ ] **Step 1:** Write the README, taking every number from the current `public/data/latest.json`.
- [ ] **Step 2:** Run `npm test` → PASS (no-secrets covers README too).
- [ ] **Step 3:** Commit and push: `git commit -m "docs: README with decisions"` and `git push`.
