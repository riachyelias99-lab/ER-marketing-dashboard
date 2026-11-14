# Loom script — ER Marketing Dashboard (target 2:50, max 3:00)

## Before you hit record

**1. Make the "paused day" evidence.** In GitHub → Actions → Daily dashboard update → **Run workflow** with **Simulate a broken day ticked**. Wait for it to finish (~30s), then open the live site in a tab — it shows the yellow paused note. **Leave that tab alone, do not reload it.**

**2. Put it back to normal.** Run the workflow again with the box **unticked**. Wait for green.

**3. Build the uncleaned version locally.**

```bash
npm run pipeline:raw
```

```bash
npm run preview
```

**4. Open these tabs, in this order:**

| Tab | What's in it |
|---|---|
| 1 | https://er-marketing-dashboard.vercel.app (healthy, reloaded) |
| 2 | The same site, still showing the **yellow paused note** from step 1 |
| 3 | http://localhost:8080/?raw=1 — the uncleaned version |
| 4 | GitHub → Actions, showing both runs |
| 5 | The repository README |

Close everything else. Mute notifications.

---

## The script

### 0:00 – 0:22 · The answer first
**Tab 1, top of page.**

> "This is a marketing dashboard for an agency owner. All the data comes from GoHighLevel and it refreshes itself every morning.
> Two hundred and ninety-four real leads, twenty-eight of them became clients, worth a hundred and ninety thousand dollars. And underneath, the question the owner actually has: where should the money be invested?"

### 0:22 – 0:57 · The ladder
**Scroll to the ladder. Point at the vertical line.**

> "Every source sits on one scale: how much revenue one lead from it is worth. This line is the agency average — six hundred and forty-nine dollars.
> Instagram Ad and Billboard clear it at about a thousand and eighty a lead, so that's where the money goes.
> And look at Referral. It brings the most leads — forty-six, more than anything else — but each is worth four hundred and eighteen, well under the average. Counting leads alone would have sent the budget to the wrong place."

### 0:57 – 1:18 · The evidence
**Scroll through sections 1 to 4, roughly five seconds each.**

> "Underneath, the evidence, in order. How many leads each source brought. Where those deals sit across the eight pipeline stages — green is won, blue is still moving, grey is dead. How far leads get, where you can compare any two sources side by side. And what each source actually earned."

### 1:18 – 2:06 · Hard case one: the data is dirty
**Tab 3 (the raw version), then Tab 1, then click one of the ⚠️ marks.**

> "Now the hard part. Here is the same dashboard with the cleaning switched off. It claims four hundred and eighty thousand dollars, and tells you to invest in Facebook Ad.
> Both wrong. Facebook Ad has one deal typed as a hundred and forty-five thousand, when every real deal is between fifteen hundred and twelve thousand.
> It would also cut Webinar and LinkedIn Outreach — two of the four best channels.
> Everything removed is listed with its reason: four hundred and twenty records down to two hundred and ninety-four. Other users' records, demo data, internal contacts, duplicates.
> The sale still counts; only the broken amount is left out. And every warning mark clicks through to the deal behind it."

### 2:06 – 2:29 · Hard case two: a broken morning
**Tab 2 (the paused note), then Tab 4 (GitHub).**

> "Second hard case: what if GoHighLevel sends bad data? I tested that. Six health checks run before anything is published. If one fails, nothing new goes out — the owner keeps yesterday's correct numbers and sees this note telling them why.
> That's the run that produced it, and it shows red so I get an email."

### 2:29 – 2:50 · How it runs, and the key
**Tab 4, then Tab 5.**

> "Every morning, GitHub runs the tests first, then fetches, cleans and publishes. The API key lives in GitHub's secrets — it never reaches the browser, and a test fails the build if it ever appears in the code.
> Every decision and its reason is in the README. Thanks for watching."

---

## Delivery notes

- **Slow down.** Three minutes feels long when you're nervous and short when you're reading.
- **Move the mouse to what you're saying.** Point at the average line when you say "average".
- **Don't read it word for word.** Know the four landmarks: the answer, the ladder, the dirty data, the broken day.
- If you fluff a line, pause for two seconds and say it again — easier to trim than a muddle.
- Record at 1920×1080 if you can, and zoom the browser to about 110% so numbers are readable.

## The numbers, if you're asked

| | |
|---|---|
| Leads after cleaning | 294 of 420 (126 removed) |
| Deals / sales / revenue | 204 / 28 / $190,750 |
| Agency average | $649 per lead |
| Uncleaned revenue | $480,750 — $290,000 of it fake |
| Deal values ignored | 7 (six at $145,000, one won deal at $0) |
| Automated tests | 95 |
| Best / worst per lead | Instagram Ad $1,086 · Facebook Ad $189 |
| Most leads | Referral, 46 — but only $418 a lead |
| Uncleaned view also shows | 355 leads, and 3 sources that aren't real: Instagram DM, Website, Unknown source |
| Uncleaned verdicts | Invest in Facebook Ad; cut Webinar and LinkedIn Outreach |

**If someone asks why the uncleaned view shows 355 leads, not 420:** the uncleaned view still leaves out the 65 records belonging to other users of the shared sandbox — those are not the agency's data in any version. Everything else is switched off: demo records, internal contacts, duplicates and the broken dollar values are all left in.
