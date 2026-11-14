# Kiosk (Tauri) — Plan

> **Status, 2026-11-14.** Days 1-3 are complete and an installable Windows binary exists at
> `src-tauri/target/release/bundle/`. Section 8 (device pairing + PIN) is built on both sides;
> the migration is applied, but **the edge function needs redeploying** for the latest changes.
> The one functional gap is the **heartbeat**: `device-heartbeat` exists server-side and the
> kiosk never calls it, so Revoke and Reset PIN do not yet reach a device. Nothing has been
> tested end to end against real Supabase on a real door.

A dedicated native check-in app for the attendance system. Replaces "a browser left open on
`/scan` in kiosk mode" with a single installable binary that boots into the scanner.

**Deadline: 3 days.** Scope below is deliberately cut to fit that. Anything marked *Deferred*
is intentionally not in v1.

---

## 1. Why this exists

The web app's kiosk mode works, but it inherits browser problems a permanently-stationed
check-in laptop shouldn't have: a dev/preview server to keep alive, browser chrome and tabs to
escape into, F11 fullscreen that any keypress can break, no OS-level autostart, and no control
over what the device does on boot or after a crash.

**Non-goal:** rewriting the system in Rust. The web app stays the system of record for
everything — members, events, analytics, settings, QR generation. This app does exactly one
job: take scans at a door and record them.

---

## 2. Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | **Tauri 2** | Native window, real OS fullscreen, autostart, single compiled binary, no dev server. |
| Frontend | **SvelteKit 2 + Svelte 5 (adapter-static, SPA)** | Same runes stack as the main app, so components and utils copy over with minimal edits. |
| Styling | **Tailwind v4 + the main app's design tokens** | Visual continuity with the web app without hand-matching colors. |
| Backend | **The existing Supabase project — unchanged** | Same members/events/attendance data. No new schema, no new RLS policies. |
| Data access | `supabase-js` from the frontend, same as the web app | The scan RPCs already own all validation; the kiosk is a thin client. |
| Rust code | Only the system shell: fullscreen lock, autostart, local session storage | Keeps the new-language surface small. |

### What stays in TypeScript (reused, not rewritten)

- `supabase.ts` client setup
- The scan RPC calls from `src/lib/api/attendance.ts` — `scan_member_transaction`,
  `check_already_scanned`, ongoing/upcoming event lookups. Ported as `kiosk-rs/src/lib/api/
  attendance.ts`, trimmed from 454 lines to the four calls a door needs. Note the scanned QR
  text **is** the member id, so there is no code→member lookup step.
- ~~`scanQueue.ts` — the existing offline queue~~ **Corrected 2026-11-13:**
  `src/lib/utils/scanQueue.ts` is *not* an offline queue. It is an in-memory serializer
  (one scan at a time, with a dedupe window) and it persists nothing — the web app has **no**
  offline queue, so a scan taken with the network down is lost. The kiosk UI already promises
  "Saved — will sync", so a real durable queue now lives in
  `src/lib/kiosk/offline-queue.ts` (localStorage, replays with the original scan time).
  Still **not** Rust.
- `stores/elevation.ts` + `elevation-dialog.svelte` — the exit/override gate
- Audio feedback helpers (`setupAudioUnlock`)

### Prerequisites

| | Install |
| --- | --- |
| All | Rust via `rustup` (`winget install Rustlang.Rustup` on Windows) |
| Windows (secondary target) | MSVC C++ build tools; WebView2 runtime (preinstalled on Win 10/11) |
| Debian (primary target) | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |

---

## 3. Auth model

RLS check confirmed: `scan_member_transaction` only requires the caller to have *any* resolved
role (`get_user_role()` not null). No new role or policy is needed.

- **Default:** a dedicated **kiosk account** with role `staff`, created through the normal
  invitation flow. It exists for this device only and is not used by any person in the web app.
  Session persists locally so the device comes back up signed in after a restart or power cut.
- **Escape hatch (an option, not a constraint):** behind the elevation gate, "Sign in as a
  different account" does a real `signInWithPassword` with an admin's or staff member's own
  credentials and swaps the active session for that run. The *view never changes* — it stays
  the kiosk scan screen. This covers the kiosk account being locked out, disabled, or needing
  higher privileges for a one-off.
- **Exiting kiosk mode** (back to a normal desktop) stays elevation-gated, as on the web.
- Use of the escape hatch is written to the audit log (`logAuditChange`) so there's a trail.
  Individual scans are *not* separately audited — the scan RPC is already the record.

