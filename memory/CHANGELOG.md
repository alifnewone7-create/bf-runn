# Changelog — Binary Fund Global

## 2026-02 — Emergent decoupling + runtime Google config
- **CORS**: Hardcoded `allow_origins=["*"]` in `/app/backend/server.py` (env-independent).
- **Frontend backend URL**: `REACT_APP_BACKEND_URL` set to `https://api.binaryfundglobal.com` (user's VPS). No more Emergent preview URL in codebase.
- **Removed** `REACT_APP_GOOGLE_CLIENT_ID` from `/app/frontend/.env`. Google Client ID is now fetched at runtime from backend `/api/config/public`.
- **New endpoint**: `GET /api/config/public` → returns `{ google_client_id }` from backend env `GOOGLE_CLIENT_ID`.
- **New context**: `/app/frontend/src/context/ConfigContext.jsx` — fetches public config once on mount, provides via `useAppConfig()`.
- **App.js**: renders routes only after config loads; `GoogleOAuthProvider clientId` now comes from context, not env.
- **GoogleButton**: uses `useAppConfig()` — auto disables when backend `GOOGLE_CLIENT_ID` is empty, auto enables when user fills it in backend `.env`.
- **New**: `/app/backend/.env.example` template with all required VPS env vars (DATABASE_URL, REDIS_URL, JWT_SECRET, CORS_ORIGINS, admin, GOOGLE_CLIENT_ID/SECRET).
- **Tests**: removed hardcoded Emergent URL from `/app/backend/tests/backend_test.py`.

## Earlier
- Cloned `b-fund-run` repo. Local supervisor `dbservices` runs PostgreSQL 15 + Redis. Backend unmodified except CORS + config endpoint + Google env-driven wiring described above.

## 2026-06 (fork) — Demo-trade UI polish
- Renamed HIGHER/LOWER buttons to UP/DOWN (desktop + mobile) with circular arrow icon badges (Quotex-inspired, unique style) and richer 3-stop gradients.
- Desktop chart: replaced horizontal TF strip + GMT clock with Quotex-style vertical 4-icon tool rail (TF, drawing, chart type, indicators) on left-center and local time + UTC offset chip at top-left.
- Desktop trade panel: UP/DOWN now sit directly below the "Your payout" card.
- Files: frontend/src/components/trade/TradePanel.jsx, TradeChart.jsx
- Note: VPS admin password no longer matches memory creds; created test user agent.tester@binaryfundglobal.com on VPS for UI verification. VPS still seeds $500 demo wallet (known P2 issue).

## 2026-06 (fork) — Candle glide animation
- TradeChart.jsx: tick-by-tick price interpolation added. New ticks now set a glide target; every RAF frame the displayed close eases toward it with exponential smoothing (~220ms constant). Candle, wick, pulse dot, dashed line and price tag all glide continuously — no more per-tick jumps. Target resets on symbol/TF switch.

## 2026-06 (fork) — SFX v2 "heavy" redesign
- User feedback: sounds too normal/quiet. Rewrote /app/frontend/src/lib/sfx.js:
  - Master gain 0.5 → 1.0 with DynamicsCompressor to keep loud layers punchy without clipping.
  - New building blocks: filtered noise bursts (swoosh/impact), sub-bass kick-style pitch-drop (`sub()`), detuned layered oscillators.
  - UP: laser swoosh rise (saw+square detuned + rising noise sweep + sub punch + top sparkle).
  - DOWN: heavy falling swoosh + deep bass drop (mirror of UP).
  - WIN: casino-style 5-note C-major arp (triangle + detuned saw + octave shimmer) + sub impact + highpass sparkle wash + long bell tail.
  - LOSS: cinematic long sub drop to 32Hz + descending growl + second thud + subtle dissonance.
- Desktop-only guard + localStorage bfg_sfx toggle unchanged. API unchanged (up/down/win/lose/unlockAudio).

## 2026-06 (fork) — SFX v3: professional MP3 assets
- User feedback: synth sounds not professional. Replaced synthesis with real royalty-free Mixkit MP3s in /app/frontend/public/sounds/: up.mp3 (forward chime, mixkit 1107), down.mp3 (back chime, 1108), win.mp3 (coin win, 2069), lose.mp3 (losing tone, 2042).
- sfx.js rewritten: fetch + decodeAudioData → AudioBuffer playback via Web Audio (autoplay-safe for WS-fired win/lose), master gain 1.0, per-sound volume map, auto-preload on first pointerdown (desktop only). API unchanged (up/down/win/lose/unlockAudio), desktop-only guard + bfg_sfx toggle intact.

## 2026-06-10 — VPS API wiring (frontend only)
- Added `REACT_APP_API_BASE=https://api.binaryfundglobal.com` to `/app/frontend/.env` (apiBase.js prefers it over REACT_APP_BACKEND_URL). Preview URL untouched.
- Fixed `src/context/ConfigContext.jsx`: removed `controller.abort()` from the effect cleanup, which (with React StrictMode double-mount) aborted every `/api/config/public` call and left googleClientId empty.
- Verified: home + /login render, VPS returns config 200 with correct CORS for the preview origin, Google GSI script now loads.

## 2026-06-10 — Chart drawing editor rebuilt (TradingView-style)
- Root cause 1: `DrawingLayer.onDown` hit-tested every pointerdown, including presses on the floating style bar → drawing got deselected and the bar unmounted before the click fired, so no edit ever applied. Fixed with an early return on `e.target.closest('[data-chart-overlay]')` (attr added to style bar, draw-mode chip, mobile panel).
- Root cause 2: bar used `absolute left-1/2 -translate-x-1/2` + `tp-fade-up` (transform animation) → appeared right-shifted then snapped to centre. Centring moved to an outer `flex justify-center` wrapper (pointer-events-none) with the animation on the inner bar.
- New compact bar: grip · PEN → 18-swatch colour popover (`DRAW_PALETTE`) · LINE(—▾) → solid/dashed/dotted + thickness stepper (−/+, clamped 1..10) · eye · trash · close. Gradient emerald theme + accent glow border. Desktop = top centre, mobile = bottom centre with popovers opening upward.
- Verified by testing agent (iteration_34.json): 10/10 desktop + mobile flows PASS, centre offset 0.0px.

## 2026-06-10 — Pan-lock: drawings no longer drift left (bug fix)
- Symptom: after the left-pan lock stopped the candles, continuing to drag left made drawings (rectangle/line) slide left away from their candles.
- RCA: DrawingLayer is a child, so its rAF paint loop is registered BEFORE the parent's clamp loop. On frames where the drag had pushed the visible logical range past the lock, the drawing painted with the over-panned timeScale while the series painted at the clamped position (measured: drawing x alternated 573→337→…→7 while the newest candle stayed at 737).
- Fix: `TradeChart` now exposes `panExcessPxRef.current()` (over-pan gap in px, derived from the same `panExcessBars` helper the clamp uses); `DrawingLayer` feeds it to `makeConverters({ xShift })` — added in `x(t)`, subtracted in `t(x)` so hit-testing stays consistent. Measured after fix: drawing x stable within 2px.
- Verified by testing agent (iteration_35.json): desktop mouse drag + mobile touch/fling, pan-lock ratio 0.50 intact, style bar + creation/drag regressions PASS.

## 2026-08-10 — Drawings flicker/vanish during pan (bug fix, from user video)
- User video showed a rectangle blinking out for most frames while panning and looking like it drifted left.
- RCA: `geom.makeConverters().x(t)` used `ts.logicalToCoordinate()`, which returns null once a logical index falls outside the CURRENT visible range → `toPx()`/`buildGeometry()` returned null → the WHOLE shape was skipped on those frames (flicker), and the frames it did paint used the over-panned range (apparent left drift).
- Fix: x(t) and t(x) now fall back to a linear map derived from `getVisibleLogicalRange()` + pane width (same coordinate space, so no seam), still applying `xShift`.
- Verified by testing agent (iteration_36.json): rectangle/trend line/horizontal line, desktop + mobile touch/fling → 0 blank frames, 0 blink transitions; drawing pinned within 2px at the pan lock while candles pinned at 0px.
- NOTE: VPS access tokens expire in 15 minutes; register a throwaway account for each test run (see /app/memory/test_credentials.md).

## 2026-08-10 — Drawings now painted inside the chart's render pass (glitch fix, 2nd user video)
- Symptom (frame analysis of the user's recording): while dragging left, the rectangle jumped ~20-40px VERTICALLY between consecutive frames and blinked — drawing not in sync with candles.
- RCA (two layers):
  1. The overlay had its OWN rAF paint loop. The price scale auto-scales during a pan, so there was a 1-frame window where the drawing used the previous price→pixel scale while the candles had already redrawn with the new one.
  2. `geom.js` used `ts.logicalToCoordinate()` / `series.priceToCoordinate()`, which return null or CLAMP outside the visible range → off-screen points either vanished or got pinned to the pane edge.
- Fix:
  1. `DrawingLayer` now attaches a lightweight-charts v5 **series primitive** (`series.attachPrimitive`) whose paneView renderer calls `paint()`, so drawings paint in the same render pass as the candles. `requestUpdate` (stored in `requestRef`) is called on state/draft/resize changes so no repaint is missed.
  2. `makeConverters()` samples `logicalToCoordinate` at 25%/75% of the visible logical range and `coordinateToPrice` at 25%/75% of pane height, then maps ALL points linearly from those references — exact inside the pane, correctly extrapolated outside it.
- Verified by testing agent (iteration_37.json): drawing↔candle vertical offset CONSTANT (241px, 0 drift) across 40 sampled frames, 0 blank frames, leftmost 8 canvas columns empty after aggressive pan past the lock, every style edit repaints on the next frame, reload persistence + timeframe switch + mobile all PASS, no lightweight-charts warnings.

## 2026-08-11 — Indicators (29) with per-instance settings + backend persistence
- Frontend (`src/components/trade/indicators/`):
  - `catalog.js` — 29 indicators in 2 groups. Trend/overlay: Alligator, Bollinger Bands, Envelopes, Fractal, Ichimoku Cloud, Keltner, Donchian, Supertrend, Moving Average (SMA/EMA/WMA/SMMA + source), Parabolic SAR, Zig Zag. Oscillators (own pane): ADX, Aroon, AO, Bears/Bulls power, CCI, DeMarker, ATR, MACD, Momentum, RSI, ROC, Stochastic, Schaff Trend Cycle, Vortex, Volume Oscillator, Williams %R, Weis Waves Volume. Each has editable params (period/colour/width/method/source…).
  - `calc.js` — all maths (Wilder SMMA for RSI/ATR/ADX, population stdev for BB, Ichimoku ±kijun shifts, Alligator 8/5/3 shifts…). Volume for the 2 volume indicators is **MOCKED**: approximated from candle range because the OTC feed has no volume.
  - `IndicatorLayer.jsx` — real chart series; overlays on the price pane, each oscillator gets `chart.addPane()` with stretch factors (candles keep ≥60%). Teardown removes series only (removePane shifts indices → orphan panes). Throttled 200ms feed loop with a data stamp short-circuit.
  - `useIndicators.js` — socket.io persistence (`indicators/get·save·delete·clear`, `indicators/changed`) + localStorage mirror + offline outbox (same contract as useDrawings).
  - `IndicatorPanel.jsx` — Quotex-style catalogue + active list + per-instance settings block. Rail buttons: `desk-rail-indicators` / `rail-indicators`.
- Backend (**written, user deploys to their VPS**): `indicators.py`, `ChartIndicator` model, `chart_indicators` migration in `seed.py`, 4 socket handlers in `routes/sio_hub.py`, and `deploy/deploy_indicators.sh` (base64 self-contained, backs up + syntax-checks + restarts + verifies table).
- Verified by testing agent (iteration_38.json): 100% — all 29 render, maths independently re-implemented in Python against 500 live candles and matched, settings/clamping/multi-instance/pane sizing/hide/delete/clear/reload persistence/per-pair isolation/live updates/mobile/drawing regression all PASS, 0 console errors.

## 2026-08-12 — Smooth live chart motion + per-candle countdown (from user's Quotex video)
- Continuous live-edge scroll: the rAF drain loop now calls `ts.scrollToPosition(baseOff + frac)` every frame where `frac` = elapsed fraction of the live bar, so the view drifts smoothly instead of jumping a whole bar at each new candle. Follow pauses on `pointerdown` and resumes on release only if the user is parked within 2.5 bars of the live edge; wheel-zoom keeps follow. `wrapRef.dataset.liveFollow` exposes the state for tests.
- Follow target is capped by `maxRightBarsRef` (the pan-lock ceiling) — without it the lock clamp and the follow cancelled each other on narrow/mobile/zoomed panes and the chart appeared frozen (iteration_39 issue #2).
- Candle countdown badge (`data-testid=candle-countdown`) on the live price line, mm:ss until the bar closes, driven by a server-clock anchor taken from the tick stream (`serverClockRef` + `serverNow()`), so it is correct even if the user's clock is off. Follows the selected timeframe.
- Default zoom: `barSpacing` 22 (desktop) / 12 (panes < 700px) instead of fitting ~500 hairline candles — matches the reference video's big candles. `minBarSpacing` lowered to 3 so users can still zoom right out.
- The forming candle already glided via 220ms exponential smoothing toward the tick target (unchanged).
- MEASUREMENT NOTE for future debugging: `live-vert-line-top` marks the LIVE CANDLE, which legitimately advances one slot per new bar — it cannot be used to detect view jumps. Use a fixed drawing sampled off `drawing-canvas` instead.
- Verified by testing agent (iteration_40.json, after iteration_39 raised 2 issues): 1432 frames with drawings + RSI + a $1 DEMO trade active → max frame-to-frame view jump 1px, 0 jumps >3px, 0px delta at rollovers; mobile + zoom follow stays engaged; drawings/indicators/trade all aligned; no console errors.

## 2026-06 (fork) — Balance badge redesign v2
- DemoTrade balance badge: stacked pro layout (account label on top, balance below), gradient icon chip with glow per account type (amber/sky/violet/gold)
- Mobile compact sizes: 22px icon, 12px balance text, tighter padding; desktop slightly larger
- Removed old side-by-side chip pill; `badge.chip`/`badge.color` keys dropped from ACCOUNT_BADGES

## 2026-06 — AccountSwitcher redesign (agentic edit)
- Desktop: compact centered dialog (420px) — active account hero (icon + big balance + label), no "Choose an account" title, no rules grid, no "Start $" line
- Mobile: vaul bottom-sheet Drawer (slides up like Quotex reference)
- Rows: unlocked account tap = direct switch; locked account tap/Purchase pill = navigate /challenges
- Backend /api/accounts now returns `days_left` (from active Challenge.ended_at) — frontend shows "Xd left" chips + hero "X days left"; guards null (VPS old backend safe)
- NOTE: VPS backend must be redeployed for days_left to appear live

## 2026-06 — "Account type changed" confirmation modal
- After successful switch, shows modal: from-account (dim icon, label, balance) → to-account (gradient icon, colored label, balance), green Close button
- Tested via playwright with mocked /api/accounts + /switch (desktop + mobile); real switch verified visually updates header badge

## 2026-06 — Mobile drawer restyle (Quotex-like)
- Mobile drawer: segmented account tabs at top (active tab highlighted with icon color), hero balance below
- Active account removed from rows list on mobile; no ACTIVE chip on mobile (desktop keeps it)
- Unlocked non-active rows show ⇄ switch icon button on mobile; rows now say "X Account"

### Chart candle-close backward-shift — final verification (2026-06, fork session)
User video (EUR/AUD 5s, real BASIC account) showed 12px (1-bar) left shift per candle close = pre-fix behavior.
Re-verified current preview code pixel-level: 5s tf, candle dragged to mid-screen (clamp limit), 14 frames across 3 candle closes -> history 0px shift, live edge marches right. Fix (shiftVisibleRangeOnNewBar:false + no RAF autoscroll in TradeChart.jsx) confirmed working.
User confirmed: "akhon shob thik ache no more changes need". Video was from stale/production build.
Throwaway VPS QA account: qa.chart.1786864600761104835@mailinator.com / QaTest#12345 (VPS tokens expire 15 min; register fresh per run).
