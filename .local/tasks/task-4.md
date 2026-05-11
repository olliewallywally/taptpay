---
title: SEO overhaul — NZ POS & EFTPOS keywords
---
# SEO Overhaul — NZ POS & EFTPOS Keywords

## What & Why
TaptPay needs to rank for high-intent NZ search terms: "EFTPOS NZ", "POS system NZ", "digital POS", "POS solutions", "low cost POS system", "point of sale New Zealand", "cheap EFTPOS machine", "cloud POS NZ", "small business POS NZ". Currently the site uses generic payment keywords and is missing core technical SEO infrastructure (sitemap, robots.txt, local schema, FAQ schema). This task implements a comprehensive on-page and technical SEO foundation.

## Done looks like
- Google-crawlable `sitemap.xml` and `robots.txt` served by Express at the root URL
- `index.html` title, description and keywords target all priority NZ POS/EFTPOS terms
- `lang="en-NZ"` on the HTML tag and `og:locale` set to `en_NZ`
- Server-side meta tag injection for the `/` landing route so crawlers get keyword-rich HTML without executing JavaScript
- LocalBusiness + SoftwareApplication JSON-LD schema updated with NZ-specific fields (country, currency NZD, areaServed New Zealand, priceRange)
- A new FAQ JSON-LD block covering common NZ POS/EFTPOS questions (what is EFTPOS NZ, how much does a POS system cost in NZ, do I need an EFTPOS machine, etc.)
- Landing page primary `<h1>` retains brand voice but includes a visible keyword-rich subtitle ("New Zealand's lowest-cost EFTPOS & POS system — no hardware required")
- A new "Why TaptPay?" content section on the landing page with keyword-rich headings and copy targeting: EFTPOS NZ, POS system, digital point of sale, low cost, small business NZ, contactless payments NZ
- Canonical `<link rel="canonical">` tag added to index.html pointing to the production domain
- Open Graph image updated and `og:url` set to production domain
- SEOHead component updated to support per-page canonical URLs and locale

## Out of scope
- Paid advertising or Google Ads campaigns
- Google Search Console setup / submission (manual step for the user)
- Backlink building (off-site SEO)
- Blog or content marketing pages
- Any changes to authenticated merchant pages (dashboard, transactions, settings)

## Tasks

1. **sitemap.xml and robots.txt** — Add an Express route that serves a static `sitemap.xml` listing all public pages (`/`, `/signup`, `/terms`, `/privacy`) with correct production domain and lastmod dates. Add a `robots.txt` allowing all crawlers and pointing to the sitemap URL.

2. **index.html overhaul** — Update `lang` to `en-NZ`. Rewrite title to "TaptPay – Low Cost EFTPOS & POS System NZ | Digital Point of Sale". Rewrite meta description to target NZ POS/EFTPOS searchers. Expand keywords meta to include all priority terms. Add canonical URL. Update og:locale to en_NZ and og:url to production domain.

3. **Structured data upgrade** — Replace/extend existing JSON-LD in index.html with: (a) a LocalBusiness schema including areaServed "New Zealand", address country NZ, currency NZD, priceRange "$"; (b) a SoftwareApplication schema with NZ-specific featureList including "EFTPOS alternative NZ", "Digital POS system", "No EFTPOS machine required"; (c) a new FAQPage schema block with 6–8 Q&As covering the most-searched NZ POS/EFTPOS questions.

4. **Server-side meta injection for landing page** — In Express routes, detect requests to `/` from non-browser user agents (crawlers) and inject keyword-targeted title/description/OG tags directly into the served HTML so Google sees them without executing JS.

5. **Landing page content & headings** — Add a keyword-rich subtitle below the hero h1 visible to both users and crawlers. Add a new "Why TaptPay?" section with h2/h3 headings that naturally include: "EFTPOS NZ", "POS system", "point of sale New Zealand", "no hardware", "low cost", "small business", "contactless payments". Ensure the existing SEOHead component sets canonical and hreflang on the landing page.

## Relevant files
- `client/index.html`
- `client/src/pages/landing-page.tsx`
- `client/src/components/SEOHead.tsx`
- `server/routes.ts`