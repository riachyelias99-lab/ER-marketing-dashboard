# ER Marketing Dashboard — Design (v1)

Date: 2026-11-12 · Owner of the project: ER (beginner; practice project 1 of an AI program)

## 1. Intent and why

An agency has run paid acquisition for three months. All its data lives in GoHighLevel (GHL): contacts (leads) with a source, and an 8-stage "Sales Pipeline" of deals (GHL calls them opportunities). The owner has no consolidated view. They want a page they open on **Monday morning** that tells them, without anyone explaining it, **where to put next month's budget**.

There is no ad-spend data, so the advice must rest on **volume, conversion and revenue by source**. The data is messy, and it sits in a **shared sandbox** with other students' records, so deciding what belongs to the agency and what is junk is the real work. The owner must be able to see what was removed and why.

The dashboard is graded on: works end to end, survives hard cases, every decision justified (README, one line each), usable by a non-technical person alone. Deliverables: live shareable link, README, Loom (≤3 min, English) showing it working including the hard cases.

## 2. Goals

- A standalone web page (not inside GHL) at a public, shareable link.
- Every metric **by source, never blended**: lead volume, pipeline position across the 8 stages, stage-to-stage conversion, closed revenue.
- Answer first, evidence after: budget advice at the top, charts below in the order volume → pipeline → conversion → revenue.
- Plain-language, rule-based insight sentences next to the charts.
- A daily automatic refresh with a validation step (a data quality gate) that never publishes broken data.
- Full transparency: a "Removed records" tab showing counts per rule, every removed record, and every record kept with an ignored dollar value.
- An alert when newly arrived records look suspicious.

## 3. Non-goals (v1)

- No trend over time or month-by-month view (see §5 — the data has no usable dates).
- No ad-spend / ROAS metrics (no spend data).
- No writing to GHL. The pipeline is **read-only** against GHL.
- No login, no password, no "refresh now" button on the page.
- No AI-written text, no email alerts, no "accept anyway" override (all v2, see §13).

## 4. Anti-goals (would be a failure even if it "works")

- **The API key reaching the browser**, a screenshot, the Loom, or the public repo. A leaked key fails the project outright.
- **Invented numbers.** A bad dollar value is never replaced with a guess.
- Text and charts disagreeing (e.g. a sentence says 48 leads, the bar shows 47). All numbers come from one calculation.
- Stage breakdowns that don't sum to the reported totals.
- Publishing a half-downloaded or broken day over a good one.
- Jargon or charts that need explaining: no pie charts with many slices, no overloaded combo charts.
- A small source ranked "best" on a lucky handful of leads.

## 5. Facts about the data (from read-only recon on 2026-11-12)

GHL sandbox: location id (kept in GitHub Secrets, not in the repo), API base `https://services.leadconnectorhq.com`, headers `Authorization: Bearer <key>` and `Version: 2021-07-28`. Endpoints used: `GET /opportunities/pipelines?locationId=`, `GET /contacts/?locationId=&limit=100` (follow `meta.nextPageUrl`), `GET /opportunities/search?location_id=&limit=100&page=N`. Responses include `meta.total` for completeness checks. A working read-only fetch script exists at `recon/fetch.mjs` (reads the key from `.env`).

Snapshot totals: 420 contacts, 286 deals, 21 pipelines.

- **Agency pipeline:** name "Sales Pipeline", id `a5UYvGBOnvtiBm0W6H8D`. Stages in GHL order: Qualified Opt In, Disqualified, Booked call, Closed, Cancelled, No Show, Follow Up, Lost. 238 deals.
- **Agency dataset marker:** tag `dash-project` on 321 contacts, all `dateAdded` 2026-09-04 (one bulk import, so there are no usable dates). 9 sources: Referral, Website Form, Facebook Ad, Billboard, Google Search, Webinar, Instagram Ad, Cold Email, LinkedIn Outreach. 204 of them have a Sales Pipeline deal; at most one deal per contact.
- **Junk found:**
  - 15 contacts tagged `internal`, all "Website Form", with no deals.
  - 12 duplicate pairs, e.g. `fadi.gerges161@example.com` and `fadi.gerges161.2@example.com`. The copy has no deal and a different source; one copy is tagged `dq - duplicate`.
  - No contact has a phone number, and no two emails are exactly equal.
  - 32 contacts tagged `demo-data` + `sandbox` sit in the Sales Pipeline without `dash-project`. They were created 2026-09-01, use a source ("Instagram DM") no agency lead has, and 4 are Disqualified-but-won.
  - Two other students' test entries sit in the Sales Pipeline (names withheld here): one with a `demo@example.com` address, company "Demo Company" and a deal named "TEST - LeadPulse Website Inquiry" ($100, no source); one with only a personal email, no source, no tag, $0, added 2026-10-30.