**v1 shortcut, accepted:** the kiosk session is persisted as a file in Tauri's app-data dir,
not in the OS keychain. The real control here is physical — it's a locked-down device. Moving
to the OS keyring is a fast-follow, not a blocker.

---

## 4. Settings: what the kiosk borrows

The kiosk **reads** shared settings and **never edits** them. Editing stays in the web app.

**Free** (same `system_settings` row — one row, `id = 1`, readable by `anon` so it loads before
sign-in): site name, organisation name (`qr_header_title`), primary color, timezone,
scan-modal toggle + duration. Wired 2026-11-13 as `src/lib/kiosk/settings.ts`; re-read on each
60 s poll, so an App Settings change reaches the device without a restart.

**Corrected:** *time format* was listed here but is **not** in `system_settings` — the web app
keeps it per-device in `localStorage.time_format`. Same for the USB-scanner flag, camera guide
and theme. These are device preferences in both apps, so they live on KioskSettings; the kiosk
reads/writes the same `time_format` key the web app uses.

**Cheap** (existing modules, wired in): elevation dialog, `logAuditChange` for the escape hatch.

**Skipped** (not relevant to an unattended device): the App Settings *editing* UI, QR card
generation, background image upload, notifications, biometric toggle, language switcher,
session-timeout auto-logout (the kiosk session must *not* expire), changelog modal. The web
app's "redirect to /scan + hide nav" logic is moot here — this app has no other route to
protect.

---

## 5. Refined kiosk UI

The web kiosk is a normal app page with its chrome hidden. This is designed as a kiosk from the
start: read at 1–2 m, operated by strangers, unattended for hours, no mouse.

**Superseded 2026-11-13 (user request):** sections 5.1-5.4 below describe a kiosk-first design
drawn from scratch. The screens now instead **mirror the main system's kiosk UI** — ported from
`src/routes/(protected)/scan/+page.svelte`'s kiosk block, `usb-scanner-guide.svelte` and
`scan-status-modal.svelte` — so the two feel like one product. Kept from the original design:
this app's persistent status strip (the header), the burn-in drift on standby, and the offline
"Saved — will sync" state the web app has no equivalent for. Changed: the full-bleed colour
flood is now a centred card, as the main system does it.

### 5.1 Principles

1. **Glanceable from across a table.** Scan result readable at 2 m, at an angle. No state that
   only shows up in a corner toast.
2. **Nothing idle-tappable.** Every control a queuer could reach is either harmless or gated.
3. **Always say what's wrong.** Offline, queued, wrong event, camera dead — visible on the main
   screen, not in a log.
4. **Dark by default.** Inverted from the web app on purpose: less light pollution at a venue,
   less burn-in on a screen showing the same layout for hours. Light mode available.
5. **Touch first.** Minimum 56 px targets (web app uses ~36–40), no hover-only affordances, no
   text under 16 px on the scan screen.

### 5.2 Navigation: two screens, one door

No sidebar, no tabs, no breadcrumb. **Scan ⇄ Settings**, and that's the whole map.

```
┌──────────────────────────────────────────┐
│ SCAN  (default, always returns here)     │
│   states: Standby / Ready / Result       │
└──────────────┬───────────────────────────┘
               │  long-press gear 750 ms
               │  → elevation PIN
               ▼
┌──────────────────────────────────────────┐
│ KIOSK SETTINGS  (on-device only)         │
│   "Done" → back to Scan                  │
└──────────────────────────────────────────┘
```

**Password hold (2026-11-13):** elevation now survives leaving Settings and lasts for a
device setting — Every time / 1 / 2 / 5 minutes, default 5. It used to be a fixed two minutes
*and* was dropped whenever Settings closed, so stepping out to watch a scan and going back in
meant retyping the password every time. The window is counted from when the password was
entered, not from the last tap, so it cannot be extended indefinitely by popping in and out.
Switching accounts drops it — the hold was earned with the other account's password.

The gear sits bottom-right, deliberately low-contrast, and carries **two gestures**
*(reworked 2026-11-13)*:

- **Short tap → quick controls, no password.** Input (USB / Camera), camera options, sound,
  test tone, retry sync. Everything applies instantly and persists itself — no draft, no Save.
- **Long press 750 ms → the password gate → full settings**, for configuration.

