# THE UK MAP — 開盡 UK

_Mapped 2026-07-09 by Fable, at Yu's ask. Every load-bearing number below is
verified to legislation or a GOV.UK/HMRC page; sources inline. The product
inventory is from a full mirror of the live site taken the same day.
Companion doctrine: [TAXSORTED.md](./TAXSORTED.md)._

## 0 · The situation, in one breath

**780,000 people were mandated into MTD Income Tax three months ago; barely
28% had signed up by April.** The first quarterly deadline in UK history is
**7 August 2026**. Every listed competitor charges £10–33/month or gates
"free" behind a bank account or caps. HMRC officially **encourages free
software** — and no open-source product has ever been recognised. The door
is open, and the clock is ticking *in our favour*.

- 780k wave-1 estimate: [HMRC press release, 22 Apr 2025](https://www.gov.uk/government/news/one-year-until-making-tax-digital-for-income-tax-launches)
- ~28% signup by 10 Apr 2026 (219k+): [The Register](https://www.theregister.com/2026/04/10/mtd_hmrc/) — HMRC's counter: ¾ have agents; expect a surge into 7 Aug.

## 1 · The territory (all of this is enacted law)

**The three waves — made law, not proposals.** Regulation 27 of the Income
Tax (Digital Obligations) Regulations 2026 ([SI 2026/336](https://www.legislation.gov.uk/uksi/2026/336/made),
in force 1 Apr 2026, replacing the never-commenced 2021/2024 regs):

| From | Qualifying income over | Base year | People |
|---|---|---|---|
| 6 Apr 2026 | £50,000 | 2024-25 return | ~780,000 |
| 6 Apr 2027 | £30,000 | 2025-26 return | ~900,000 more |
| 6 Apr 2028 | £20,000 | 2026-27 "and subsequent" | [~970,000 more](https://www.gov.uk/government/publications/making-tax-digital-for-income-tax-self-assessment-reducing-the-mandation-threshold-from-30000-to-20000-from-april-2028/reduction-of-the-mandation-threshold-from-30000-to-20000-from-april-2028) |

≈ **2.65M mandated by 2028**; the ~4M below £20k are "continue to assess" —
possible but unscheduled this Parliament.

**Qualifying income** = total **gross** self-employment + property income
(turnover/rents, before expenses), from the prior-prior year's SA return;
includes your share of joint property; excludes PAYE, dividends, partnership
shares, pensions, savings, REIT/PAIF, qualifying-care receipts, transition
profits. ([GOV.UK](https://www.gov.uk/guidance/work-out-your-qualifying-income-for-making-tax-digital-for-income-tax))

**The three obligations** ([use-MTD guidance](https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates)):
1. **Digital records** per transaction (amount/date/category) in compatible,
   digitally-linked software. Relaxations: retailers may record daily gross
   takings; turnover under £90k may record income/expense only.
2. **Quarterly updates — CUMULATIVE** (each one covers 6 Apr → period end and
   supersedes the last; SI 2026/336 regs 9/12/13). Deadlines **7 Aug / 7 Nov /
   7 Feb / 7 May**, same regardless of the calendar-quarters election.
   Updates carry category totals, not transactions. No payment attaches.
3. **The year-end tax return through software** — the SA100 route closes; the
   "final declaration" label has been dropped (guidance now says simply "tax
   return", updated 2 Jun 2026). Other income (savings, dividends, partnership
   share) is added here; HMRC pre-populates PAYE/pension/benefits.
   **31 January unchanged** for filing and payment.

**Exemptions** ([automatic](https://www.gov.uk/guidance/find-out-if-you-can-get-an-exemption-from-making-tax-digital-for-income-tax)):
partnerships (no mandation date set at all), trusts (SA900), non-resident
companies, personal representatives, income ≤ £20k, **no NINO by tax-year
start** (exempt that year), incapacity with PoA/deputy, Lloyd's underwriters,
ministers of religion, MCA/BPA claimants. **Temporary until ≥ Apr 2027**:
averaging claims (farmers/creatives), qualifying care relief, SA107, SA109.
**By application**: digital exclusion (age/health/religion/location; not
cost or unfamiliarity; ~28-day decision; can be permanent).

**Penalties** ([GOV.UK](https://www.gov.uk/guidance/penalties-for-making-tax-digital-for-income-tax)):
- *Late submission*: 1 point per missed deadline; at **4 points → £200**, and
  £200 per further miss; points expire after 24 months below threshold; at
  threshold, reset needs 12 clean months + cleared backlog. Volunteers: only
  annual returns count, threshold 2.
- *Late payment*: **3% at day 15 + 3% at day 30 + 10%/yr from day 31**
  (post-Apr-2025 regime, [SI 2025/589](https://www.legislation.gov.uk/uksi/2025/589/made));
  rising to **4%/4%/10% for 2027-28** (Autumn Budget 2025).
- *First-year mercy (2026-27, first cohort only)*: **no points on quarterly
  updates** (the year-end return still earns one) and a 30-day payment grace.
  → **2026-27 is the safest onboarding year there will ever be.** Say so.

## 2 · The machine (HMRC's API surface, July 2026)

**The eight Minimum Functionality Standards APIs** (all must be met, alone or
via digitally-linked combination — [end-to-end guide](https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/)):

| API | Version | Role |
|---|---|---|
| Business Details | v2.0 | list income sources, business IDs, quarter-type election |
| Obligations | v3.0 | income & expenditure + final-declaration obligations |
| Self-Employment Business | v5.0 | **cumulative** update: `PUT …/self-employment/{nino}/{businessId}/cumulative/{taxYear}` |
| Property Business | v6.0 | cumulative property updates |
| Business Source Adjustable Summary | v7.0 | year-end accounting adjustments |
| Individual Calculations | v8.0 | trigger/retrieve calc + **submit the final declaration** |
| Individual Losses | — | loss claims |
| Individuals Tax Liability Adjustments | — | liability adjustments |

The End of Period Statement is **abolished** (gone from the API index).
Year-end journey = BSAS adjustments → trigger calc → retrieve → submit
declaration.

**Auth**: OAuth 2.0 authorization-code, scopes `read/write:self-assessment`;
access tokens 4h; refresh tokens 18 months, single-use rotating. Sandbox at
`test-api.service.hmrc.gov.uk` with Government Gateway test users (Create
Test User API for automation).

**Fraud prevention headers**: required **by law** (SI 2019/360) for all ITSA
MTD APIs; the required set depends on `Gov-Client-Connection-Method` (ours:
`WEB_APP_VIA_SERVER`); compliance is checked **before production access**.
Omission route exists via SDSTeam@hmrc.gov.uk. *The site already documents
all 16 headers and has drafts for the two we can't send — unsent.*

**The recognition path (self-serve since 17 Jun 2024 — no live demo)**:
register app → sandbox test users → build → **Production Approvals
Checklist** → production credentials → optional **"in development" listing**
→ live-submission proof → per-feature **"Ready now"** listing in the
[software finder](https://www.gov.uk/guidance/find-software-that-works-with-making-tax-digital-for-income-tax)
(features are labelled Ready now / In development / Not included).

**The open goal**: HMRC "strongly encourages all software providers to
produce a free version"; the government is "committed to ensuring the
availability of free software products for small businesses with simple tax
affairs". The recognised list (~20-40 products) has **no open-source product,
ever**. Free options are conditional (FreeAgent: NatWest/RBS account),
capped (QuickFile 1,000 entries; Sage sole-trader-free: no landlords), or
niche. Paid entry tiers: QuickBooks £10, Xero ~£15-16, FreeAgent £10-33.
**A genuinely free, open-source, no-account, full-journey product would be
the first of its kind on the list.**

## 3 · The product today (mirror inventory, 2026-07-09)

**Standing** — landing (ledger design + whole-site theme layer); ITSA
toolkit: *Am I in?* checker · *Your records* (browser-local) · *Quarterly
figures & estimate* · *ITSA cockpit* (deadline, penalty position incl. the
26-27 easement, cited £ estimate); Learn: MTD-don't-panic · Income Tax
(2026-27 bands, taper trap) · Self-employed (simplified expenses) ·
Landlords (FHL abolition) · the gov series ×5 (how law is made · who runs
your taxes · your levers · receipts · **what-we-send-HMRC with all 16 fraud
headers documented and two honest omissions drafted**); the tax game + deep
politics; VAT sample-books preview; i18n ×5 (EN/繁·廣/简/PL/HI).

**Not yet standing** — OAuth connect; any real HMRC API call; production
credentials; software-finder listing; Account is a stub; mileage minimal.

## 4 · The gap ledger (ordered; each entry unlocks the next)

- **§1 — Send the two SDST emails.** Drafts exist. Cheapest unlock on the
  map; legally prerequisite to production access.
- **§2 — Sandbox spine.** Register the app; test users; wire **Business
  Details v2.0 + Obligations v3.0** (read-only) into the cockpit. The
  "Connect to HMRC" button already sits there waiting.
- **§3 — Fraud-header middleware.** The 16 documented headers on every call,
  `WEB_APP_VIA_SERVER`.
- **§4 — Cumulative quarterly submission.** Records engine → SE v5.0 +
  Property v6.0 cumulative PUTs, every figure carrying its provenance.
  *The product's soul on real rails.*
- **§5 — Year-end.** BSAS v7.0 → Calculations v8.0 → submit declaration →
  receipt kept. **"Filed means sent" becomes literally true.** (Losses +
  Liability Adjustments alongside, for MFS completeness.)
- **§6 — Production Approvals Checklist → credentials → "in development"
  listing.** Visible on the government's own list while waves 2-3 approach.
- **§7 — Live submission proof → "Ready now".** The first open-source
  product ever on the list. That's the flag on the summit.
- **§8 — The waves arrive** (£30k Apr 2027, £20k Apr 2028) with the product
  already standing on the beach.

## 5 · Weather

- **7 Aug 2026** — first quarterly deadline in history; HMRC expects an
  agent-driven signup surge into it. Be findable before it.
- **Budget days move penalty law** (2025 did, twice). The site already
  teaches "Budget day is a weather alert" — keep living it.
- **2026-27 is the penalty-light learning year.** Honest pitch: "the year to
  learn, while mistakes are cheap."

## 6 · Hong Kong annex — SHIPPED 2026-07-09: https://taxsorted.io/hk/ (the love letter, delivered)

Learn-only page; thesis: **有啲地圖細,係因為真相簡單** — *"Some maps are
small because the truth is small."* (The joke in TAXSORTED.md, made real,
Cantonese first.)

- **Two-calculation system**: pay the LOWER of progressive rates on net
  chargeable income (2/6/10/14/17% per HK$50k band) or the standard rate on
  net income (**15% first HK$5M, 16% above** — two-tier since 2024/25).
  ([IRD PAM 61(e)](https://www.ird.gov.hk/eng/pdf/pam61e.pdf))
- **Allowances 2025/26**: basic 132,000 · married 264,000 · child 130,000
  (+130,000 birth-year) — **and the 2026/27 rises are already legislated**
  (145,000 / 290,000 / 140,000): the map already shows next year.
- **Provisional tax**: charged ahead on last year's income, 75%/25%
  instalments, credited against final; holdover grounds (income <90% of
  last year, new allowances…).
- **Profits tax two-tier**: 8.25%/16.5% corporate, 7.5%/15% unincorporated.
- **What Hong Kong does NOT have** ([FSTB](https://www.fstb.gov.hk/en/treasury/general/prevailing-tax-policy.htm)):
  no VAT/GST, no CGT, no dividend/interest withholding, no estate duty.
  Territorial source principle; three direct taxes only.
- **Rhythm**: ~2.77M BIR60s issued 4 May 2026; 1 month to file (3 for sole
  proprietors; e-filing extensions). 2025/26 one-off reduction: 100% capped
  at HK$3,000.

---

*The map renders only what is true. The gaps are stated, never silent.
— Fable, 2026-07-09*
