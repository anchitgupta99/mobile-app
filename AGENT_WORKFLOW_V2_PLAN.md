# Agent Workflow v2 — Change Spec & Plan

Status: **Implemented on `feat/agent-workflow-v2`.** This document is the original change spec and plan; see `docs/APP_REVIEW_2026-11-02.md` for the post-implementation review.

- Scope: **UI prototype with mock data only** (no real backend, telephony, or SIP).
- Branch: create `feat/agent-workflow-v2` from `feat/motion-feedback`.
  - Note: at the time of writing, `app.json` (modified) and `eas.json` (untracked) had uncommitted changes unrelated to this work — leave them alone.
- Follow `AGENTS.md`: check the `expo` major version in `package.json` and read the matching versioned docs before touching Expo/RN APIs; routes live in `src/app/`; run `npx expo lint` and `npx tsc --noEmit` before calling anything done.
- Reference screenshots were shared in chat only (not saved in the repo); their content is described in each section below.

---

## Confirmed requirements

### 1. Login / onboarding

**1a. Login screen**

- Username (login ID) + password, Sign in button.
- Directly below sign-in: tabs/options for **SIP login** and **Mobile login**.
- For now, SIP login and Mobile login use the **same form** as the main login (login ID + password). Mock only.

**1b. Remove** the phone-number and verification-code screens entirely from the flow.

**1c. "Ready to go live?" pre-flight screen** — the screen right after login.
Reference (from web app):

- Header: "Ready to go live?" / "All systems ready — you're good to go live!"
- Card: **Internet connection** — status "Passed", e.g. "Strong signal · 10 Mbps · 50ms latency".
- Card: **Webphone** — "Passed", "Registered · Extension BF68C2S5EPTC3Q".
- Card: **Headset & microphone** — "Passed", "Headset connected — mic input low", containing:
  - Microphone device picker (e.g. "Default - Microphone Array (Realtek(R) Audio)")
  - Speaker device picker (e.g. "Default - Speakers (Realtek(R) Audio)")
  - **Mic input level** slider (mute icon ↔ mic icon, e.g. 80%) + a live level meter (segmented bar)
  - **Headset output** slider (e.g. 60%)
  - Buttons: **Test mic**, **Test Headset**
- Footer note: "All checks run automatically on login · Re-run from Profile → Diagnostics"
- Footer buttons: **Logout** (red) and **Go live** (primary, dark).
- All checks are mocked (simulate checking → passed).

### 2. Top header (all tabs)

Visible in the header:

- **Available** status pill.
  - Tapping it opens a status menu: **Available / Break / Offline**.
  - Break types (match web): **Bio Break, Meeting Break, Lunch Break, Tea Break**.
  - This replaces the old "Take a break" button that lived in the Home Available card.
- A **small icon to toggle light/dark theme** (moved out of Settings).
- A **hamburger menu**, containing:
  - **Campaign** picker (select campaign)
  - **Auto-call** toggle — **ON by default**. Meaning: during an auto campaign, automatically dial the next lead after wrap-up.
  - **Profile** (view/edit agent profile details)
  - **Settings**
  - **Log out**

### 3. Bottom tab bar

Final order: **Home · Calls · Dialer · Contacts · Callbacks**