The split is by *consequence*, not by screen. Switching the scanner previously cost a long
press, a password, a section change, a toggle, a Save and a Back — six actions for what the web
app does in one tap — because the gate was drawn around the settings screen rather than around
risk. Nothing in the quick panel can lose a scan, change who scans are recorded as, or leave
kiosk mode; everything that can still needs the password. Keyboard has no long-press, so the
quick panel also carries an "All settings…" route.

### 5.3 Persistent status strip (top, every screen)

One row that is always true, so nobody has to go looking:

```
┌────────────────────────────────────────────────────────────────────┐
│  ORG NAME · Attendance Kiosk        ● Online   ⚑ 0 queued   14:32  │
└────────────────────────────────────────────────────────────────────┘
```

- `● Online` → green. Offline → **red, with the strip itself turning red-tinted**, not a small dot.
- `⚑ N queued` → hidden at 0; amber and prominent at ≥1. Taps through to Sync in Settings.
- Clock, 12/24 h per the shared `time_format` setting.
- Active event name sits under the strip when an event is ongoing.

### 5.4 Scan screen states

**A. Standby** — no ongoing event. (Refines the existing web standby.)

```
            ORG NAME · Attendance Kiosk      ● Online        14:32
    ┌──────────────────────────────────────────────────────────────┐
    │                                                              │
    │                        14:32:08                              │
    │                   Tuesday, 11 November                       │
    │                                                              │
    │              ── Next event ──────────────────                │
    │               General Assembly · 15:00                       │
    │                                                              │
    │                   02 : 27 : 52                               │
    │                   hrs  min  sec                              │
    │                                                              │
    │            Scanning starts automatically.                    │
    │                                                              │
    └──────────────────────────────────────────────────────────────┘
                                                              ⚙
```

Keeps the three distinct web states — counting down / overdue ("should be live by now") /
nothing scheduled — because collapsing them to `00:00:00` reads as a frozen kiosk.
**New:** after 10 min idle the clock block drifts slowly (burn-in) and dims to ~60 %.

**B. Ready** — event ongoing, waiting for a scan.

```
            ORG NAME · Attendance Kiosk      ● Online        14:32
                     General Assembly · 143 checked in
    ┌──────────────────────────────────────────────────────────────┐
    │                                                              │
    │                     ┌──────────────┐                         │
    │                     │   [ camera   │                         │
    │                     │     feed or  │                         │
    │                     │   QR glyph ] │                         │
    │                     └──────────────┘                         │
    │                                                              │
    │                 Scan your QR code                            │
    │              Hold it up to the scanner                       │
    │                                                              │
    └──────────────────────────────────────────────────────────────┘
                                                              ⚙
```

Running checked-in count is a kiosk addition — staff currently have to open the web app to see
it, and it doubles as proof the device is actually talking to the database.

**C. Result** — immediately after a scan. **The main refinement.**

The whole screen floods with the result color for `scan_modal_duration` seconds. At 1–2 m and
off-angle, a card-sized toast is not readable; a full-bleed color is, before you even read the
words.

```
  SUCCESS (green flood)        DUPLICATE (amber flood)      REJECTED (red flood)
┌──────────────────────┐      ┌──────────────────────┐     ┌──────────────────────┐
│          ✓           │      │          !           │     │          ✕           │
│                      │      │                      │     │                      │
│   JUAN DELA CRUZ     │      │   JUAN DELA CRUZ     │     │   Not registered     │
│      ENG-1234        │      │      ENG-1234        │     │                      │
│                      │      │                      │     │  This code isn't in  │
│   Checked in 14:32   │      │  Already checked in  │     │  tonight's event.    │
│                      │      │      at 14:02        │     │  Please see staff.   │
│  ████████░░░░ 3s     │      │  ████████░░░░ 3s     │     │  ████████░░░░ 3s     │
└──────────────────────┘      └──────────────────────┘     └──────────────────────┘
```

- Distinct **shape + icon + text**, not color alone (color-blind users, and the person reading
  it is a stranger who gets one look).
- A visible auto-dismiss countdown bar, so nobody wonders whether the device froze.
- Next scan interrupts the current result immediately — queues move fast.
- **Queued-offline variant:** same green-ish success but marked `Saved — will sync` so staff
  know it hasn't reached the server yet. The web version silently queues; a kiosk should say so.

### 5.5 Kiosk Settings screen

