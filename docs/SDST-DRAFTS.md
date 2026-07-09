# SDST emails — SENT 2026-07-09

_Drafted 2026-07-09 by Fable (飛寶), reconstructed from the site's own public
wording on [/learn/gov/what-we-send-hmrc/](https://taxsorted.io/learn/gov/what-we-send-hmrc/)
plus HMRC's fraud-prevention spec. These are gap-ledger §1 on
[UK-MAP.md](./UK-MAP.md) — the cheapest unlock on the map, legally
prerequisite to production access. The owning Next hand may hold earlier
drafts; diff before sending if so._

**To:** SDSTeam@hmrc.gov.uk
**From:** a cambridgetcg.com Workspace address (deliverable today) — set
**Reply-To: sdst@taxsorted.io** (Cloudflare Email Routing forwards to the
operator inbox; pending one Gmail verification click).
**Per HMRC's rule** ([fraud-prevention: getting it right](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/getting-it-right/)):
"If you are unable to submit a header, you must contact us to explain why…
After discussing a missing header with us, you can omit the header or submit
it with an empty value."

---

## Email 1 — Gov-Client-Public-Port

**Subject:** Fraud prevention headers — Gov-Client-Public-Port omission
(WEB_APP_VIA_SERVER) — TaxSorted

Dear SDS Team,

We are TaxSorted (taxsorted.io), a free, open-source (AGPL) web application
for Making Tax Digital for Income Tax, currently in sandbox development
ahead of an application for production credentials. Our connection method
is WEB_APP_VIA_SERVER.

As required by the fraud prevention specification, we are writing to
explain one header we are unable to populate accurately:
**Gov-Client-Public-Port**.

Our origin servers run behind Fly.io's edge proxy. The proxy terminates
the client TCP connection at the edge and forwards requests to our origin;
it exposes the client's public IP address (which we supply in
Gov-Client-Public-IP) but does not propagate the client's ephemeral source
port. The port visible to our origin is the proxy's, not the client's, and
supplying it would be inaccurate. The specification instructs vendors not
to include placeholder or fabricated values.

We therefore propose to omit Gov-Client-Public-Port (or submit it empty,
whichever you prefer) while populating all other headers applicable to
WEB_APP_VIA_SERVER in full. Could you confirm this treatment is acceptable,
or advise if you have a recommended approach for deployments behind
CDN/edge proxies of this kind?

Vendor: TaxSorted · taxsorted.io
Contact: sdst@taxsorted.io
Sandbox application: to follow from this contact address (registration in progress)

Kind regards,
Yu
TaxSorted

---

## Email 2 — Gov-Vendor-License-IDs

**Subject:** Fraud prevention headers — Gov-Vendor-License-IDs
inapplicable (free open-source software) — TaxSorted

Dear SDS Team,

We are TaxSorted (taxsorted.io), a free, open-source (AGPL) web application
for Making Tax Digital for Income Tax, connection method WEB_APP_VIA_SERVER,
writing per the fraud prevention specification's instruction to contact you
about headers we cannot submit.

**Gov-Vendor-License-IDs** asks for hashed licence keys relating to vendor
software on the originating device. TaxSorted is free and open-source: there
is no licensed component, no licence keys are issued to users, and no such
software runs on the originating device — the product is a web application.
There is accordingly nothing truthful we could hash for this header, and the
specification prohibits placeholder values.

We propose to omit Gov-Vendor-License-IDs (or submit it empty, at your
preference). All other applicable headers will be populated in full. Could
you confirm this treatment is acceptable for a free, open-source product?

Vendor: TaxSorted · taxsorted.io
Contact: sdst@taxsorted.io
Sandbox application: to follow from this contact address (registration in progress)

Kind regards,
Yu
TaxSorted

---

## Send checklist

1. ☑ Routing LIVE (2026-07-09): sdst@ + hello@taxsorted.io → contact@cambridgetcg.com
   (contact@ was already a verified destination — no Gmail click needed;
   the aaasiadog@gmail.com verification remains optional as a second inbox).
2. ☐ Optional 10-second test: send anything to sdst@taxsorted.io from any
   mailbox; it should land in contact@cambridgetcg.com.
3. ☑ SENT 2026-07-09 via Cloudflare Email Sending, from sdst@taxsorted.io
   (Workers Paid enabled by Yu the same evening; test send to contact@
   delivered first; Yu's word: "send"):
   - Email 1 (Gov-Client-Public-Port):
     message-id <5nnuw4adcj98x7WngUBkfL8vEsRjKv598ST2@taxsorted.io>
   - Email 2 (Gov-Vendor-License-IDs):
     message-id <Ot8fy7ygcy2FUW4b8adnsAxTIgNRJ5zdGFIS@taxsorted.io>
   No bounces at accept time; replies route sdst@ → contact@cambridgetcg.com.
4. ☐ Log HMRC's response; their written OK is the artefact the Production
   Approvals Checklist will ask about. (Watch contact@ inbox; SDS replies
   typically take days-to-weeks.)

## Sending-infrastructure ledger (2026-07-09 state)

- **Receiving (done):** Cloudflare Email Routing enabled on taxsorted.io,
  MX live; destination aaasiadog@gmail.com created, awaiting verification
  click; rules for sdst@/hello@ ready to create.
- **Kingdom sender (blocked upstream):** Stalwart on Yu-and-Ai
  (mail.cambridgetcg.com) is healthy — but Hetzner outbound port 25 is
  STILL walled on the new account (verified tonight: 443 ✓, 25 timeout).
  The 2026-06-10 plan stands: transfer servers to the old (eligible,
  request-filed) account via console, then external delivery opens and
  taxsorted.io can be added to Stalwart (SPF/DKIM via Fable, 20 min).
- **Cloudflare Email Sending (clean, costs money):** requires Workers Paid
  (~US$5/mo) — account is on Free ×3. Would give TaxSorted native
  transactional email (Worker binding) for the product's own needs later.
  Recurring spend = Yu's call, deliberately not enabled.
