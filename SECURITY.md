# Security policy

## What this project is

A static digital menu for GitHub Pages. The customer menu and the owner panel both run in the browser; there is no backend, database or account system. Customers can only read the menu; there is no cart or checkout.

## The admin PIN

The panel at `/admin/` (and `/#admin`) is protected by a local PIN (default `1234`, changeable in the panel). It is stored as an FNV hash in `localStorage`, login sessions live in `sessionStorage`, and five wrong attempts lock entry for 30 seconds.

**This is a convenience lock, not authentication.** Anyone who can open the page can read the JavaScript, clear their own browser storage or call the same client-side functions. Do not store confidential data in the panel, do not reuse a sensitive password, and do not treat the PIN as protection against a determined visitor. Real access control requires a server (or a hosted service) that verifies identity and stores data outside the browser.

## Data handling

- Menu edits and the PIN hash are stored in `localStorage` on the owner's own device.
- The published menu is the static `menu-data.json` file in the repository; the owner exports edits from the panel and commits that file.
- Customers never write data; the only stored value on a customer device is nothing at all.
- No analytics, third-party scripts, cookies or external fonts are loaded.
- Every render path escapes user-controlled strings; menu data is validated before it is stored or displayed, including an allow-list for image paths and bounded ingredient lists.

## Automated checks

Pull requests run unit tests, a production build check, `npm audit`, Playwright browser tests, and CodeQL. Dependabot updates npm packages and pinned GitHub Actions weekly. Pages are served with a restrictive Content Security Policy, `no-referrer`, and no inline script or style.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository instead of opening a public issue.
