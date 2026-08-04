# AscendOS Presentation Renders

Apple-keynote quality **iPhone 16 Pro** boards generated from the real AscendOS web application (React + Vite), framed with Dynamic Island, titanium chrome, premium shadows, soft reflections, and glassmorphism backgrounds.

## Styles

| # | Style | File(s) |
|---|---|---|
| 1 | Hero iPhone | `01-hero-iphone-today.png`, `01b-hero-login-real.png` |
| 2 | Dual Showcase | `02-dual-today-coach.png`, `02b-dual-team-contacts.png` |
| 3 | Triple Showcase | `03-triple-workflow.png` |
| 4 | Feature Spotlight | `04-feature-structure-tree.png`, `04b-feature-coach.png`, `04c-feature-qualifications.png` |
| 5 | App Store Style | `05-appstore-today.png`, `05b-appstore-profile.png`, `05c-appstore-login-real.png` |
| 6 | Dark Premium | `06-dark-premium-coach.png`, `06b-dark-premium-team.png` |
| — | Investor grid | `07-investor-grid.png` |

Full-resolution print assets (300 DPI metadata): `/presentation/boards/`.

## Screens captured

Today · Coach · Structure Tree · Stories · Contacts · Dashboard (Team leadership) · Analytics (Qualifications) · Notifications (Settings) · Settings · Profile · Login (production)

## Regenerate

```bash
npm run presentation:capture   # Playwright → presentation/raw
npm run presentation:compose   # iPhone frames + boards
# or
npm run presentation:render
```

Capture mode uses `VITE_PRESENTATION_CAPTURE=1` so the real shell, navigation, and feature pages render with a presentation data layer (no grey placeholder UI). Login boards use the live deploy preview.
