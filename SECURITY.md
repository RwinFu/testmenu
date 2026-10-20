# Security policy

## Published site and admin access

This project is published on GitHub Pages, which serves static files and does not provide server-side authentication. The production build replaces the graphical `admin.html` editor with a small gateway to GitHub's authenticated JSON editor and excludes `admin.js`; the public menu has no admin link. `npm start` creates a separate local preview at `_local-site/` for the owner to use the graphical editor. Do not host that local preview publicly.

The local editor has no login and saves drafts in the browser. It must not be treated as an authenticated online admin panel. Never put passwords, access tokens, or other secrets in browser code or `localStorage`.

For production menu changes, use GitHub's authenticated repository editor for `menu-data.json` and submit a pull request where possible. Only GitHub accounts with repository write permissions can change the deployed data. An online WYSIWYG admin panel with user authentication requires a backend or hosting with access control; GitHub Pages alone cannot provide it.

## Automated security checks

Pull requests run tests, build the public-only artifact, and audit npm dependencies. CodeQL scans JavaScript, and Dependabot checks npm packages and GitHub Actions weekly. The HTML includes a restrictive Content Security Policy and a no-referrer policy. GitHub Pages does not allow this repository to set arbitrary HTTP response headers; configure branch rules and deployment protection in repository settings for stronger enforcement.

## Reporting a vulnerability

Please report security issues privately to the repository owner through GitHub's private vulnerability reporting, if enabled, instead of opening a public issue.
