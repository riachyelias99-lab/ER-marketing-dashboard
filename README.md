# ER Marketing Dashboard

**Live dashboard: https://er-marketing-dashboard.vercel.app**

A dashboard an agency owner opens on Monday morning to see **where next month's marketing budget should go**. It compares every lead source on lead volume, pipeline progress, conversion and closed revenue, using data pulled from GoHighLevel (GHL) every day and cleaned before anything is shown.

## How it works

```
GHL API ──► 1. FETCH ──► 2. VALIDATE ──► 3. CLEAN ──► 4. CALCULATE ──► 5. PUBLISH ──► Dashboard (Vercel)
           (read-only)   health checks    ruleset v1    metrics, advice,   JSON files
                         (quality gate)   + audit log   insight text       in the repo
```

- **Every morning** (GitHub Actions, 04:00 UTC = 06:00 Beirut in winter, 07:00 in summer), a Node.js program runs the 5 steps.
- **If the health checks pass**, it commits fresh data files to `public/data/`. Vercel redeploys the page automatically.
- **If a check fails** (e.g. GHL sent incomplete data), it publishes nothing new. The page keeps yesterday's numbers and shows a yellow note with the "last updated" date.
- **The page is static.** It only reads the published JSON, never calls GHL, and never sees the API key.

## How to read the dashboard (for the owner)

1. **Headline numbers:** real leads, how many entered the pipeline, sales won and closed revenue — the size of the business at a glance.
2. **The ladder, then the verdict:** every source on one scale — the bar is its revenue per lead, the vertical line is the agency average. Underneath, the same answer grouped into three columns: invest more, keep steady, consider cutting. Start here.
3. **Lead volume:** how many real leads each source brought.
4. **Where deals are now:** which of the 8 pipeline stages each source's deals sit in.
5. **Conversion:** pick two sources and compare how far their leads get, step by step.
6. **Revenue:** closed revenue per source, plus estimates. ⚠️ means a sale's value looked wrong and wasn't counted.
7. **Records left out:** follow the **see why** link under the date for everything that was excluded, and why. **NEW** = caught in the last 7 days. "Back to the dashboard" returns.

## Decisions (one line each, with the reason)

**Which data belongs to the agency**
- Scope = contacts in the GHL **"Sales Pipeline"** or tagged **`dash-project`**: that's the brief's 8-stage pipeline and the tag on this dataset; everything else in the shared sandbox belongs to other users.
- For new records, **membership of the Sales Pipeline decides**: real new leads won't carry the dataset tag, so the tag is extra confirmation, not a requirement.

**Ruleset v1: records removed** (in this order; each record is removed by at most one rule, so the counts always add up)
- **A1 Not this agency's:** no tag and no Sales Pipeline deal. Other sandbox users' data, so it's shown only as a count, not listed, so strangers' names aren't published and the alert isn't triggered by other people's activity.
- **A2 Demo record:** a `demo-data`/`sandbox` tag, or the whole word "demo" in a name, email, company, deal or tag. These are demo data, not leads. Whole-word matching protects names like "Demos" or "Demolition".
- **A3 Test record:** the whole word "test", "dummy" or "fake" in the same fields. These are test entries.
- **A3b Unverified pipeline entry:** in the pipeline with neither the agency tag nor a source. It can't be credited to any channel, so it can't inform a budget decision.
- **A4 Internal:** tagged `internal`. Staff and partners aren't customers, and they would inflate their source's lead count.
- **A5 Duplicate:** the same person matched by email (ignoring `.2`-style copy markers, only when the original exists), phone, or name + company. The copy is removed, keeping the one with a deal or the furthest-advanced deal, because a copy counts a person twice, under the wrong source.

