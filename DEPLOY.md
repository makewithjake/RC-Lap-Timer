# Deploying RC Timer to GitHub Pages

## Repository Structure

After reorganization, the repo has this layout:
- `/index.html` — Marketing landing page (served at root)
- `/styles/landing.css` — Landing page styles
- `/js/landing.js` — Landing page JS
- `/Assets/` — Shared assets (icons, screenshots)
- `/app/` — The RC Lap Timer PWA app
  - `/app/index.html` — PWA entry point
  - `/app/manifest.json` — PWA manifest (scope: /app/)
  - `/app/sw.js` — Service worker (scope: /app/)
  - `/app/js/` — App JavaScript
  - `/app/styles/` — App stylesheets

## GitHub Pages Configuration

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Set branch to `main` and folder to `/ (root)`
5. Click **Save**
6. Your site will be live at `https://USERNAME.github.io/REPO-NAME/`

## Custom Domain (Optional)

1. Update the `CNAME` file at the repo root with your domain (e.g., `rctimer.app`)
2. In GitHub Pages settings, enter your custom domain
3. Configure your DNS:
   - For apex domain (rctimer.app): Add `A` records pointing to GitHub Pages IPs
   - For www subdomain: Add `CNAME` pointing to `USERNAME.github.io`
4. Enable "Enforce HTTPS" in GitHub Pages settings

## GitHub Pages IP Addresses (for DNS A records)

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

## PWA Service Worker Scope

The service worker at `/app/sw.js` is scoped to `/app/`. This means:
- The marketing landing page at `/` is NOT controlled by the service worker
- Only pages under `/app/` are cached by the service worker
- The landing page loads fresh from the network (appropriate for a marketing page)

## Verifying the Deployment

After deploying, verify:
- [ ] `https://yourdomain.com/` loads the marketing landing page
- [ ] `https://yourdomain.com/app/` loads the RC Timer PWA
- [ ] PWA install prompt appears on Android Chrome / Desktop Chromium
- [ ] Service worker registers correctly (check DevTools → Application → Service Workers)
- [ ] Manifest is valid (DevTools → Application → Manifest)
- [ ] Lighthouse score ≥ 90 on Performance, Accessibility, Best Practices, SEO

## Local Development

To test locally with correct paths:

```bash
# Use a simple HTTP server (Python)
python3 -m http.server 8080

# Then visit:
# http://localhost:8080/       ← Marketing page
# http://localhost:8080/app/   ← PWA app
```

Note: Service workers require HTTPS in production. Localhost is whitelisted by browsers for development.
