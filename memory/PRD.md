# Binary Fund Global — frontend workspace (repo: alifnewone7-create/brain-b)

## Setup
- Repo cloned into /app as-is. Only the FRONTEND runs here (CRA + craco, port 3000).
- Backend runs on the user's VPS: https://api.binaryfundglobal.com. Local supervisor `backend` is intentionally STOPPED — never start it.
- /app/frontend/.env: REACT_APP_API_BASE + REACT_APP_BACKEND_URL = https://api.binaryfundglobal.com (src/lib/apiBase.js reads these).

## Implemented (2026-06)
- 2026-06: Candle countdown badge moved ~1 candle-width (timeScale barSpacing) right of the running candle, centred on the live price line (TradeChart.jsx RAF loop).
- 2026-06: Crosshair lag fix — removed per-frame layout thrash: overlays positioned with CSS transforms (write-if-changed via setXform/setStyle), offsetWidth/Height cached (400ms WeakMap), host size cached via ResizeObserver (hostSizeRef), DrawingLayer.paint() no longer reads clientWidth/Height per paint.
- Verified by testing agent (iteration_42.json): 0 long tasks over a 5s crosshair sweep, badge offset scales with zoom, pan/zoom + vertical dashed line regressions pass.
- 2026-06: Crosshair replaced with a pointer-driven DOM crosshair (canvas crosshair off: mode 2, lines invisible). Dashed vert/horz divs + price/time labels move via transform inside the `pointerrawupdate` handler → zero-latency tracking. Verified (iteration_43.json): 0px offset at every sampled position, 0 long tasks, correct hide on pointerleave/axis, tracking exact after zoom.

## Backlog
- 2026-06: Pair-switch lock removed — `requestSwitchActive()` no longer blocks while trades are open (tab close still guarded, toast retitled "Trade running"). Also fixed duplicate settled-trade rows: `s_orders/close` now dedupes history by trade id (legacy `trade_closed` fired for the same trade). Verified iteration_49/50: free switching, trades settle while away, 0 React duplicate-key warnings, balance credited once.
- 2026-06: Drawing drag pixel-smoothness. Root cause: `geom.js` `makeConverters` sampling anchor never populated on the live chart → `cv.t()` fell back to `coordinateToLogical` (integer bar index) so drags jumped a whole candle. Fix: deterministic anchor from `ts.options().barSpacing` + `timeToCoordinate(last bar)`, fractional seconds (no `Math.round`), and `paint()` now runs synchronously in the pointermove handler (one frame less latency). Verified iteration_48: 0 zero-delta steps and no >4px jumps across 30×2px / 40×1px / handle-resize / rubber-band sweeps (iter47 had 10-step zero-runs + 22-36px jumps), stored `t` fractional, 0 longtasks, persistence + all regressions pass.
- 2026-06: Drawing hover affordances — `cursorFor()` in DrawingLayer maps a hover hit to `move` (body) / `nwse-resize`·`nesw-resize` (corner handles) / `ns-resize` (horizontal line) / `ew-resize` (vertical line); `crosshair` while a tool is armed, `grabbing` while dragging the body. rAF-throttled passive hover hit-test on the chart host. Verified iteration_46 (100%, 0 longtasks, 0 console errors).
- 2026-06: Drawing tools UX — drag/resize now rAF-coalesced with points in a ref (single state commit on pointerup) so movement is frame-smooth; `hitTest` also tests filled interiors (`inPoly`) so a click anywhere on a shape opens the style bar; every tool pick auto-selects a random palette colour (never repeating the previous); style bar has a copy button (`draw-copy-selected`) that clones the shape 3 bars right with identical style. Verified iteration_45 (100% frontend, 0 console errors).
- 2026-06: Entry-dot jitter + wrong settlement result.
  - Frontend (live here): `trade/place` now sends `clientTickT` (timestamp of the tick the trader saw); optimistic badge carries `_requestId` and is swapped out in the same state update as the confirmed trade (no transient duplicate dot / 6px fan-apart); close reconcile thresholds 1200ms/700ms. Verified iteration_44 (1 dot at all times, no crash, crosshair/overlay regressions clean).
  - Backend (repo only — user deploys): `Engine.price_at(sym, ts)`; entry price read from server tick history at `clientTickT` (window -3s/+0.5s); `_settle_one` uses price at `expiry_at`; settle loop 1s → 100ms. Ship via `backend/deploy/patch_trade_price.sh` on the VPS (/opt/bfg-backend). Unit-verified (17 pytest cases in backend/tests/test_price_at_and_patch.py); the residual 1.17px dot step disappears only after the VPS patch is applied.
- P2: Mobile/touch pass on the countdown badge placement on narrow panes.
- P2: Confirm drawing tools + indicators visual regression after the transform refactor.


## Session — 2026-06 (Emergent E1, frontend-only run against VPS API)
Backend runs on the user's VPS (https://api.binaryfundglobal.com); local backend supervisor is intentionally STOPPED.
frontend/.env: REACT_APP_BACKEND_URL + REACT_APP_API_BASE = https://api.binaryfundglobal.com