**Settings now actually persist.** Until 2026-11-13 `kiosk.settings` was in-memory `$state`
only — kiosk name, volume, debounce, camera and pinned event were all lost on reload, hidden
by the fact that `time_format` and the two OS flags happened to survive by other routes.
`settings-store.ts` saves them to localStorage, merging over defaults so an older saved blob
survives an upgrade. The screen edits a **draft**; a floating save bar (the web app's App
Settings pattern) appears only while dirty, and Back arms a warning before it will discard.

**Rebuilt 2026-11-13 as a two-pane layout** (direction A of three drafted for the user).
Categories in a left rail, one group at a time in the right pane — nothing scrolls to be
found. Implemented as a real ARIA tablist (arrows move, Home/End jump, roving tabindex keeps
the rail one tab stop), so keyboard and screen-reader behaviour is the platform's. Below `md`
the rail becomes a horizontal chip strip. Every control is now 56px (`--kiosk-tap-min`), which
the old 44px inputs and buttons never honoured. The groups below are unchanged in content.

On-device settings only, grouped. Everything here is meaningful to a *kiosk* — the web app's
generic toggles (biometric auth, email notifications, "cache data") are deliberately absent.

| Group | Settings |
| --- | --- |
| **Device** | Kiosk name (e.g. "Main Gate — Laptop 1"; identifies the device in audit rows) · Fullscreen lock on/off · Start on boot on/off · Restart app |
| **Input** | USB scanner on/off · Camera on/off + **which camera, mirror, wide scan area** *(built 2026-11-13; mirror and the wide scan box mirror the web app's own scanner controls)* · Duplicate-scan debounce window · Beep volume / mute · Test scan (echoes a decode without writing to the DB) |
| **Event** | Follow ongoing event automatically *(default)* · or **pin to a specific event** — a gate device sometimes must stay on one event when two overlap, which the web app can't express |
| **Sync** | Online status · Pending queue count · Retry now · View queued scans *(built 2026-11-13)* · Last successful sync · **auto-retry every 30 s while online**, so a flush that fails without the connection dropping is not stranded until someone taps Retry |
| **Account** | Signed in as *(kiosk account)* · Sign in as a different account · Sign out · Exit kiosk mode |
| **About** | App version · Supabase project/env · OS · Shared settings, **read-only**, labelled "Managed in the web app" (branding, timezone, time format, modal duration) |
| **About** | Organisation · System · This device · Kiosk version *(the unlock target)* · Runtime. **Not** connection or storage details — those are diagnostics and live in Developer Tools. |
| **Developer Tools** *(added 2026-11-13, regated same day)* | Unlocked by tapping the version seven times, Android-style — **not** by account role, because swapping to a developer account changes who scans are recorded as, and the audit trail should not be the price of a test flag. Persists until the "Use developer options" switch turns it off, which also clears the test flags. Bypass event time validation (mocks results, writes nothing — as the web app does) · Simulate offline · Preview each result card · Last error · Native shell · Discard queued scans. A **TEST MODE** banner sits in the status strip whenever bypass is on. |

Showing shared settings read-only is deliberate: staff can confirm what the device thinks the
config is, without being misled into trying to change it here.

### 5.6 Kiosk-only behavior the web version can't have

- **Boot splash** — a cold start shouldn't flash a white browser page.
- **Burn-in guard** — drifting/dimming standby clock.
- **No OS notifications** while kiosk mode is on.
- **Crash recovery** — relaunch straight back into Scan, session intact.
- **Fullscreen that actually holds** — OS-level, not F11.

---

## 6. Three-day execution

| Day | Work |
| --- | --- |
| **1** | ✅ Tailwind v4 + main app's tokens · ✅ both screens built with mock state (standby / overdue / no-event / ready / success / duplicate / rejected / offline-queued / settings / elevation) · ✅ USB-scanner keystroke input and online/offline detection are already the real implementations · ⬜ create the kiosk `staff` account in Supabase |
| **2** | ✅ Port `supabase.ts` + scan RPCs · ✅ persisted session + first-boot sign-in screen (`screen-signin.svelte`, credentials never compiled in) · ✅ real scan flow, serialized, with RPC→flood mapping · ✅ durable offline queue (written, not reused — see §2) · ✅ audio (`src/lib/kiosk/beep.ts`, web app's vocabulary + a kiosk `playQueued`, volume-aware) · ✅ elevation gate verifies the real password (`src/lib/kiosk/elevation.ts`) · ✅ escape hatch (`switch-account-dialog.svelte`, restores the old session if the new account can't scan) + immediate audit write (`src/lib/kiosk/audit.ts`) |
| **3** | ✅ Fullscreen lock (OS-level, `core:window:allow-set-fullscreen`) · ✅ autostart plugin (`tauri-plugin-autostart`, LaunchAgent/Run key/.desktop) · ✅ boot splash solved by *not* showing a half-built window — created `visible: false`, shown from `setup()` · ✅ app icons generated from the system's own `favicon.svg` · ✅ `tauri build` · ⬜ end-to-end test against real Supabase (success / duplicate / rejected / offline-queue flush / escape hatch) |

**Tests:** `pnpm test` (vitest, node env). `src/lib/kiosk/offline-queue.test.ts` covers the
one piece whose failure is silent — 13 cases over ordering, stop-on-transport-failure,
server-refused drops, original-timestamp replay, the MAX_PENDING bound, corrupt storage and
write-quota failure. Verified by mutation: breaking the timestamp replay fails 1 test, and
continuing past a transport failure fails 3.

**Day 2 closed 2026-11-13.** Everything in it is written and builds; none of it has run
against real Supabase yet, because the dedicated kiosk `staff` account still does not exist.
"Exit kiosk mode" in Settings is still inert by design — it needs the Tauri window plugin
(Day 3), not more frontend.

**Cut first if time runs short:** camera scanning (USB scanner alone is a complete product),
burn-in guard, test-scan tool, Windows packaging.

---

## 7. Deferred / open

- ~~Camera + QR decode~~ **Done 2026-11-13, in the webview.** `html5-qrcode`, the same library
  and the same fps/qrbox config the web app's scan page uses, so both decode identically.
  Decoded text goes to `kiosk.submit()` — the USB scanner's entry point — so the debounce,
  scan chain, offline queue and result card behave the same whichever input read the code.
  The Rust path (`nokhwa` + `rxing`) was rejected: it would have moved real behaviour out of
  TypeScript for no gain.
- ~~Session storage in the OS keyring~~ **Done 2026-11-13.** `src-tauri/src/secrets.rs` exposes
  three commands over the `keyring` crate; `secure-storage.ts` hands them to supabase-js as its
  auth store, falling back to localStorage outside Tauri. Linux uses `sync-secret-service`, not
  `linux-native` — the kernel keyring does not survive a reboot.
- Auto-update (Tauri updater) — manual reinstall is fine for one or two devices.
- Multiple kiosks reporting health to the web app (a "devices" view) — nice, not v1.

---

## 8. Device pairing and PIN — specification

*Agreed 2026-11-13. Order: this spec → the kiosk side → the web app.*

**Kiosk side built 2026-11-13.** `pin.ts` (PBKDF2, lockout — 39 tests), `pin-keypad.svelte`,
the PIN branch of `elevation-dialog.svelte`, `screen-pair.svelte`, and `pairing.ts` **as a
stub**: it validates the code shape and stores the PIN locally, so the flow can be used before
the server exists. Everything server-shaped is behind `pairDevice()` — when the edge function
lands, only that function body changes. Account sign-in stays reachable from the pair screen
until every kiosk is paired. **Web app side written 2026-11-13, NOT yet applied or deployed:**
`database/kiosk_devices.sql` (tables, RLS, housekeeping), six new actions in
`supabase/functions/invitation-service/index.ts`, `src/lib/api/devices.ts`, and
`/settings/devices` with its tile and breadcrumb.

**Still to do:** apply the migration, deploy the function, then replace the kiosk's
`pairDevice()` stub with the real call and add the heartbeat that makes revoke and PIN-reset
propagate.

### 8.1 Why this replaces the kiosk account

Today a **machine uses a human's account**: an invitation is consumed, an account password is
typed at a door where anyone can watch, credentials that unlock the whole web app sit on a
device in a public room, and one kiosk cannot be revoked without disturbing anything else.

Pairing fixes all four. The kiosk becomes a *device* the organisation owns, not a person.

### 8.2 Data model

```sql
CREATE TYPE kiosk_device_status AS ENUM ('active', 'revoked');

CREATE TABLE kiosk_devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,                       -- "Main Gate", "2nd Floor"
    auth_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status          kiosk_device_status NOT NULL DEFAULT 'active',
    pin_hash        TEXT NOT NULL,                       -- PBKDF2-SHA256
    pin_salt        TEXT NOT NULL,
    paired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paired_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    paired_by_email TEXT,            -- denormalised, as invitations does, so deleting the
                                     -- admin does not erase who paired the device
    last_seen_at    TIMESTAMPTZ,
    app_version     TEXT,
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE kiosk_pairing_codes (
    code         TEXT PRIMARY KEY,   -- 8 chars, Crockford base32: no O/0, I/1/L confusion
    pin_hash     TEXT NOT NULL,      -- the admin sets the PIN when generating the code, so a
    pin_salt     TEXT NOT NULL,      -- device is never unprotected, not even briefly
    device_name  TEXT,
    created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_email TEXT,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
    attempts     INTEGER NOT NULL DEFAULT 0,
    consumed_at  TIMESTAMPTZ,
    consumed_by  UUID REFERENCES kiosk_devices(id) ON DELETE SET NULL
);
```

Both tables are **admin-read only** under RLS. The kiosk never reads them directly — every
call goes through the edge function, which holds the service-role key.

### 8.3 Device identity

The edge function creates **one hidden auth user per device**: `kiosk+<uuid>@<domain>`, a
random 32-byte password that is never returned, never shown and never typed, and a `profiles`
row with role `staff`.

Chosen over a device token because `scan_member_transaction` only needs *any* resolved role —
so RLS, the scan RPC and the audit trail all keep working unchanged, and each device appears
distinctly in `audit_logs`. Revoking is then just banning that one user.

### 8.4 Edge function actions (extending `invitation-service`)

It already has service-role access, `assertIsAdmin`, rate limiting and audit logging, so these
are additions rather than new infrastructure.

| Action | Caller | In → Out |
| --- | --- | --- |
| `create-pairing-code` | admin | `{ deviceName?, pin }` → `{ code, expiresAt }` |
| `pair-device` | anon, gated by the code | `{ code, deviceName }` → `{ session, deviceId, pinHash, pinSalt }` |
| `list-devices` | admin | → rows incl. `last_seen_at`, `app_version` |
| `rename-device` | admin | `{ deviceId, name }` |
| `reset-device-pin` | admin | `{ deviceId, pin }` |
| `revoke-device` | admin | `{ deviceId }` → bans the auth user, marks revoked |
| `device-heartbeat` | the device | `{ appVersion }` → `{ status, pinHash, pinSalt }` |

`pair-device` is the only anon-callable one. It is gated by a single-use code that expires in
ten minutes, counts its own attempts, and is marked consumed inside the same transaction that
creates the device.

The heartbeat is what makes **revoke and PIN-reset propagate**: a device that has been revoked
learns it on its next poll and signs itself out, and a reset PIN arrives the same way.

### 8.5 PIN

- **6 digits**, set by the admin when generating the pairing code.
- **PBKDF2-SHA256, 150k iterations, 16-byte random salt.** The device stores only the hash and
  salt, in the OS credential store — both are small enough for the 1200-character limit that
  broke session storage earlier.
- **Verified on-device**, so settings still open with the network down.
- **Five failures → 60 s cooldown**, doubling to a 15-minute ceiling.
- The PIN opens *this device's settings*. It is not an organisation credential, which is
  exactly why six digits is enough — the same reason a bank can use four.
- **Escape hatch kept:** an admin signing in with email and password still overrides a
  forgotten PIN, via the existing switch-account flow.

### 8.6 Kiosk screens

1. **Pair** (first boot) — numeric/alphanumeric keypad for the code, plus a device name. No
   email, no password, ever. Church background, as the sign-in screen now has.
2. **PIN gate** — replaces the password dialog at the elevation gate. On-screen keypad, never
   the OS keyboard.
3. **Revoked** — "This kiosk was removed" and back to Pair.

### 8.7 Web app

A new **Settings → Devices** page, admin-only, as a tile beside Access Directory:

- **Pair a new kiosk** → name + 6-digit PIN → shows the code with a countdown
- A table of devices: name, last seen, app version, status
- Per row: **Rename**, **Reset PIN**, **Revoke**
- Every action audited through `logAuditChange`

`last_seen_at` also delivers most of the "multiple kiosks reporting health" item in section 7.

### 8.8 Rollout

The existing kiosk account keeps working until a device is paired, so this can land without a
flag day. Once every kiosk is paired, delete that staff account — at which point no human
credential is stored on any device.