- **Deal values (agency):** normal range $1,500–$12,000 in $250 steps, median $7,000. Six deals at exactly $145,000, two of them Closed/won (Facebook Ad, Instagram Ad). Nine at $0, one of them Closed/won (Webinar).
- **Stage/status mismatch:** 2 agency deals are "Disqualified" with status "open" (both $0, Website Form).
- Raw dumps live in `recon/raw/` (gitignored).

## 6. Data pipeline (ETL) — decided

One Node.js program, run daily by **GitHub Actions** at **6:00 AM Beirut time**:

1. **Fetch** all pipelines, contacts and deals (paginated, retry on HTTP 429, fail on other errors).
2. **Validate:** health checks on the whole batch (§8).
3. **Clean:** apply ruleset v1 to each record (§7), building an audit of every removal and every ignored value.
4. **Calculate** all metrics and insight sentences from the cleaned data (§9, §10).
5. **Publish:** if no health check failed, commit the new data files to the repo. Vercel redeploys the static page automatically on each commit. If a check failed, commit only the status file; the published data stays as it was.

- **Secrets:** the GHL key lives only in GitHub Actions Secrets (and in the local, gitignored `.env`). The page is static and reads only already-computed JSON. It never calls GHL.
- **Manual runs:** GitHub's "Run workflow" button triggers a run on demand. It takes an input **"simulate a broken day"** (manual runs only): the run pretends GHL returned only half the contacts, so the completeness check fails and the fallback note appears. A normal manual run afterwards restores everything. This exists to demo the hard case in the Loom.
- **Stage 1 (local only):** the program can also run locally with cleaning switched off, producing a raw, uncleaned version of the dashboard for learning and for the before/after part of the Loom. The live link only ever shows cleaned data.
- **First run:** there is no previous snapshot, so the "sudden drop" check is skipped, and every flagged record counts as already known (no flood of "new" alerts). *(builder's call, set by Claude)*

## 7. Ruleset v1 — record-level rules (decided)

Rules run **in this order**. Each record is removed by **at most one rule** (the first that catches it), so the counts form a waterfall that sums exactly. Every rule has a plain-English reason shown to the owner. Rules must be **general**, not tuned to today's quirks.

Before matching, text is normalised: lowercase, trimmed, internal spaces collapsed.

| # | Rule | Detect | Action |
|---|---|---|---|
| A1 | Not this agency's | Contact has no `dash-project` tag **and** no deal in the Sales Pipeline | Remove |
| A2 | Demo record | Tag `demo-data` or `sandbox`, or the **whole word** "demo" in name, email, company, deal name or tags (so "Demos" and "Demolition" are *not* matched) | Remove |
| A3 | Test record | Whole word "test", "dummy" or "fake" in name, email, company, deal name or tags (e.g. `leadpulse-test`, `backdate-test`) | Remove |
| A3b | Unverified pipeline entry | In the Sales Pipeline but **no** `dash-project` tag **and** no source. Without the tag and a source it can't be attributed to any of the agency's channels; in the sandbox it is another user's manual entry. *(Claude's call)* | Remove |
| A4 | Internal | Tag `internal` | Remove |
| A5 | Duplicate | Same person, matched on any of: (a) normalised email where a trailing `.<digits>` before the `@` is ignored, but only when the base address also exists; (b) normalised phone digits; (c) normalised full name **and** the same company. Within a group, keep the record with a Sales Pipeline deal; then the furthest-advanced deal; then the earliest `dateAdded`. Remove the others, together with any deals they carry. Tag `dq - duplicate` also marks a record as the copy. | Remove copies |
| A6 | Missing source | Agency record with a blank source | **Keep**, shown as "Unknown source" |
| A7 | Unreliable dollar value | Deal value more than 5× the median of the agency's non-zero deal values, or a Closed/won deal with $0 | **Keep the lead, the deal and the sale**. Ignore only the dollars. Badge (§11). |
| A8 | $0 on an open deal | Value $0, deal not won | **Keep as-is** ("not priced yet"). It doesn't affect revenue. |
| A9 | Stage vs status disagree | e.g. stage "Disqualified" with status "open" | **Trust the stage**. Record it in the audit. |

**What counts as the agency's (decided):** a record is in scope if it has a deal in the **Sales Pipeline** **or** carries the `dash-project` tag. For new records arriving later, the Sales Pipeline is the deciding signal: an untagged record with a source and a Sales Pipeline deal **counts** as agency data unless a later rule (A2–A5) removes it. The tag is extra confirmation, not a requirement. Untagged contacts with no Sales Pipeline deal are out of scope (A1).

**Source attribution:** contact `source` first, then the deal's `source`, otherwise "Unknown source".