Changes (all verified by testing agent, reports iteration_51..54):
- DemoTrade asset tabs: running-trade Lock icon removed.
- TradeChart price axis: vertical scaling is shrink-only (drag down = smaller, drag up only back to default) via symmetric scaleMargins + autoScale; chart no longer drifts vertically while scaling; ns-resize hover cursor restored manually.
- TradeChart live follow: removed continuous fractional right-drift (view fixed during a forming candle, one-bar discrete shift on new candle); panning left no longer auto-snaps back to the live edge.
- Added jump-to-live arrow button (data-testid=jump-to-live-button) shown only while browsing history.
- Candle countdown raised to z-12 so drawing-tool lines never cover it.
- Fixed giant/stale candle after returning from a hidden tab: forced refetch on visibilitychange (>3s away) + RAF gap guard (tick bucket more than one tf ahead => refetch instead of synthesizing a bridging candle); stale cache entry deleted on forced reload.

Backlog / next: reset-zoom on price-axis double click, mobile two-finger vertical shrink, split TradeChart.jsx (1400+ lines), suspend RAF loops when document.hidden, clear reloadPendingRef in the socket callback instead of a 1200ms timer.

### Payout fixes (2026-06)
- Frontend: payout table kept in its own state + localStorage cache ('bfg_payouts'), merged over instruments at render time (fixes 0% race between HTTP /instruments and socket 'markets/payouts'); unknown payout renders as an em dash, never 0%. Admin changes propagate live via the same socket event.
- Backend (NEEDS VPS DEPLOY): backend/routes/ws_routes.py _settle_one now takes the payout LIVE from engine.meta[symbol]['payout'] at settlement (falls back to order.payout_pct) and writes it back on the order, so a payout changed mid-trade applies to that trade's result.

### Settlement outage fix (2026-06)
Cause: VPS's deployed market.py is older and has no Engine.price_at; the repo's ws_routes.py called it, so settle_loop raised every tick and NO expired trade ever settled (the batch aborted before any order).
Fix in backend/routes/ws_routes.py (NEEDS VPS DEPLOY): _exit_price() getattr-guards price_at with fallback to price(); _live_payout() guards payouts()/meta with fallback to the order's payout; no price -> refund instead of hanging; settle_loop wraps each order in try/except so one bad order can't block the batch.
Regressions: tests/test_settle_legacy_engine.py + tests/test_settle_legacy_engine_extended.py (both exit 0).

### 'Not authenticated' on trade place (2026-06)
Cause: trades go over socket.io; the client froze the JWT at mount (auth: {token}) and the server binds the sid to a user in a BACKGROUND task. So a fast first click raced the binding, and after any reconnect with an expired short-lived token the sid stayed unauthenticated until a page refresh.
Frontend fix (live): socket auth is a callback reading localStorage on every (re)connect; explicit 'auth' emit on connect; ensureAuthed() (single in-flight promise) refreshes the token via /api/auth/refresh, re-auths, and cycles the socket as last resort; trade/place re-auths + retries once on a 'Not authenticated' ack (both the connected and the pre-connect grace paths); pre-connect click waits up to 900ms for the socket.
Backend fix (NEEDS VPS DEPLOY): backend/routes/sio_hub.py on_trade_place inline-authenticates from payload.token when the sid isn't bound yet ('token' stripped before PlaceTradeRequest).
Verified: iteration_57 + iteration_58 (6 trades, 0 auth errors, 1 refresh per click, no double placement).

### Challenges page + Binance Pay purchase (2026-06)
New frontend page /challenges (login required, redirects to /login?next=/challenges): 3 plans (Basic $25/$1,000, Standard $50/$2,500 popular, Premium $80/$5,000) with rules + perks + Purchase button -> 'Purchase Challenge' overlay -> Binance Pay -> exact USDT amount, Binance ID 728424294 (copy button), name 'Binary Fund Global', digits-only Order ID box.
Backend (NEEDS VPS DEPLOY): binance_pay.py (server-side verification via /sapi/v1/pay/transactions, 24h lookback, requires C2C + USDT + exact amount + incoming + our receiver id, stores payer info), routes/purchase_routes.py (GET /api/challenges/plans, POST /api/challenges/purchase, GET /api/challenges/purchases, GET /api/admin/purchases), models.ChallengePurchase + seed.py CREATE TABLE challenge_purchases, server.py router wiring, trade_routes ACCOUNT_PLANS updated (fees 25/50/80 + full rules incl. per_trade_pct placeholders).
On success: order id locked (unique), plan unlocked in profile.unlocked_accounts, wallet funded with plan balance, Challenge row created (target/daily loss/max loss/duration).
Admin: new Purchases tab in AdminPortal with all purchase details + row detail modal.
.env additions (deploy on VPS): BINANCE_API_KEY, BINANCE_API_SECRET, BFG_BINANCE_ID=728424294, BFG_BINANCE_NAME.
Verified: tests/test_binance_pay.py + tests/test_binance_pay_extended.py (16 cases, exit 0) + full frontend flow with stubbed API (iteration_59).
NOT YET IMPLEMENTED: enforcement of the trading rules (daily profit cap, daily/max loss, profit target, 13/15/18-day expiry) and per-trade amount limits.
