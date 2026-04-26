# Maximus — SEO Toolkit: Claude Working Instructions

## Project overview
**Maximus** is a multi-tool SEO platform built for **small businesses and freelancers** — not SEO experts. The UI and copy must always stay simple, plain-language, and avoid jargon. Think "non-technical business owner" as the target user.

Live site: **https://app.markotanaskovic.com**
GitHub: `git@github.com:MarkoTanaskovic89/keyword-seo-tool.git`
Deployed via: **Vercel** — auto-deploys on every push to `main`

---

## Deployment rule — ALWAYS push live

**After every change, always commit and push to `main`.** Do not stop at local edits.

```bash
git add <files>
git commit -m "description"
git push origin main
```

The only exception is if the user explicitly says "don't push" or "not live" for that specific task.

---

## Project structure

```
/                          → Homepage (index.html) — landing page + pricing
/keyword-tool              → Keyword Research tool (Google Ads API)
/serp-analyzer             → SERP Competitor Analyzer
/backlink-assistant        → Backlink analysis (Moz API)
/seo-dashboard             → SEO Performance Dashboard (Google Search Console)
/bulk-upload               → Bulk keyword upload (Pro feature)
/api/                      → Vercel serverless functions
```

## Tech stack
- **Frontend**: Plain HTML/CSS/JS — no frameworks, no build step
- **Backend**: Vercel serverless functions (Node.js) in `/api/`
- **Routing**: defined in `vercel.json`

## API integrations
| API | Used for | Env var |
|-----|----------|---------|
| Serper.dev | Real Google SERP results | `SERPER_API_KEY` |
| Moz API | Domain Authority, backlinks | `MOZ_API_TOKEN` |
| Google Ads API | Keyword volume, CPC, competition | `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` |
| Google Search Console | SEO performance dashboard | via OAuth |
| Anthropic Claude API | AI gap analysis in SERP tool | `ANTHROPIC_API_KEY` |
| Stripe / LemonSqueezy | Payments | `STRIPE_*` |

---

## Pricing tiers

| Plan | Price | SERP checks | Notes |
|------|-------|-------------|-------|
| Guest | Free | — | No account, 3 keyword searches to try |
| Free Account | Free | 3 SERP checks | 50 keyword searches/month |
| Basic | $5/mo | 1,000 SERP checks/month | Unlimited keywords, 10 at once |
| Pro | $20/mo | 10,000 SERP checks/month | Everything in Basic + bulk upload, AI outreach |

LemonSqueezy checkout links:
- Basic: `https://markotanaskovic.lemonsqueezy.com/checkout/buy/eb41e07d-040a-4e31-b9e5-ab1c80d91cd7`
- Pro: `https://markotanaskovic.lemonsqueezy.com/checkout/buy/8ed13325-d638-4eca-9d1d-6fff68822b89`

---

## UI/UX principles
- Target user = small business owner or freelancer, not an SEO pro
- Avoid jargon — rename technical terms to plain English (e.g. "Domain Authority" → "Site Authority")
- Fewer metrics is better — only show what matters
- Tooltips must be CSS-based (`.tip` span inside `.metric-pill`) — never use the native HTML `title` attribute, it doesn't look good
- Results in SERP analyzer must be clickable links (open in new tab)

## SERP Analyzer — metric badges
Each result shows exactly 3 badges:
1. **Site Authority** (DA renamed) — color coded: green ≥60, blue ≥40, orange ≥20, red <20 — with plain label (Strong / Good / Average / Low)
2. **Word count** — green ≥1500, orange ≥500, red <500
3. **Backlinks** — neutral pill, shows number of linking domains

CSS tooltip class `.tip` is used inside `.metric-pill` for hover explanations.
