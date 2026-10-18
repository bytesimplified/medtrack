# App shell

The three screens use hash links (`#today`, `#medicines`, `#insights`) so direct
links, refresh, and browser Back/Forward work without server routing. Unknown
hashes fall back to Today. Active navigation is announced using `aria-current`;
page changes focus the main region and update the document title. A skip link
moves focus without changing the active page.

The same navigation sits at the bottom on mobile and in a sidebar on desktop.
Controls have 44px minimum targets, visible focus rings, and semantic labels.
`Button`, `Card`, `Input`, and `EmptyState` provide reusable building blocks.

Light, Dark, and Device preferences are available in the header. Device follows
system changes. The choice uses the `medtrack.theme` localStorage key. Invalid
values fall back to Device; blocked storage still permits switching for the
current visit and shows a persistence message. This stores only appearance.

Screens are empty states. Registration, dose actions, inventory, and analytics
are intentionally introduced by later planned PRs. No fabricated medicine
records or placeholder data are shown.

## Verification

`npm run check` covers navigation, direct links, history events, keyboard focus,
form labeling, disabled buttons, theme persistence, device changes, and blocked
storage. CI also runs `test/e2e/ui-smoke.mjs` against the production build
in Chromium at desktop and 390px/320px mobile widths. It checks actual links,
Back/reload, themes, overflow, tap targets, and runtime errors, and uploads UI
screenshots. Playwright is pinned as temporary CI tooling; PR 11 will add the
full registration/dose/refill end-to-end suite.