**Ruleset v1: records kept but adjusted**
- **A6 Missing source** → shown as "Unknown source", never hidden, so the owner can see it. It gets no advice card (you can't fund an unnamed channel).
- **A7 Unreliable dollar value** (more than 5× the typical deal, or a won deal at $0) → the sale still counts, the dollars don't. **Numbers are never invented**: a guessed value would be fiction presented as fact.
- **A8 $0 on an open deal** → kept as-is. It most likely isn't priced yet, and it doesn't affect revenue.
- **A9 Stage and status disagree** → the stage is trusted, because it's what the owner sees in the pipeline.

**Health checks (the quality gate)**
- **B0/B1:** GHL must answer, and we must receive exactly the number of records GHL reports. A half download looks like a collapse in leads.
- **B2:** the Sales Pipeline must still exist with its 8 stage names. A renamed stage would silently break the funnel.
- **B3:** clean leads may not drop more than 20% since the last update. Leads don't vanish overnight, so a drop signals a data problem.
- **B4 (warning):** a never-seen source name is published with a note, so a new channel is noticed, not hidden.
- **B5 (warning):** a note appears if cleaning removes more than 40% of records, meaning something unusual came in.
- **Consistency:** stage counts must add up to the totals, or nothing is published (the brief's consistency rule).
- **On failure:** keep yesterday's numbers and show "Today's update was paused…" plus "last updated". Wrong numbers on a Monday morning would cost the owner's trust.

**Metrics and advice**
- **Funnel ("reached at least"):** Lead → Entered pipeline → Qualified (not Disqualified) → Booked a call → Attended the call → Won. The 8 stages aren't a straight line, so each step counts everyone who got at least that far.
- **"Lost" is assumed to happen after a sales call**, since it's the outcome of a conversation, unlike Disqualified, Cancelled or No Show.
- **Revenue per lead** (closed revenue ÷ leads) is the budget yardstick: there's no ad-spend data, and it answers "what is one more lead from this source worth?".
- **The average is agency-wide** (total revenue ÷ total leads), not the mean of the sources, so small sources don't distort it.
- **±25% band:** at least 25% above average → Invest more, at least 25% below → Consider cutting. This way nobody is told to cut a channel merely for ranking last among similar ones.
- **20-lead minimum** before a source gets advice, because small numbers produce lucky, unreliable percentages.
- **A source with an ignored sale value is never put in "Consider cutting"**: its revenue is understated by our own correction, not by poor performance.
- **No trend or month-by-month view:** all leads were imported on one day, so dates can't show trends, and a timeline would mislead.
- **Projections are labelled estimates:** "every 10 more leads ≈ …" and "expected from open deals" repeat past results; they aren't promises.
- **Insight sentences are rule-based** (templates filled with the same numbers as the charts), so text and charts can never disagree. AI-written text is planned for v2.

**Alerts and privacy**
- **New suspicious records** (removed or value-ignored) get a 🔔 alert and a NEW badge for **7 days**, since the owner checks weekly. "New" is measured against our own previous snapshot, because GHL's dates are all the same.
- **Emails are masked** (`fa***@example.com`) on the public page, as a real agency must not publish customer emails.
- **The link is open (no login) in v1**, so the owner just clicks it. The page contains no keys and only made-up data.

**Tech choices**
- **GitHub Actions + Vercel:** free, no server to maintain, and Git history doubles as the audit log of every daily run.
- **Plain HTML + Chart.js, no framework:** fewer moving parts and every file readable. Chart.js is pinned to 4.4.1.
- **The page, its code and its data are told to revalidate on every visit** (`vercel.json`), because a browser that reuses yesterday's JavaScript against today's numbers would quietly show the wrong dashboard.
- **The API key lives only in GitHub Secrets** (and in a local, git-ignored `.env`). An automated test fails if a key pattern appears in any committable file.
- **One scale instead of three lists:** sources are ranked on a single axis against the agency average, so how far above or below the line a source sits is visible, not just which group it fell into.
- **Charts:** colour means something: green = won, blues = still moving, greys = dead ends; "Closed" sits first against the axis (the only directly comparable segment); every chart has labels or a table view. No pie charts.
- **The stage colours are three ramps, not eight arbitrary hues**, and each was checked with a palette validator against the exact surface it sits on: monotone lightness, a visible gap between steps, and a pale end that still reads against the panel. Light and dark get their own steps rather than one being flipped into the other.
- **In dark mode, further along the journey = brighter.** The same ramp inverted, because on a dark panel a darker colour recedes, which would have made the most advanced stages the hardest to see.
- **The two compared funnels are blue and coral**, not blue and violet: violet tested at ΔE 2.0 under deuteranopia, meaning red-green colourblind viewers could not have told the two sources apart.
- **The ±25% band is explained in words, not shaded on the ladder.** On a near-opaque panel the tint read as a second, ghostly bar, and the verdict was already carried by the bar's colour and its label.
- **Frosted panels over a lit field, but the panels stay near-opaque where numbers live**, so text and chart contrast cannot drift as the background passes behind them.
- **The pipeline is pinned by its id**, not just its name, because anyone in the shared sandbox could create another "Sales Pipeline".
- **The answer is a list, not a paragraph.** Under the ladder, the verdict is three short columns of channel names in large type, rather than sentences repeating the per-lead figures the bars already show. The owner should be able to read the decision without reading prose; the method and the caveats stay underneath in fine print.
- **Every ⚠️ mark leads to the deal it is about.** A warning that an owner cannot act on is just worry, so each mark links to the list of ignored dollar values. In the revenue chart the mark is painted on the canvas and cannot be a link, so the whole row of a flagged source is clickable and the cursor changes on the way in. "Too few leads to judge" stays a plain mark: it is not a data fault and there is nothing to show.

## Data quality results (current data)

| Step | Removed | Records left |
|---|---:|---:|
| All contacts in the sandbox | | 420 |
| Not this agency's (other users) | 65 | 355 |
| Demo record | 33 | 322 |
| Test record | 0 | 322 |
| Unverified pipeline entry | 1 | 321 |
| Internal | 15 | 306 |
| Duplicate | 12 | **294 real leads** |

**7 deal values were ignored** (the deals still count): six at $145,000 (≈20× the typical $7,000 deal) and one won deal at $0. Without cleaning, total revenue would read **$480,750 instead of $190,750**. The raw data would also tell the owner to *invest* in Facebook Ad, entirely because of a $145,000 typing error.

## Running it locally

```bash
npm test                                         # run all automated tests
npm run pipeline:local                           # live run against GHL (needs .env with GHL_API_KEY, GHL_LOCATION_ID)
node pipeline/run.mjs --from-file recon/raw      # run from saved downloads instead of calling GHL
npm run pipeline:raw                             # "Stage 1": uncleaned version → open http://localhost:8080/?raw=1
npm run preview                                  # serve the dashboard at http://localhost:8080
```

Demo of the safety net: in GitHub → Actions → "Daily dashboard update" → **Run workflow**, tick **Simulate a broken day**. The page then shows the paused note. Run it again normally to restore.

## Project layout

- `pipeline/`: fetch (`ghl.mjs`), rules (`rules.mjs`, `annotate.mjs`, `clean.mjs`), metrics, advice, insights, health checks, tracking, and the daily `run.mjs`
- `public/`: the dashboard (HTML/CSS/JS) and the published `data/`
- `test/`: automated tests, including one that replays the real data and checks the 420 → 294 waterfall
- `docs/superpowers/`: the design spec and the build plan

## Planned for v2

- An "Accept anyway" button on removed records (password-protected, decisions stored in a database)
- AI-written summaries, allowed only to rephrase the calculated numbers
- An email alert for new suspicious records (Gmail via n8n)