**Expected waterfall with today's data** (the builder must verify against the live data): 420 → 355 after A1 (−65) → 322 after A2 (−33: 32 demo-data + the "Demo Company" test entry) → 322 after A3 (0) → 321 after A3b (−1: the untagged, source-less test entry) → 306 after A4 (−15) → **294** after A5 (−12). Deals kept: 204. Values ignored under A7: 6 × $145,000 + 1 × $0 won = 7 deals. *(The grilling said "8": the earlier count included the "Demo Company" $100 deal, which is now removed by A2.)*

## 8. Health checks — batch-level (decided)

| # | Check | On failure |
|---|---|---|
| B0 | GHL answered without errors (after retries) | 🔴 fail |
| B1 | Received exactly `meta.total` contacts and deals | 🔴 fail |
| B2 | "Sales Pipeline" exists with the same 8 stage names | 🔴 fail |
| B3 | Clean leads didn't drop more than 20% vs the last published run (skipped on first run) | 🔴 fail |
| B4 | A source name appears that the last published run hasn't seen | 🟡 warn: publish, with a note naming the source |
| B5 | Cleaning removed more than 40% of agency-scope records (contacts left after A1) | 🟡 warn: publish, with a note |

- 🔴 **Fail:** don't publish new data. The page keeps showing the last good data, with a yellow note: *"Today's update was paused because the data looked incomplete — showing data from <date>."*
- **"Last updated"** always shows the time of the last **successful** publish, in Beirut time.
- 🟡 **Warn:** publish, and show the note in the top bar.

## 9. Metrics (decided) — all per source

- **Leads** = clean contacts.
- **Deals** = clean contacts with a Sales Pipeline deal.
- **Where deals are now** = count of deals per current stage. The 8 stages per source must sum to that source's Deals, and the sources must sum to total Deals. This is checked in code before publishing; a mismatch fails the run.
- **Funnel** ("reached at least"), 6 steps:
  1. Lead
  2. Entered pipeline
  3. Qualified = every stage except Disqualified
  4. Booked a call = Booked call + Cancelled + No Show + Follow Up + Closed + Lost
  5. Attended the call = Follow Up + Closed + Lost
  6. Won = Closed

  "Lost" is assumed to happen **after** a sales conversation; state this in the README.
- **Step-to-step conversion** = step n ÷ step n−1. Also show overall Lead → Won.
- **Sales** = deals in Closed, including those with ignored values.
- **Closed revenue** = sum of Closed deal values, excluding A7-ignored values.
- **Revenue per lead** = closed revenue ÷ leads. This is the primary budget metric.
- **Close rate** = sales ÷ leads.
- **"What if" projection:** "every 10 extra leads ≈ X sales, ≈ $Y", from 10 × sales/lead and 10 × revenue/lead. Labelled "estimate based on past results".
- **Open-pipeline forecast:** open deals (Qualified Opt In, Booked call, Follow Up) × the source's win rate among decided deals (won ÷ (won + Disqualified + Cancelled + No Show + Lost)) × the source's average trusted won value (falling back to the agency-wide average). Labelled "estimate".
- **Small-sample rule:** a source with **fewer than 20 leads** gets a ⚠️ "too few leads to judge" badge and gets no projections. It is excluded from the advice cards but still shown in every chart.

## 10. Budget advice and insight text (decided)

- **Advice cards:** compare each eligible source's revenue per lead to the **agency-wide average** = total closed revenue of eligible sources ÷ total leads of eligible sources. This is "what an average lead is worth", *not* the mean of the per-source figures. *(decided)*
- **A source with an ignored won-deal value (A7) can never be placed in "Consider cutting".** Its revenue is understated by our own correction, not by poor performance. If its numbers would put it in the red card, it goes to 🟡 "Keep steady" with ⚠️ "Can't judge fairly — a sale's value is missing". It may still qualify for "Invest more". *(decided)*
- Bands:
  - 🟢 **Invest more:** ≥ 25% above average
  - 🔴 **Consider cutting:** ≥ 25% below average
  - 🟡 **Keep steady:** in between

  Each card lists its sources with a one-line reason built from the numbers (e.g. "Referral: $X per lead, 1.6× the average").