- "Today" → **Home**.
- "Tasks" → **Callbacks** (matches web app's "Callbacks").
- Dialer stays as the raised center button (see §5 for its call-button behaviour).

### 4. Home tab

- **Remove** the "Available" card (status dot, timer, "4 in queue", explanatory text "Incoming calls ring on this phone…", "Take a break" button).
- **Remove** the "N calls need a disposition" banner (disposition can no longer be added after a call — see §8).
- Keep the greeting ("Good afternoon, Priya" + "Home Loans Q4 · Field Sales · West").
- Add a **mobile version of the web Agent Analytics dashboard**. Must be easy to scan, not cluttered, cognitively ergonomic.
- **Queue count** ("N in queue") lives on the dashboard.

Web dashboard reference content (mock values):

- Date filter: **Today / Yesterday / Custom Date**.
- **Call Summary: 85**
  - Inbound: Inbound calls 45, Answered 45, Abandoned 45 (donut)
  - Outbound: Outbound calls 45, Answered 45, Customer missed 45 (donut)
- **Shift Summary** — Total login duration 08:32:49; stacked bar: Idle 03h20m, Break 03h20m, Call 06h30m.
- **Call Time** — Total call duration 06:32:49; Ringing / Talk / Hold / Wrap time (pie).
- **Break Time** — total 01h20m; horizontal bars per break type (Bio, Meeting, Lunch, Tea).
- **Hourly Call Trend** — stacked bars 09:00–20:00: Outbound, Inbound, Busy, Abandoned.
- **Average Handling Time (AHT)** — lines for inbound/outbound across the day; AHT 00:08:23.

Proposed mobile layout:

1. Date chips (Today / Yesterday / Custom).
2. "At a glance" — 3–4 large stat tiles: In queue, Total calls, Talk time, AHT (and/or login duration).
3. Shift summary — single segmented horizontal bar (idle / break / call) with a compact legend.
4. Calls — Inbound vs Outbound as compact rows (total, answered, missed/abandoned) instead of two donuts.
5. Collapsible "See more" sections (collapsed by default): Call time breakdown, Break time by type, Hourly trend, AHT chart.

### 5. Dialer tab

- **Remove** the "Auto" selector chip above the number field.
- **Remove** the standalone green call button under the keypad.
- When on the Dialer tab, the **raised center tab button becomes the call button** (green, phone icon); it reverts to the keypad icon when leaving the tab. Animate the morph so it feels seamless.
- Top contact chips: rename "Follow-up due" → **"Callback due"**.

### 6. In-call: Transfer & Conference

Add transfer and conference options during an active call, each with **Internal** and **External** modes. Reference screens:

- **Active call header**: direction icon, number (e.g. "+1 (415) 892-0…"), live timer (04:52), mute, expand/minimise, red hang-up.
- **Internal / External segmented control** with a back arrow.
  - **Internal**: search field "Search name or extension"; agent list rows with avatar initials, name, presence dot (green = available), team · extension (e.g. "Support · x2041", "Sales · x2088", "Billing · x2130 · Away"), and an action button (transfer/add-call icon) per row. Mock agents: Devin Alonzo, Priya Raman, Marcus Webb.
  - **External**: country code selector (globe "+1" ▾), number input with backspace, call button (purple); full keypad 1–9, *, 0 (+), #.
- **Consulting transfer target** screen: header pill "On hold"; card for the customer (Maya Reinhardt, Customer, "On hold"); card for the target (Devin Alonzo, Agent, green timer 00:18); "If the target doesn't answer" state chips: **Busy / No answer / Declined**; buttons **Complete transfer** (primary) and **Cancel**.
- **Merge into conference** screen: same two cards; "Status" chips: **Calling participant…** / **Merge in progress**; buttons **Merge calls** and **Cancel**.
- **Active conference** screen: header "Conference call · 3-way · 12:08"; participant list (Maya Reinhardt — Customer; Devin Alonzo — Support; Priya Raman — Sales · Muted) each with mic/mute indicator and red remove button; bottom controls: **Hold, Keypad, Transfer, Conf** (Conf active).
- All mocked (simulate ringing → answered / busy / no answer / declined).

### 7. Calls tab (recent calls)

Must accommodate at least the web app's Recent Calls data, adapted to mobile cards.

- **Toolbar**: search ("Search lead"), date chips **Today / Yesterday / date range** (e.g. "Oct 1 – Oct 17"), active-filter chip with ✕, **Clear all**, **More filters**.
- **More filters** (bottom sheet): Call type (All), Disconnected by (Any), Duration (Any + N mins), Campaign (All), Disposition (All); buttons **Clear** and **Apply filters**.
- **Each call row/card** shows: lead name + number (e.g. "Unknown · 6261439534"), direction icon (outbound green ↗ / missed-inbound red ↘), date & time, duration (with small progress bar) and talk duration, campaign, disposition (with info icon), disconnected by (Customer / Agent).
- **Row actions**: call back, view lead details (eye), play recording (▶).
- **Lead details** sheet: fields Id, Name, Status (e.g. IDLE), Phone number, Call UUID — each copyable; a **Copy data** button for all; close button.
- Everything **read-only** (see §8).

### 8. Edit permissions (read-only rules)

- **CRM fields are editable only while the call is live.** They lock the moment the call ends.
- **Disposition + notes** are entered on the **wrap-up screen right after the call**, and disposition is **required** there (agent cannot leave wrap-up without one).
- After that, a completed call is **fully read-only**: no editing of disposition, notes, or CRM — from the Calls tab, call details, or lead details. Calls completed without a disposition **also cannot** be edited/added later.
- **Contacts tab**: no layout changes, but **read-only** — agents cannot edit any contact information.

### 9. Settings

Settings (reached via the hamburger menu) contains only:

- **Campaign**
- **Agent profile** (view/edit profile details)
- **Log out**

Remove every other existing Settings option (theme moves to header icon).

---

## Plan

Commit after each step on `feat/agent-workflow-v2`.

1. **Explore** — read `package.json` (Expo major version → versioned docs), `src/app/` route tree and layouts, existing theme/motion/feedback primitives, mock data files, and the current Today, Dialer, Calls, Contacts, Tasks, Settings, in-call and wrap-up screens. Create the branch.
2. **Onboarding** — login form with SIP/Mobile login tabs; delete phone/code screens and routes; add "Ready to go live?" pre-flight screen with mocked checks; Go live → app tabs, Logout → login.
3. **Header + nav** — status pill with Available/Break(types)/Offline menu; theme toggle icon; hamburger menu (Campaign, Auto-call default ON, Profile, Settings, Log out); rename tabs to Home / Calls / Dialer / Contacts / Callbacks.
4. **Home dashboard** — remove Available card and disposition banner; build mobile analytics (date chips, glance tiles incl. queue count, shift bar, inbound/outbound rows, collapsible detail charts) with mock data.
5. **Dialer** — remove Auto chip and standalone call button; center tab button morphs into the call button on the Dialer tab; "Callback due" labels.
6. **In-call transfer & conference** — Internal/External picker, consult transfer screen with failure states, merge-into-conference screen, active conference screen with participant mute/remove and bottom controls.
7. **Calls tab** — search, date chips, filter chip + Clear all, More filters sheet, rich call cards, call back / lead details / recording actions, Lead Details sheet with copy.
8. **Read-only rules + Settings + Callbacks** — CRM editable only during live call; disposition required at wrap-up then locked; Contacts read-only; Settings trimmed to Campaign / Profile / Log out; auto-call dials next lead after wrap-up when ON.
9. **Verify** — `npx expo lint`, `npx tsc --noEmit`, run in preview (web) and check each flow; light and dark theme; small-phone width.
