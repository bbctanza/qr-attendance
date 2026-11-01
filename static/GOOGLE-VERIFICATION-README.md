# Google Search Console verification

Needed to request a Safe Browsing review for this deployment.

DNS verification is not available on a `*.vercel.app` subdomain, so use the **HTML file**
method (or the meta-tag method, which goes in `src/app.html`).

## Steps

1. Go to https://search.google.com/search-console and add a **URL prefix** property:
   `https://qr-attendance-bbct-v2.vercel.app`
   (repeat separately for `https://check-in-bbct.vercel.app` — it is a distinct property).
2. Choose **HTML file** verification. Google gives you a file named like
   `google1a2b3c4d5e6f7890.html`.
3. Drop that file into this `static/` directory, commit, and deploy. It will then be served at
   `https://qr-attendance-bbct-v2.vercel.app/google1a2b3c4d5e6f7890.html`.
4. Click **Verify** in Search Console.
5. Go to **Security & Manual Actions → Security Issues** and click **Request Review**.

## What to write in the review request

> This is a private attendance-tracking tool for Bible Baptist Church Tanza. Church members
> check in with a QR code at services and events. The sign-in form is for church staff only;
> we do not solicit credentials, payment details, or personal information from the public.
> The flag appears to be a false positive. The site now has a public landing page describing
> who operates it, a standard sign-in form, and a full set of security headers.

Also optionally report the false positive at:
https://safebrowsing.google.com/safebrowsing/report_error/

Check the current verdict for either hostname at:
https://transparencyreport.google.com/safe-browsing/search

> Note: `robots.txt` must keep allowing `/` so Google can see the landing page. The
> verification file itself is always fetched directly and is unaffected by robots rules.