- **"Unknown source" never gets an advice card**: you can't budget for a channel you can't name. It still appears in the charts. *(Claude's call)*
- **Insight sentences** are **rule-based templates** filled with the same computed numbers as the charts: one or two per section. Exact wording is the builder's call. They must be plain English, no jargon, and must handle edge cases (ties, a source with 0 sales, all sources in one band).
- No trend predictions. Only the two labelled projections in §9.

## 11. The page (decided)

Plain **HTML + CSS + JavaScript + Chart.js**, no framework, hosted on **Vercel**, open link, no login. Currency **USD**. Works on laptop and phone. *(responsive: Claude's call)*

**Top bar**
- Title: "Marketing Performance — Where should next month's budget go?"
- "Last updated: <Beirut time>"
- The yellow fallback/warning note when relevant.
- 🔔 **New-record alert** when relevant: "N new suspicious records since <date> — review", linking to the Removed records tab.
- One line: "Based on N real leads. M records were left out — see why."

**Tab 1 — Overview**, top to bottom:
0. **Budget advice:** the three cards, then a **scorecard table** with one row per source: leads, sales, close rate, closed revenue, revenue per lead. Sorted by revenue per lead, best first, with ⚠️ badges for few leads and for ignored values.
1. **Lead volume:** bar chart by source, sorted descending, plus an insight sentence.
2. **Where deals are now:** horizontal stacked bar per source across the 8 stages. Blues = still moving, green = Closed, greys = dead ends. Each bar's total is printed at its end, plus an insight sentence.
3. **Conversion:** funnel chart with a "Compare: [Source A] vs [Source B]" picker showing two funnels side by side (default: the top two by revenue per lead). Below it, a table of every source's step-to-step rates, plus an insight sentence.
4. **Revenue:** bar chart of closed revenue by source, sorted descending, with revenue per lead and the open-pipeline forecast shown alongside (labelled estimates). ⚠️ on a bar whose source has ignored values, with hover text such as: "1 sale has an unreliable value ($145,000) — not counted. Revenue may be understated."
5. **How we calculated this:** a plain-English footer covering definitions, the "Lost" assumption, the full list of ignored values, and why there is no timeline.

**Tab 2 — Removed records**
- The **waterfall** (420 → … → 294), one step per rule, each with its plain-English reason.
- **A1 ("Not this agency's") appears only as a count** in the waterfall. Those records are not listed, don't trigger the new-record alert, and aren't written to the committed audit files. They are other sandbox users' data, unrelated to the agency: listing them would publish strangers' names and fire the alert almost daily. *(Claude's call, from the builder check)*
- **Removed list** (rules A2–A5): name, source, rule, reason, masked email (first 2 characters + `***@domain`), date first caught. Records first caught in the last **7 days** get a **NEW** badge and are sorted to the top.
- **"Kept, but dollar value ignored" list:** deal name, source, stage, ignored value, reason, with NEW badges on the same basis.

**New-record detection:** each run compares the IDs in today's removed and ignored-value lists against the previous published snapshot. IDs not seen before get a "first caught" date of today. "New" lasts 7 days. This uses our own snapshots, not GHL's `dateAdded`.

## 12. Repository, storage and naming

- Public GitHub repo **`ER-marketing-dashboard`**. Vercel project with the same name, created by signing in to Vercel with the user's GitHub account. Everything the user creates carries the `ER-` prefix.
- `.gitignore` already excludes `.env`, `recon/raw/`, `node_modules/`, `.vercel`. The repo must never contain the key or the raw dumps.
- Committed data files *(names: builder's call)*:
  - the latest published dashboard data
  - a run status file (last attempt, last success, result, notes)
  - a dated per-run audit file kept as history

  Git history doubles as the audit log.
- Scheduling: GitHub cron is UTC and can run late by some minutes. Beirut is UTC+2 in winter and UTC+3 in summer. Pick a UTC time that lands at about 6:00 local and document it. *(builder's call)* The workflow needs permission to push commits.

## 13. Deferred to v2 (do not build now)

- "Accept anyway" button on removed records, with an allowlist stored in a database (e.g. Supabase) and password protection.
- AI-written insight text (Gemini or similar), allowed only to rephrase precomputed numbers.
- Email alert for new suspicious records (Gmail via n8n).

## 14. Hard cases to demonstrate (Loom)

- The broken-day simulation → yellow note + "last updated" fallback, then recovery.
- ⚠️ badges for ignored $145,000 / $0 wins, and the "kept, but dollar value ignored" list.
- The Removed records waterfall and the NEW badges.
- A small source (<20 leads) badge, if present. Otherwise show that the rule exists in the footer/README.
- The page on a phone-width screen.

## 14b. Robustness to new data shapes *(Claude's call, from the builder check)*

Today every contact has at most one deal, and every deal has a contact. The pipeline must still handle these cases gracefully, log each in the audit, and have test fixtures for them:
- **A contact with several Sales Pipeline deals:** use the furthest-advanced deal for that lead.
- **A deal with no matching contact.**
- **A test/demo word in only one field.**
- **An untagged record with a source and a Sales Pipeline deal.**

## 15. Left to the builder

File and folder layout, data file formats and names, chart colours and styling, the exact wording of insight templates (within §10), the exact cron time, testing approach, and how the local Stage 1 raw mode is switched on.

## 16. Deliverables checklist

Live Vercel link · public repo with README (how it works + every decision, one line each, including every rule in §7–§10 and its reason) · Loom ≤3 min in English covering §14 · no key anywhere public.
