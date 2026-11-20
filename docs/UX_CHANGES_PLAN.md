# Agent app UX changes: implementation guide

Status: **Plan, not started.** Branch: `anchit`.
Scope: the six proposed changes (visual design, the call screen's required-details panel, the two dial pad blocks, the Contacts empty states, Callbacks) plus the changes that apply across the app.
Every `file:line` below is from the codebase as of 2026-11-19. Paths are relative to `src/` unless stated.

Before touching any Expo or React Native API, follow `AGENTS.md`. The project is on Expo SDK 57, so read the v57 docs. Run `npx expo lint`, `npx tsc --noEmit` and `npm test` before calling a step done.

---

## At a glance: what exists vs what's new

| Change | Already in the app | Missing | Needs backend/admin work? |
|---|---|---|---|
| 1. Contrast and interaction | One central palette (`theme/tokens.ts`), light and dark themes, `Button` with pressed, disabled and loading states, a haptics system, `minTap = 48` | Several token values fail WCAG AA. Status is shown by a coloured dot plus label, with no icon. Some controls have no pressed state. A few tap targets are under 48dp. There are 14 font sizes. The call timer is small. | No |
| 2. Required-details panel | Notes and Script in a bottom sheet. `GET /calls/context` already returns the campaign's CRM field groups **and** the lead's values (the app throws most of them away). The server already rejects a disposition when required lead fields are missing. | Admin field configuration, a lead field save endpoint, a top drag-down panel, a client-side "required" gate, a "connected" category on dispositions | **Yes**: admin UI, campaign config, a save endpoint, a disposition category |
| 3. Manual calls not allowed | `Campaign.allowManualCalls` from `GET /campaigns`. `useDial` blocks keypad dials when it is false. | The check only covers the keypad. The toast has no action. There is no pre-tap banner and the call button isn't dimmed. There is no "contact your admin" case. | No (optional: a server-side reject code) |
| 4. Agent not online | `useDial` blocks any dial unless the status is `available`, and it already checks status first. | Generic wording, no "Go online" action, no status chip on the dial pad, a wrap-up rule | No |
| 5. Contacts empty states | `ListPlaceholder` (skeleton, plus an error state only for the first load), pull-to-refresh, a "No matches" search state | **Contacts are still mock data** (`mocks/seed.ts`). There is no list-assignment concept and no "all called" state. Network errors after the first load show as "empty". | **Yes**: a real contacts/leads endpoint that says whether a list is assigned |
| 6. Callbacks: remove add | Callbacks are created from wrap-up via `POST /callbacks`. Snooze (= reschedule) and Mark done exist. | The header has a **New** button (`app/(tabs)/callbacks.tsx:64`) and contact detail has a **Callback** quick action. Both open `/task/new`, which saves a local-only task the server never sees. | No |
| Shared dial check | `hooks/useDial.ts` is already the shared check for every UI dial | `useAgentSocket.ts` `dialDueCallback` skips it. There is no structured block reason. | No |
| Shared toast | `notify()` supports an action. One toast at a time. | All tones look the same. The action label fails contrast in dark mode (1.63:1). Fixed 3s/5s timing, bottom placement. | No |
| Log blocked attempts | Nothing: there is no telemetry at all | An event model, a queue and an endpoint | **Yes**: a logging endpoint |

---

## Decisions to make first

The recommended answer is listed first. Everything below assumes the recommendation unless noted.

1. **Brand colours.** Keep the existing Claritel palette (it mirrors the admin app's `globals.css`) and only adjust the values that fail. Don't invent a new palette.
2. **Dark mode.** Keep it; it's already complete. Its failures are few (see 1.1).
3. **Which screens get the most complaints?** Ask the agents. Until there's an answer, prioritise the call screen, the dial pad, the top-bar status pill and wrap-up, since that is where an agent spends their day.
4. **Enforce required details?** Yes, but only for "connected" dispositions. This needs a category per disposition from the backend (see 2.6). Allow a "Customer declined to share" choice per field, and make it count as filled.
5. **Does the ACW timeout auto-submit respect the gate?** No. A timeout must always submit, or the agent is stuck in wrap-up. Log it as `details_incomplete_on_timeout`.
6. **Does the manual-dial rule cover contacts, recent calls and callbacks?** Recommendation:
   - Keypad, contacts and recent calls: **blocked** (they are all agent-initiated manual dials).
   - **Callbacks: allowed.** The campaign itself scheduled them through disposition, and the web's Callbacks list dials them in auto campaigns too. Confirm this with the backend team.
7. **Wrap-up state.** Treat it like "not online" for dialing. `startOutbound` already refuses with "Finish wrap-up first" (`telephony/callStore.ts:588`). Move that check into the shared gate so it gets the same toast design, with the action **Open wrap-up**.
8. **Can agents reschedule or cancel callbacks?** Keep **Snooze** (= reschedule, `PUT /callbacks/:id`) and **Mark done** (= cancel, `DELETE /callbacks/:id`). Add a free date/time reschedule later if agents ask for it.
9. **What to call a contact list.** Use **"lead list"**. It's the only term the app already uses (`domain/helpText.ts:19`, "Search leads", "Leads assigned to you"). Avoid "bucket" in the UI.
10. **Toast position.** Use the **top**, below the top bar. Bottom toasts at `insets.bottom + 92` (`components/feedback.tsx:167`) sit over the tab bar's centre Call button and the dial pad, which is exactly where blocked-call toasts appear. On the call screen, top also avoids the End/Mute/Hold row.

---

## Suggested order of work

1. **Shared foundations**: tokens, the toast redesign and the dial gate (sections 1.1, 0.2 and 0.1). Everything else uses them.
2. **Dial pad blocks** (sections 3 and 4). Small, all client-side, and a visible win.
3. **Callbacks** (section 6). Small and client-side.
4. **The rest of the visual pass** (section 1.2 onwards): status icons, pressed states, tap targets, type scale.
5. **Contacts empty states** (section 5). Build the UI against a typed "list status" now, and swap in the real endpoint when the backend ships it.
6. **Required-details panel** (section 2). This is the largest piece and blocked on the backend contract. Agree the API (section 2.2) first, then build the panel against a mock of that contract.
7. **Blocked-attempt logging** (section 0.3), once the endpoint exists. The event shape is defined in step 1, so it's only a sender.

---

## 0. Changes that apply across the app

### 0.1 One "can this agent dial?" check

**Today.** `hooks/useDial.ts` is already the shared gate for every UI dial: the centre tab Call button (`app/(tabs)/_layout.tsx:81-89`), the contacts row (`contacts.tsx:84`), contact detail (`contact/[id].tsx:93`), the Calls tab "Call back" (`calls.tsx:372`), call detail (`call-detail/[id].tsx:129`) and callback detail (`task/[id].tsx:186`). It checks, in order:

1. at least 3 digits
2. `status !== 'available'`, which shows "Please go online to initiate calls", or "Switch to READY status" for tasks
3. `source === 'keypad' && allowManualCalls === false`, which shows "Manual calls are disabled for this campaign."

`startOutbound` then separately refuses "Already on a call" and "Finish wrap-up first" with a **dialog** (`callStore.ts:586-590`).

**The gap.** `hooks/useAgentSocket.ts:16-26` `dialDueCallback` calls `startOutbound` directly, with its own copy of the status check and a different error toast.

**Change.**

1. Add a pure function `domain/dialGate.ts`:
   ```ts
   export type DialBlock =
     | { reason: 'on_call' }
     | { reason: 'wrap_up' }
     | { reason: 'status'; status: 'break' | 'offline'; label: string }   // label: "Break", "Lunch Break", "Paused"
     | { reason: 'no_campaign' }
     | { reason: 'manual_not_allowed'; campaignName: string; anyCampaignAllows: boolean };

   export function canDial(input: {
     source: DialSource;
     status: AgentStatus;
     statusLabel: string;
     onCall: boolean;
     wrapUp: boolean;
     campaign: Campaign | undefined;
     campaigns: Campaign[];
   }): DialBlock | null
   ```
   Order: on call → wrap-up → status → no campaign → manual-dial. **Return one reason only**, so the agent sees one toast, never two.
   The manual-dial rule applies to `keypad | contact | history` and **not** `task` (decision 6).
   `anyCampaignAllows = campaigns.some(c => c.allowManualCalls !== false)`. Use it to choose between "Switch campaign" and "Contact your admin".
2. Make it pure (no store reads), so it can be unit-tested in `domain/__tests__/dialGate-test.ts`, like the existing `dispositions-test.ts`. Test every reason, the order, and each source.
3. `useDial` reads the stores **at the moment of the tap**: `useSession.getState()`, `useCampaigns.getState()` and `useCall.getState()`. It is already written this way, and it covers "admin changes the setting mid-session" as long as the campaign list is fresh (see 3.4). It then calls `canDial` → `showDialBlock(block)` (0.2) → `logDialBlock(block, source)` (0.3).
4. Route `dialDueCallback` through the same function. Keep its auto-dial behaviour, but use `canDial` for the decision.
5. Add a hook, `useDialAvailability()`, that returns the same `DialBlock | null` **reactively** (zustand selectors). Screens use it for pre-tap hints: the banner and dimmed Call button on the dial pad, and the status chip. It is the same function, so the pre-tap hint and the toast can never disagree.
6. Leave the `startOutbound` checks in place as a safety net, but the gate should catch these cases first.

### 0.2 One toast design

**Today** (`components/feedback.tsx`):
- `notify(message, tone, action?, {title, silent})`.
- Every tone renders as the same inverted card; tone only changes the icon glyph.
- The action label is `c.lavender`. In dark mode `invert` is white, so the label is **1.63:1** (`feedback.tsx:139`).
- Bottom position (`:167`), 3s or 5s duration (`:159`), one toast at a time, swipe to dismiss.
- 44 `notify(` call sites across 19 files.

**Change.**

1. **Position.** Top, at `insets.top + topBarHeight + 8`. Enter by sliding down (Reanimated `FadeInDown` or a spring on `translateY`); keep swipe to dismiss.
2. **Variants.**
   - `error` and `warning` get a tinted surface: `toneOf(c, tone).bg` fill, a 4px left bar in `fg`, an `fg` icon, and `ink` text.
   - `success`, `info` and `neutral` keep the inverted card.
   - All pairs must pass 4.5:1. Fix `warningFg` and `errorFg/errorBg` in dark mode as part of 1.1.
3. **Action button.** A real 48dp-tall `Button size="sm" variant="secondary"` (or `ghost`) instead of a bare label. Add a token for it, `toastAction`, with values that pass on each variant (for example `#534B82` on the white dark-mode invert = 7.79:1).
4. **Duration.**
   - 4s with no action, 6s with an action, error 6s.
   - Pause the timer while the toast is pressed or touched.
   - With screen reader on, don't auto-hide toasts that have an action.
5. **API.** Keep the `notify()` signature so the 44 call sites keep working. Add an options-object overload, `notify({ title, message, tone, action, duration })`, for new code.
6. **Blocked-dial toasts** use a helper, `showDialBlock(block)`, in `components/dialFeedback.ts`, so every entry point shows identical copy:

   | Reason | Title | Message | Action |
   |---|---|---|---|
   | `status` | You're on {label} | Go online to make calls. | **Go online** → `useSession.getState().setStatus('available')` |
   | `wrap_up` | Finish wrap-up first | Your last call needs a disposition. | **Open wrap-up** → `router.push({pathname:'/call/wrap-up', params:{id}})` |
   | `on_call` | Already on a call | End the current call first. | none |
   | `manual_not_allowed`, another campaign allows | Manual calls aren't allowed in {campaign} | Switch to a campaign that allows manual dialing. | **Switch campaign** → open the campaign picker (see 3.3) |
   | `manual_not_allowed`, none allow | Manual calls aren't allowed in {campaign} | Contact your admin to enable manual dialing. | none |
   | `no_campaign` | No campaign selected | Pick a campaign to start calling. | **Choose campaign** |

   "Already on a call" and "wrap-up" are dialogs today (`useDial.ts:36-44`). Switch them to this toast so there is one pattern.

### 0.3 Log blocked call attempts

**Today** there is no telemetry; only `__DEV__` `console.log`s.

**Change.**

1. Event shape (agree it with the backend):
   ```ts
   { type: 'dial_blocked', reason: DialBlock['reason'], source: DialSource, status, campaignId, at: ISO, appVersion }
   ```
   Don't send the dialled number; at most send its last 4 digits. It's PII, and the reason is what matters.
2. Add `api/telemetry.ts` with `track(event)`. It pushes to a small persisted queue (zustand + `persist`, like `store/outbox.ts`) and flushes in batches every 30s and on app background, through `POST /v1/api/agent/mobile/events` (**new backend route**).
3. Until the route exists, `track()` only queues (capped at 200 events) and logs in `__DEV__`. Nothing is lost when the route ships.
4. Later, reuse it for `details_incomplete_on_timeout` (2.6) and toast action taps (were the actions used?).

---

## 1. Visual design: contrast and interaction

### 1.1 Fix colours in one place

The palette is **already centralised** in `theme/tokens.ts`: light at `:79-155` and dark at `:157-233`. There are almost no hard-coded colours elsewhere; only the chart palette in `components/Dashboard.tsx:17`. So the fix is to change token values, not screens.

**Failing pairs** (computed with WCAG 2.x):

| Token | Light | Dark | Used for |
|---|---|---|---|
| `ink3` #999999 | **2.50–2.85** | 4.57–5.56 ok | 30 places: chevrons, captions, keypad letters (`dialer.tsx:75` at **9px**), counts |
| `inkPlaceholder` #AAAAAA | **2.04–2.32** | **2.63–2.71** | placeholders. Also real text: the empty dial pad display (`dialer.tsx:121`) and `DispositionPicker.tsx:56` |
| `violet` #7C6CD6 | **3.71–4.22** | ok | progress bars, the on-call status dot |
| `danger` #DC3545 (as text/icon) | **3.98–4.53** | ok | error icons; End button fill |
| `call` #2D874E (as text, onCall/call) | **3.94–4.48** | ok | call icons, the green Call button label |
| `warningFg` | **4.18** on page; **4.45** on warningBg | ok | warning chips, break icons |
| `neutralFg` #6C757D | **4.12–4.69** | ok | neutral chips |
| `line` / `divider` | **1.03–1.29** | **1.50–1.58** | input borders, dividers |
| `primary` #7168A5 dark (onPrimary/primary) | ok | **4.42**; pressed **3.31**; as text **2.94–3.92** | every primary button in dark mode |
| `errorFg` / `errorBg` dark | ok | **4.13** | error chips |
| toast action (`lavender` on invert) | ok | **1.63** | toast actions |
| `callControl` vs `callScreen` | **1.23** | **1.27** | Mute/Hold/Keypad button fills: the buttons have no visible edge |
| status dots on the top-bar pill | **2.0–2.97** | ok | Online/Break/On call/Paused dots |

**Suggested new values.** These were checked with the same formula; re-verify after changing anything around them.

| Token | Light: old → new | Dark: old → new |
|---|---|---|
| `ink3` | #999999 → **#666670** (4.99 on page, 5.68 on white) | unchanged |
| `inkPlaceholder` | #AAAAAA → **#757575** (4.61 on white; inputs sit on surface) | rgba(255,255,255,.3) → **rgba(255,255,255,.55)** |
| `violet` | #7C6CD6 → **#6352C4** (5.22 on page) | unchanged |
| `danger` | #DC3545 → **#C82333** (4.93 on page; white on it is 5.6) | unchanged |
| `call` | #2D874E → **#1F6E3D** (5.50 on page; white on it is 6.26) | unchanged |
| `warningFg` | #A86207 → **#8F5306** (5.41 on page) | unchanged |
| `neutralFg` | #6C757D → **#5A6168** (5.51 on page) | unchanged |
| `primary` / `navy` | unchanged | fill #7168A5 → **#5E5694** (onPrimary 5.78); `primaryPressed` → **#544C88** (6.75). For primary **text** use `purple` #ADA5E1 or a new `primaryText` #9A92D6 (6.2 on surface). |
| new `lineStrong` | about **#84848C**: use it for input borders, the outline button and the call control border. Keep `line` and `divider` for decorative dividers only (WCAG doesn't require 3:1 for those). | about **rgba(255,255,255,.4)** |
| new `toastAction` | lavender (ok) | **#534B82** (7.79 on white) |

**Call screen controls.** Give `Control` (`app/call/active.tsx:23-70`) a 1.5px `lineStrong` border, or make the `callControl` fill a stronger tint, so each button's edge reaches 3:1 against `callScreen`.

**Status dots.** These are solved by 1.3 (icon + label). Also darken the light-mode dot colours used on the pill: `signalOk` → `successFg` #1E7B34, `signalWarn` → #8F5306, Paused → #4A4A5A. They are about 3.6–5.9 against the pill fill.

**Keep it fixed with a test.** Add `src/theme/__tests__/contrast-test.ts`. It computes the ratios for a list of `[fg, bg, minRatio]` token pairs in both palettes and fails CI if any regress. It's about 40 lines (a luminance helper plus a table), it makes "fix colours in one place" permanent, and it's the most valuable single item in this section.

The unused `outdoor` palette (`tokens.ts:235-256`) can be deleted, or exposed as a "High contrast" theme option. Recommendation: delete it now, and revisit if agents use the app outdoors.

### 1.2 Shared colour roles

The requested small set (primary, surface, text, success, warning, error) already exists as `primary`, `surface`, `ink/ink2/ink3` and the `tone()` helper (`success | error | warning | info | purple | neutral`, each with `bg/fg/line`). Don't add a parallel set. Instead:
- Document the roles at the top of `tokens.ts`: which role is for text, which for icons, which for fills.
- Lint for misuse with a grep check in review: `ink3` must not be used under 12px. `signal*` is for dots only, never text.

### 1.3 Agent status: icon + label, not only colour

**Today:**
- `TopBar.tsx:24-28,40-115`: `StatusPill` = a 10px coloured dot + label + elapsed timer.
- `StatusSheet.tsx:99-158`: the sheet has Online + the break list; there is **no "Pause" option**.
- Statuses: `AgentStatus = 'available' | 'break' | 'offline'` (`domain/types.ts:1`). `offline` is labelled **"Paused"**. On call and Wrap-up are derived states (`TopBar.tsx:51-52`).

**Change.**
1. Add `domain/agentStatus.ts` with one map from display state to `{ label, icon, tone }`. Use it from the pill, the sheet, the dial pad chip (4.2) and the toasts (0.2):

   | State | Label | Icon (MaterialIcons) | Tone |
   |---|---|---|---|
   | available | Online | `check-circle` | success |
   | break | {break label} | `free-breakfast` (or the break type's own icon) | warning |
   | offline | Paused | `pause-circle` | neutral |
   | oncall | On call | `phone-in-talk` | purple |
   | wrap | Wrap-up | `edit-note` | info |
   | break overrun | {label} · over | `timer-off` | error |

2. In `StatusPill`, replace the 10px dot with a 16–18px icon in the tone's `fg`. Keep the label, which is already there.
3. **Naming.** The request says "Online, Break, Pause, Offline". The app has only three agent statuses, and "Paused" is what `offline` is called; the server has no offline (`api/client.ts:516`: "signing out is the way off"). Recommendation: keep three. **Don't** add a separate Offline state unless the backend adds one.

### 1.4 Feedback on every tap

| Requirement | Today | Change |
|---|---|---|
| Visible pressed state | `Button` darkens, **except `danger` and `call`, where pressed == bg** (`components/ui.tsx:113-114`). There is none on `Segmented` (`ui.tsx:550-575`), `Toggle` (`:662-683`) or the `SectionHeader` action (`:424`). `Card` pressed (`subtle`) is about 1.04:1, effectively invisible. The End button has scale only (`active.tsx:341-373`). | Add `dangerPressed` and `callPressed` tokens (about 10% darker) and use them in `Button` and the End button. Give `Segmented` and the `SectionHeader` action a `c.pressed` background. Change Card's pressed fill to `c.pressed` (rgba overlay) instead of `subtle`. |
| Light vibration on call, end call and disposition | Call: `tap('medium')` (`useDial.ts:30`). Connect: **sound only** (`feedback/events.ts`, `call.connected` has no haptic). End: `call.ended` = medium. Disposition: `disposition.saved` = success. | Add `haptic: 'light'` to `call.connected`. Everything else is already in place. Make sure the End button fires `call.ended` even when the call never connected; today it fires only `press` then (`active.tsx:349`). |
| Spinner while loading | `Button loading` exists (`ui.tsx:151`); the End button has one while `dialPending`. | Audit async buttons that don't pass `loading`: Go online (StatusSheet), the campaign switch confirm, wrap-up Submit and Submit-and-break, Snooze/Done, and the toast actions (Go online should show progress until `/go-online` returns). `IconButton` has no `loading` prop; add one. |
| Disabled look | `Button` uses opacity 0.45, `IconButton` 0.4, `Control` 0.35, `Toggle` 0.6. | Pick one value: **0.4 opacity plus a dimmed label**, never colour alone. Add `accessibilityState.disabled` where it's missing. |

### 1.5 Bigger buttons (48dp minimum)

Most small controls are already padded to 48 with `hitSlop`; `IconButton` does it automatically (`ui.tsx:197`). These are not:

| Element | Location | Today | Change |
|---|---|---|---|
| Filter chips | `app/(tabs)/calls.tsx:309-330` | 32 tall, no hitSlop | height 40 + hitSlop 4, or a `Pill` |
| `Pill` | `components/ui.tsx:297` | 36, no hitSlop | hitSlop 6 (it's used in wrap-up disposition fields too) |
| Web / Sync chips | `components/TopBar.tsx:131,170` | 32, no hitSlop | hitSlop 8 |
| `StatusPill` | `TopBar.tsx:88` | 40 | height 44 + hitSlop 2 |
| Recording seek bar | `components/RecordingPlayer.tsx:112` | 24 | touch area 48 (visual track can stay thin) |
| `Slider` | `components/Slider.tsx:50` | 32 | touch area 48 |
| `Segmented` | `ui.tsx:550` | 42 | 48 |
| Toast action | `feedback.tsx:131` | text-sized | a 48dp button (0.2) |

**Call screen sizing** (`app/call/active.tsx`): Mute, Hold and Keypad are 68dp circles, and the End button is a 200×64 pill. That is already above 48. For one-handed use:
- Put **Mute, Hold and End** within thumb reach. Today the six controls wrap 3 per row in a `maxWidth: 300` grid (`:275-286`), so Mute and Hold land in the first row, furthest from the thumb.
- Reorder to: row 1 Keypad · Audio · Transfer/Conf (less frequent); row 2 **Mute · Hold** (larger, about 76dp); then End.
- Consider putting Transfer and Conference in a "More" control to cut the grid to 4 buttons.

### 1.6 Tidy text styles (4–5 sizes)

**Today:**
- `T` variants (`ui.tsx:56-68`): display 34, title 24, h2 18, h3 16, body 15, label 13, caption 12, overline 11.
- 14 distinct static sizes are used, counting inline overrides: 9, 10, 11, 12, 13, 15, 16, 18, 20, 24, 26, 28, 34, 36.

**Target scale (5 sizes):**

| Size | Variants | Use |
|---|---|---|
| 32 | `display` | call screen number/name, dial pad digits |
| 22 | `title` | screen titles, call timer |
| 17 | `h2` (semibold/bold) | section headers, sheet titles |
| 15 | `body`, `bodyStrong` | default |
| 13 | `label`, `caption`, `overline` | meta text, chips, tab labels |

Steps:
1. Change `ui.tsx:56-68` to this scale. Merge `h3` into `h2` or `bodyStrong`, and `caption` and `overline` into 13 with different weight or case.
2. Remove the inline `fontSize` overrides:
   - `dialer.tsx:75` (9 → 13 in `ink2`)
   - `dialer.tsx:120` (36 → display)
   - `active.tsx:175` (28 → display)
   - `active.tsx:235` (26)
   - `active.tsx:463` (16)
   - `incoming.tsx:147` (28)
   - `Transfer.tsx:217,331,388,391` (9!)
   - `DispositionPicker.tsx:56`
   - `TopBar.tsx:243` (10)
   - `ui.tsx:241,511`
3. **Call screen hierarchy** (`active.tsx:165-197`):
   - The name/number is 28px today; make it `display` (32).
   - Under a known name, the **phone number is only 15px** (`:181-185`). Raise it to `title` (22), tabular-nums.
   - The **timer is 16px** (`:186-194`). Raise it to `title` (22), tabular-nums, `ink` (not `onCallScreen2`).
   - Shrink the 84px avatar to 64 to make room.

---

## 2. Call screen: remove Notes and Script, add "Required details"

### 2.1 Remove Notes and Script

All in `app/call/active.tsx` unless stated:

| Remove | Lines |
|---|---|
| `useCampaignScript` import/use; `useSession` (only used for the script's fallback) | 16, 18, 81-83 |
| `notes` selector, `setNote` | 78, part of 79 |
| `infoTab` state and its `'script' → 'notes'` fallback | 87, 94-95 |
| swipe-up gesture | 109-114 |
| the bottom "notes bar" (grabber + "Contact · Notes · Script") | 246-272 |
| the info `Sheet` (Notes `TextInput`, Script `ScrollView`, Contact tab) | 436-496 |
| unused imports afterwards: `TextInput`, `Gesture`, `GestureDetector`, `runOnJS`, maybe `ScrollView` | 2-5 |
| `hooks/useCampaignScript.ts` (whole file) | only used here |
| `api.campaigns.script()` | `api/client.ts:487-497` |
| `notes` map + `setNote` in the store | `telephony/callStore.ts:108,116,532,583,841-846,853` |
| wrap-up seeding its note from the in-call draft | `app/call/wrap-up.tsx:157,203` (wrap-up's own Additional Note field at `:575-586` **stays**; it's driven by the disposition template) |
| test asserting notes are pruned | `telephony/__tests__/callStore-test.ts:100-102` |
| copy mentioning the script | `domain/helpText.ts:18` |

The Contact tab's two lines (Customer Name, Mobile Number) move into the new panel.

### 2.2 Backend and admin contract (agree before building)

There is **no admin app in this repo**; it's a separate project (`claritel dialer admin`). Hand the admin-side work to that team with this contract.

**What exists server-side already:**
- `GET /calls/context` (`api/client.ts:211-219, 593-608`) returns:
  - `groups[].fields[]` with `field_key`, `field_type`, `validation_rules`: the campaign's CRM template
  - `values`: the lead's current data
- The app only keeps `values.name` and the phone mask rule.
- `POST /dispositions` already rejects with a message starting "Please fill and save in Lead Details" when required lead fields are missing (`wrap-up.tsx:355-363`).
- So the CRM template and server-side enforcement already exist; what's missing is the per-campaign *agent capture* configuration and a save route.

**Admin: a new per-campaign setting, "Required details".** For each field:
```ts
type CaptureField = {
  key: string;                 // CRM field_key, e.g. "email_id", or a custom key
  label: string;               // "Email"
  type: 'text' | 'email' | 'phone' | 'dropdown' | 'date';
  required: boolean;
  order: number;
  prompt?: string;             // "Ask for their email ID"
  options?: string[];          // dropdown only
  allowDeclined?: boolean;     // show "Customer declined to share" (default true)
};
```
The admin picks from the campaign's CRM template fields (name, email, alternate number, city, …) or adds custom ones.

**Agent API (mobile prefix `/v1/api/agent/mobile`):**

| Need | Proposal |
|---|---|
| Field config | Add `capture_fields: CaptureField[]` to the `GET /calls/context` response, keyed by the **call's** campaign. Auto-dial group calls only learn their real campaign later (`ActiveCall.campaignId`), so it can't come from the agent's selected campaign. Alternatively put it on `GET /campaigns/:id`, which today only returns the script. |
| Prefill | Already in `values`. Masked values must not be sent back; `sendableName()` (`callStore.ts:199-201`) already guards the name. Generalise it. |
| Save a field | **New:** `PATCH /leads/:leadId/fields` with body `{ callUuid, values: { [key]: string \| null }, declined: string[] }` and an idempotency header. It returns the saved values. Calls with no `leadId` (manual dial of an unknown number) need the server to create or attach a lead; today the disposition's `leadData` does that at wrap-up (`wrap-up.tsx:296-329`). Simplest: queue the values locally and send them with the disposition's `leadData` when there's no lead yet. |
| Disposition category | **New:** a `category: 'connected' \| 'not_connected' \| 'dnc' \| 'callback'` (or `is_connected` boolean) on each `/dispositions` row (`client.ts:95-108`). There is no category today, and `RETRY_CODES` in `domain/dispositions.ts:11-15` uses codes that don't match the backend's UUIDs. Without a category, a fallback is to gate whenever the call was answered (`CallRecord.outcome === 'answered'`), but then "wrong number" after answering would be blocked too, which is the exact cheating risk. So ask for the flag. |
| Server enforcement | The server should apply the same rule (required fields only for connected dispositions, declined counts as filled), so the web and the app agree. |

### 2.3 Agent-side data and store

Add these to `useCall` (`telephony/callStore.ts`), keyed by call id like the existing `notes` and `taskLinks` maps. They must survive the active → wrap-up hand-off, and be pruned in `finishWrapUp` (`:839-847`):

```ts
details: Record<callId, {
  fields: CaptureField[];
  values: Record<string, string>;      // prefilled from context.values
  confirmed: Record<string, boolean>;  // prefilled + confirmed by the agent
  declined: Record<string, boolean>;
  saving: Record<string, 'idle' | 'saving' | 'saved' | 'failed'>;
}>
```

- Populate it in `loadContext` (`callStore.ts:233-286`), which already runs at call start and again when the campaign resolves.
- **Save per field.** On blur, or 600ms after typing stops, enqueue a new outbox kind, `{ kind: 'leadField', leadId, callUuid, key, value }`, in `store/outbox.ts` (kinds at `:19-22`, `send()` at `:51-60`).
- Note: today `enqueue()` sends once and **never retries**, because the comment says the web doesn't (`outbox.ts:92-100`). For this kind, the request says "if the call drops, nothing is lost", so **this kind must use the retry path**: push into `items` and let `flush` retry (`MAX_ATTEMPTS = 3`). The store is already persisted (`claritel.outbox`).

### 2.4 The panel UI

Build `components/call/DetailsPanel.tsx` as an **inline** Reanimated view at the top of the call screen, not a `Modal`. `AnimatedSheet` is bottom-only and modal (`components/motion/AnimatedSheet.tsx:118-121`), and a modal would cover the controls.

**Visibility.** Render the panel only when `call.state === 'connected' || 'held'` (as `live` at `active.tsx:98`) and `fields.length > 0`. It never shows while dialling or ringing. Slide it in from the top on first connect with `animateTo(…, 'gentle')`, respecting Reduce Motion (`theme/motion.ts`).

**Collapsed bar** (about 56dp, below the Recording row):
- grabber · "Required details · 1 of 2 captured" · a chevron
- The count is required fields filled, confirmed or declined, out of required fields total
- Tone: neutral while incomplete; a success tick when all required fields are done
- The bar is a button too: tapping it toggles. That's the accessibility alternative to dragging.

**Expanded:**
- Drag down to open and up to close. Use `Gesture.Pan()` on the bar, with the snap and threshold logic mirrored from `AnimatedSheet.tsx:86-104` (positive y opens, `DISMISS`/`FLING` thresholds) and `feedback('sheet.snap')`.
- Max height = the space above the control grid. Measure the controls' `onLayout` y and clamp, so the panel **can never cover Mute, Hold or End**. If the fields don't fit, the panel scrolls inside itself (`ScrollView keyboardShouldPersistTaps="handled"`).
- While expanded, hide `CallMeta` and shrink the header (name + timer on one line) to make room.

**Field rows:**
- Prompt as a caption ("Ask for their email ID"), then the label, a **Required** tag (`StatusChip` tone warning, text label, not colour only), then the input.
- **Prefilled:** "Name: Rahul ✓". Tapping ✓ confirms; tapping the value edits.
- Types:
  - `text` → `Field`
  - `email` → `Field keyboardType="email-address" autoCapitalize="none"`, validated on blur with a simple regex and an inline error
  - `phone` → `keyboardType="phone-pad"`, digit count check
  - `dropdown` → the `SelectField` + `Sheet` pattern from `DispositionPicker.tsx:17-68`; export it as a shared component
  - `date` → the preset-pill `DateTimeField` from `wrap-up.tsx:50-96`, extracted to `components/DateTimeField.tsx`. There's no native date picker dependency; add `@react-native-community/datetimepicker` via `npx expo install` only if presets aren't enough.
- **Declined:** a "Customer declined to share" text button. It sets `declined[key]`, greys the input and counts as captured.
- **Save state:** a small "Saved" / "Saving…" / "Retry" indicator per row.

**Keyboard.** The panel is at the top and the keyboard opens from the bottom. Use `keyboardBehavior` (`components/keyboard.ts`) only on the panel's own `ScrollView`, and don't wrap the whole call screen in `KeyboardAvoidingView`, which would push the controls up.

**Contact info.** The panel is also where CRM data lives: below the capture fields, a collapsed "Contact details" group lists the other `context.values` read-only. Reuse `leadEntries` from `components/CallCard.tsx:184-260` and respect the phone mask rule (`domain/phoneMask.ts`).

### 2.5 Wrap-up: the gate

In `app/call/wrap-up.tsx`:
1. Compute `detailsMissing = requiredFields.filter(f => !value && !declined)` from `useCall.details[callId]`.
2. Gate only connected dispositions. Extend `valid` (`:293-294`):
   `&& !(chosen?.category === 'connected' && detailsMissing.length > 0)`
3. When it's blocked, show an inline message under the picker (near `:546-560`): "Capture 1 more required detail: Email". Add a button, **Add details**, that opens a `Sheet` with the same field rows. The call screen is gone by then, so reuse the panel's field list component.
4. `not_connected`, `dnc` and `callback` skip the check.
5. **Timeout auto-submit** (`:136-144, 464`) bypasses validation today. Keep that (decision 5), and `track({type:'details_incomplete_on_timeout'})`.
6. Keep the server's "Required Fields Missing" handling (`:355-363`) as the backstop.

### 2.6 Tests

- `domain/__tests__/details-test.ts`:
  - count logic (filled / declined / confirmed)
  - email validation
  - gate by category
- `callStore-test.ts`: `details` is created from context, survives `end()`, and is pruned in `finishWrapUp`.
- `outbox-test.ts`: a `leadField` item is retried and persisted.

---

## 3. Dial pad: manual calls not allowed

### 3.1 Pre-tap warning

**Dial pad** (`app/(tabs)/dialer.tsx`) and the centre tab Call button (`app/(tabs)/_layout.tsx:57,81-89`):
- `const block = useDialAvailability('keypad')` (0.1).
- If `block?.reason === 'manual_not_allowed'`:
  - show a slim banner above the keypad: icon `phone-disabled` + "Manual dialing is off for {campaign}" (warning tone, text + icon)
  - dim the centre Call button: 0.4 opacity, `accessibilityHint` "Manual dialing is off for this campaign"
  - **keep it tappable**, so tapping still shows the toast with its action
- The agent can still type a number. `useDialpad` doesn't change.

### 3.2 On tap

`useDial` → `canDial` → the `manual_not_allowed` toast from 0.2.

### 3.3 "Switch campaign" opens the picker

Today the picker is a local `useState` inside `AppMenu` (`components/AppMenu.tsx:95-194`, expansion at `:102`). Only the whole menu can be opened from outside (`useAppMenu.getState().show()`, `:16-20`).

Change `useAppMenu` to `show(section?: 'campaign')`. When `section === 'campaign'`, open the menu with the campaign list already expanded, and filter or sort it so campaigns with `allowManualCalls !== false` come first, labelled "Manual dialing on". The existing guards still apply: "Finish the current call…" (`:119`) and "Your admin has set your campaign" (`:120`). If `allowSelection` is false, the toast must say "Contact your admin" rather than offer **Switch campaign**, so pass `allowSelection` into `canDial` too.

### 3.4 Admin changes the setting mid-session

The check already runs at tap time, but `allowManualCalls` comes from `GET /campaigns`, which is loaded at login and campaign sync.
- Refresh it on app foreground and on pull-to-refresh: add `syncCampaigns()` to `useData.sync()` (`store/data.ts:150-194`).
- If the server rejects `POST /calls/manual` for this reason, map it. Ask the backend for a code, for example `reason: 'MANUAL_CALLS_DISABLED'`, readable via `ApiError.reason` (`api/errors.ts:5`). Today it would surface as a generic "Call Failed" (`callStore.ts:645`). On that code, refresh campaigns and show the `manual_not_allowed` toast.

### 3.5 Other entry points

Per decision 6, contacts and recent calls (`source: 'contact' | 'history'`) are blocked the same way; this is a one-line change, because `canDial` handles it. On those screens:
- Dim the call buttons via `useDialAvailability(source)`: `contacts.tsx:84`, `contact/[id].tsx:93`, `CallCard` "Call back" (`components/CallCard.tsx:175`), `call-detail/[id].tsx:129`.
- **Don't** hide them, so the toast can explain.
- Callbacks (`source: 'task'`) are exempt.

---

## 4. Dial pad: agent not online

### 4.1 Toast

`canDial` returns `{reason:'status', label}` with the label from `useStatusLabel` (`components/StatusSheet.tsx:24-42`): "Lunch Break", "Paused", and so on. The toast reads "You're on Lunch Break. Go online to make calls." with a **Go online** action.

- The action calls `useSession.getState().setStatus('available')` (`store/session.ts:124-138`).
- That sets the status optimistically and fires `POST /go-online` with **no error reporting and no rollback** (`store/outbox.ts:64, 92-99`).
- For this action, await the request instead (`api.agents.setStatus`), show a spinner in the toast button, and on failure show "Couldn't go online. Try again." That avoids a false "Online" that would make the next dial fail on the server.

Unify the copy: drop "Switch to READY status" / "Status Error" (`useDial.ts:20`, `useAgentSocket.ts:18-20`); the agent never sees the word READY anywhere else.

### 4.2 Status chip on the dial pad

At the top of `dialer.tsx`, show the status chip (icon + label from 1.3) whenever the status is not `available`. The chip is tappable and opens the status sheet (`useStatusSheet.getState().show()`, `StatusSheet.tsx:12-17`). Typing still works; only the Call button is dimmed (same treatment as 3.1).

### 4.3 Both problems at once

`canDial` returns the first reason only, and status comes before manual-dial (0.1). The banner shows the status chip and not the manual-dial banner; once the agent goes online, the manual-dial banner appears. This is already the order in `useDial.ts:18-29`; keep it.

### 4.4 Wrap-up

See decision 7: `wrap_up` comes before status in `canDial`, with the toast "Finish wrap-up first" and the action **Open wrap-up**. Mostly unreachable, since wrap-up is a blocking modal, but `dialDueCallback` can fire during it.

---

## 5. Contact list: empty states

### 5.1 The blocker: the Contacts tab is still mock data

`api.contacts.list` returns `db.contacts` from `mocks/seed.ts` (`api/client.ts:394-395, 782-785`; README line 3). There's no per-campaign list. **The "no list assigned" state can't be real until the backend serves the agent's leads per campaign.**

Ask for:
```
GET /v1/api/agent/mobile/leads?campaignId=…&q=…&cursor=…
→ { listStatus: 'assigned' | 'none' | 'exhausted', listName?: string, leads: [...], nextCursor? }
```

### 5.2 UI, built now against that shape

In `app/(tabs)/contacts.tsx`, which already has pull-to-refresh (`:57`) and empty states (`:90-104`), plus `components/ListPlaceholder.tsx`:

| Case | Detect | Icon | Title | Body | Action |
|---|---|---|---|---|---|
| Loading (first) | `useFirstLoad` | skeleton (exists) | | | |
| No list assigned | `listStatus === 'none'` | `playlist-remove` | No lead list yet | Your admin hasn't assigned a lead list for {campaign}. Pull down to check again, or switch campaigns. | **Switch campaign** (if `allowSelection`) |
| All called | `listStatus === 'exhausted'` | `task-alt` | You've called everyone | Every lead in {listName} has been called. Check back later or switch campaigns. | **Switch campaign** |
| No search results | `q && results.length === 0` | `search-off` | No matches | Nothing found for "{q}". Try a name, company or the last 4 digits. (exists) | **Clear search** |
| Network error | last sync failed (**any** load, not just the first) | `cloud-off` | Couldn't load your leads | Check your connection and try again. | **Retry** |

- **Fix the network error case.** Today the error state shows only before the first successful sync (`hooks/useRefresh.ts:22-25`); later failures fall through to "No contacts yet". Track `lastError` per resource in `useData` and show the error state whenever the list is empty **and** the last fetch failed. If cached rows exist, keep them and use the existing `StatusBanners` "stale data" banner.
- Keep every state a full-screen `EmptyState` inside the `ScrollView`/`FlatList` with `RefreshControl`, so pull-to-refresh works on every state.
- **Wording:** use "lead list" everywhere (decision 9). Change "No contacts yet" / "Leads assigned to you appear here." to the table above. The tab can keep the name "Contacts"; rename it "Leads" if you want full consistency (that touches `app/(tabs)/_layout.tsx`).

---

## 6. Callbacks: remove the add button

1. Remove the header **New** button: `app/(tabs)/callbacks.tsx:64` (and the `Button` import if unused).
2. Remove the other way in: contact detail's **Callback** quick action, `app/contact/[id].tsx:96-98`.
3. Delete `app/task/new.tsx`. It creates a **local-only** task the server never sees (`api/client.ts:803-813`). Also delete the local-task merge in `withServerTasks` (`store/data.ts:70-74`) if nothing else uses it.
   - Check `grep -rn "task/new" src` returns nothing afterwards.
   - Existing local tasks on agents' phones will disappear on the next sync. That's acceptable, because they were never real callbacks; mention it in the release notes.
4. **Confirm the only way in:**
   - wrap-up's **Schedule Callback** toggle (`app/call/wrap-up.tsx:588-616`)
   - → `api.callbacks.create` → `POST /callbacks` (`:377-393`)
   - → `useData.sync()`
   - Also missed inbound calls, which create callback tasks server-side.
5. **Empty state** (`callbacks.tsx:117-126`): change the "Nothing due" body to "Callbacks you schedule while disposing a call will appear here." Keep the "No completed callbacks yet" Done view.
6. **Keep:** Snooze (`callbacks.tsx:106-113`, `task/[id].tsx:127-147`, = `PUT /callbacks/:id`) and Mark done (`DELETE /callbacks/:id`), per decision 8.
7. Calling a callback from an auto campaign is exempt from the manual-dial rule (decision 6). It is still subject to status and wrap-up.

---

## Backend and admin work (hand-off list)

| # | Item | For |
|---|---|---|
| B1 | Per-campaign "Required details" configuration in the admin app (fields, type, required, order, prompt, options, allow declined) | 2 |
| B2 | Return `capture_fields` with `GET /calls/context` (for the call's campaign) | 2 |
| B3 | `PATCH /leads/:leadId/fields` (idempotent), plus handling for calls with no lead | 2 |
| B4 | `category` on each disposition (`connected / not_connected / dnc / callback`) | 2 |
| B5 | Server-side enforcement matching the client rule (connected only, declined counts) | 2 |
| B6 | A reject code for manual dials when the campaign doesn't allow them (`MANUAL_CALLS_DISABLED`) | 3 |
| B7 | `GET /leads?campaignId=` with `listStatus: assigned / none / exhausted` | 5 |
| B8 | `POST /events` for app telemetry (blocked dials, timeout-with-missing-details) | 0.3 |
| B9 | Confirm: may an auto campaign's callbacks be dialled manually? | 3, 6 |

---

## Test checklist (manual, both themes, Android + iOS dev build)

- [ ] The contrast test passes; spot-check the call screen, dial pad, top bar and toasts with a contrast checker.
- [ ] Every status shows an icon + label on the pill, the sheet and the dial pad chip.
- [ ] Danger and call buttons, Segmented, Card and the End button visibly change while pressed.
- [ ] A light vibration on connect, end call (connected or not) and disposition saved.
- [ ] TalkBack/VoiceOver: the details panel toggles via its bar, the Required tag is read, and toasts with actions don't vanish.
- [ ] Details panel: hidden while ringing; appears on connect; never covers Mute, Hold or End, even with the keyboard open on a small phone (360×640); a field saved before the call drops is still there after reconnect or in wrap-up.
- [ ] Wrap-up: a connected disposition is blocked until required fields are filled or declined; No answer/Busy/DNC aren't blocked; ACW timeout still submits.
- [ ] Dial on Break → one toast, with **Go online**; going online then dialling works.
- [ ] Break + manual-off campaign → status toast only. After going online → manual-off toast with **Switch campaign** (or "Contact your admin" when nothing allows manual dialing or selection is locked).
- [ ] Admin flips `allow_manual_calls` mid-session → after a foreground or pull-to-refresh, the banner updates; a tap before refresh is rejected by the server and shows the same toast.
- [ ] Contacts: each of the 5 states renders and pull-to-refresh works from each.
- [ ] Callbacks: no add button anywhere; a callback created in wrap-up shows up; Snooze and Done work.
