# Full app review: 20 Nov 2026

This is a read-only review: no code was changed. It follows on from `APP_REVIEW_2026-11-02.md`.

**Static checks:**
- `tsc`: **2 errors** in `src/telephony/sip/sipPhone.ts`:
  - `270`: implicit `any` on `e`.
  - `365`: `removeAllListeners` does not exist on the type `UA`.
- `expo lint`: clean.
- `jest`: 10 suites and 56 tests pass. Jest reports a worker that didn't exit cleanly, which points to a leaked timer (`src/api/demo.ts:190`).

## Status (updated 20 Nov 2026, same day)

The P0 and P1 findings are fixed in the working tree. The fixes are not committed, because there is no git repo, and they have not been tested on a device.
- **Fixed:** T1, T3–T9, D1, D2, D4–D6, T2, U1–U5, #74, and the two `tsc` errors.
- **After the fixes:** `tsc` clean, `expo lint` clean, `jest` 11 suites and 66 tests pass.
- **D3 is partly fixed.** `android.allowBackup: false` is set. The cache still keeps `number` and `recordingUrl`, because calling back from history, resuming wrap-up and the recording player all need them.
- **T5:** a call that arrives while the idle lock is on now lifts the lock without asking for biometrics.
- **D4:** the "Switched to X, but couldn't go online" message shows, but AppMenu still treats it as a failure.
- **D2:** if two quick status changes both fail, the app rolls back to the first change, not to the original status.
- **P2 and P3 fixes (later the same day):** every P2/P3 finding is fixed (T10–T19, D7–D17, U6–U18). Three other changes went in with them:
  - The "Recording" badge was removed from the call screen, at the user's request.
  - The preflight microphone mismatch is fixed: on web, a dismissed browser prompt was read as "denied".
  - AppMenu now treats "Switched campaign, but couldn't go online" as a partial success.
- **After the P2/P3 fixes:** `tsc` clean, `expo lint` clean, `jest` 12 suites and 74 tests pass.
- **Checked in the web demo:**
  - The login, preflight and dashboard screens load.
  - Calls: a 10-digit number formats correctly, the call screen shows no Recording badge, and ending the call opens wrap-up.
- **Not checked on a device:** native-only behaviour, including the ringtone, audio routes, Android Back, supervisor sessions and recording audio.
- **Known gaps left in place:**
  - A campaign switch during a sync can still merge contacts from the old campaign.
  - `setCampaign` doesn't reset `lastSyncAt`.
  - "Custom date" does nothing until the dashboard's first load finishes.
  - A webphone registration that fails during a call stays failed until the app comes back to the foreground or the agent retries.
- **Change in behaviour:** network failures now report the `'offline'` error code, and timeouts say "The request timed out".

Three reviewers covered the app area by area. I re-checked the headline findings myself against the code. They are marked ✔ in the tables.

Priority key:
- **P0:** breaks a core flow, loses data or is a security problem.
- **P1:** wrong behaviour an agent will hit.
- **P2:** a correctness or interaction issue.
- **P3:** minor.

## Prior review status
- **Still fixed:** #1, #2, #3, #5, #6, #8 (outbound), #18, #36, #37, #56–58, #66.
- **Fixed but now undone:** #4, #13 and #14. `outbox.enqueue` now sends a change once and never queues it (see D1).
- **Only partly fixed:**
  - #21: the token is now in SecureStore, but customer data is still stored in plain AsyncStorage.
  - #31: the sync cursor is still the device clock.
  - #40: "Back to call" still resumes a call the agent had put on hold (see T7).
- **Still open:** #72 (wrap-up state is not persisted).
- **#74 traced:** the warning comes from `Dashboard.tsx:112`, where `flex: p.value` sits in an inline style. The Babel plugin warns on any `.value` there. Rename the field or hoist it into a variable.

## Telephony and call flow

| # | P | File | Problem | Failure scenario | Fix |
|---|---|------|---------|------------------|-----|
| T1 ✔ | P0 | `callStore.ts:276`, `store/details.ts:62,101` | `useDetails.setIds` is never called. The details store keeps whichever `leadId` arrived first, which is often null. | On a manual dial to a new number, the context returns before the dial does. The details the agent fills in look captured, but `save()` sends nothing. At wrap-up `call.leadId` is set, so `leadData` is left out and the data is lost. | Call `setIds` wherever a call's `uuid` or `leadId` is set, then retry any entries still idle. |
| T2 | P1 | `data.ts:58-64`, `client.ts:307` | A sync during wrap-up swaps the local call for the server row. That row has no `listId` or `campaignPrefix`, and may have no `leadId`. | The agent leaves the app during wrap-up and comes back, which runs a sync. The disposition is then sent with an empty `listId`, and possibly with `leadData`, which creates a duplicate lead. | Keep the local-only fields when merging, or skip the merge for the call in wrap-up. |
| T3 ✔ | P1 | `callStore.ts:588,608` | `startOutbound` drops `contactId` and always stores `null`. | A call made from a contact page never shows on that contact's timeline, and its `lastDisposition` is never updated. | Take `contactId` from the input and store it on the call. |
| T4 ✔ | P1 | `callStore.ts:685,751` | An accepted inbound call sits in `'dialing'` until the status poll comes back. `end()` treats that as "never rang". | The agent accepts and hangs up within a second or so. No wrap-up opens and `reportEnded()` isn't sent, so the server waits in DISPO. The screen also says "Calling…" and the vibration keeps going. | Use `'connected'` after accept, or add an `accepted` flag. Stop the vibration on accept. |
| T5 | P1 | `_layout.tsx:187`, `callStore.ts:837` | Incoming calls are still taken while the idle lock is on, but call routing is off. | A predictive call connects behind the lock screen. An accept/reject call rings under the overlay and is declined automatically after 30 s. | Unlock, or skip the lock, while a call is active. Or set the agent to not-ready while locked. |
| T6 | P1 | `nativeCall.ts:7` | The only ring cue is vibration, and it is gated on the haptics setting. There is no ringtone. | With haptics off, an incoming call rings silently and is missed. | Play a ringtone (InCallManager) whatever the haptics setting. |
| T7 ✔ | P1 | `callStore.ts:470,552` | `startServerConsult` always sets `heldBefore: false`. | The agent holds the customer, the transfer fails, the agent taps "Back to call", and the customer is taken off hold without warning. | Set `heldBefore: c.state === 'held'`. |
| T8 | P1 | `Transfer.tsx:564-583` | The transfer screen always says the customer is "On hold", but the backend consult never holds the call. | The agent believes the customer can't hear them and talks freely. | Show the real call state, or actually hold the call. |
| T9 ✔ | P2 | `callStore.ts:689-701` | `decline()` never hangs up the SIP session, and a failed reject request is ignored. | The reject fails and the SIP session stays up. Every later INVITE is ignored as "already on a call". | Call `hangupSip()` in `decline()`. |
| T10 | P2 | `sipPhone.ts:207,290` | A supervisor intervention session becomes the single `session`, and its `ended` event ends the agent's own call. | Monitoring blocks the agent's next INVITE. When the supervisor hangs up, the agent's new call is ended. Whisper or barge during a live call is always dropped. | Track each session by its role. |
| T11 | P2 | `useSipRegistration.ts:16` → `sipPhone.ts:359` | A retry when the app returns to the foreground calls `stop()`, which hangs up the live call. | A REGISTER refresh fails briefly during a call, the agent switches apps and comes back, and the call is dropped. | Skip the retry while a call is active. |
| T12 | P2 | `callStore.ts:730`, `audioRoute.ts:297` | The audio-route button shows the route the agent picked, whatever the native result. | The button reads "Bluetooth" while audio still comes from the earpiece. | Only offer routes for devices that are present, and show the route the system actually reports. |
| T13 | P2 | `active.tsx`, `incoming.tsx` | Android hardware Back pops the call screen, and routing then pushes it back. | Sheets and the keypad lose their state, and the screen flashes. | Use `BackHandler` / `usePreventRemove` to close the open panel first, and otherwise do nothing. |
| T14 | P2 | `useDial.ts:114,122` | Callback tasks are dialled as MANUAL, because `callback: true` is never passed. | In a campaign with manual dialling off, calling back a task fails on the server. | Pass `callback: source === 'task'`. |
| T15 | P2 | `Transfer.tsx:494` | The country-code picker on the transfer screen is thrown away when the number is sent. | The agent picks +44 and the number is dialled without it. | Remove the picker, or send the code. |
| T16 | P2 | `details.ts:107` | A detail counts as "captured" as soon as it is typed, even if its save is idle or failed. | Wrap-up's required-details check passes, but the CRM never gets the values. | Count only saved values as captured, or send the values with the disposition. |
| T17 | P3 | `callStore.ts:473` | `transferredTo` is set before the transfer request succeeds. | The notes say "Transferred to Bob" when no transfer happened. | Set it only after the request succeeds. |
| T18 | P3 | `incoming.tsx:174`, `active.tsx:115,303` | Feedback problems on the call screens. | 1. The success haptic plays before the accept succeeds. 2. A remote no-answer end gives no cue. 3. The Hold button's accessibility label becomes just "Failed". 4. The "Recording" pill is hard-coded. | Fix each as listed. |
| T19 | P3 | `wrap-up.tsx:95,195,711` | Wrap-up rough edges. | 1. "Submit and break" is enabled even when the form is invalid. 2. The callback time can be moved into the past. 3. If `campaignId` is missing, the dispositions spinner never stops. | Match the disabled states, keep the callback in the future, and treat a missing `campaignId` as "no options". |

## Data, sync, auth and API

| # | P | File | Problem | Failure scenario | Fix |
|---|---|------|---------|------------------|-----|
| D1 ✔ | P0* | `eas.json`, `api/http.ts:9,14` | The production profile has no `EXPO_PUBLIC_API_URL`, and `DEMO = !API_URL` means a missing URL quietly turns on demo mode. | A production build without the EAS dashboard variable accepts any login and shows fake data. (*Check whether the variable is set in the EAS dashboard.) | Set the URL on the profile. Allow demo only with `__DEV__` or an explicit flag, and fail closed otherwise. |
| D2 ✔ | P1 | `outbox.ts:92-100` | `enqueue` sends each change once and never adds it to `items`. This looks deliberate, to match the web, but `pendingIds`, `flush`, parking, the Sync screen list and the logout "N not synced" warning can no longer do anything. | 1. A failed status change or "mark done" shows no error, and the change on the phone is never rolled back. 2. Two status changes made close together can reach the server in either order. 3. A sync can overwrite a snooze that hasn't reached the server yet. 4. A failed DELETE leaves the callback SCHEDULED, so it is auto-dialled again. | Either restore queueing, or await each request and roll back with a toast. Send status changes one at a time. |
| D3 | P1 | `data.ts:316`, `app.json` | Customer data is cached in plain AsyncStorage: unmasked `dial_number`, names, notes and `recording_url`. `allowBackup` defaults to true. | Masked numbers turn up in an adb or Google backup. | Don't persist the raw number or the recording URL, and set `android.allowBackup: false`. |
| D4 | P1 | `session.ts:110-119` | When `select` succeeds but `goOnline` throws, the status pill still says Available and the menu says "Couldn't switch". | The server has the agent paused while the app shows them as available. | Wrap `goOnline` in its own try, and set the status to offline when it fails. |
| D5 ✔ | P1 | `login.tsx:159` | `onSubmitEditing` calls `run()` and skips the `busy` and empty-field guards. | A double tap on Go sends two logins. If the replies arrive out of order, the app keeps a stale token and the agent sees "session expired". | Add a ref guard at the top of `run()`. |
| D6 ✔ | P1 | `socket.ts:80` | Nothing reconnects after an `io server disconnect`, and the heartbeat stops. | An agent who keeps the app open is paused after 30 s and logged out after 3 min. | Call `s.connect()` when the reason is `io server disconnect`. |
| D7 | P2 | `forgot-password.tsx:266,323,418` | Keyboard submit on the forgot-password steps skips the loading guard. | A double Send emails two codes. A double Go on the new password shows "session expired" after the reset already succeeded. | Add a ref guard to each step. |
| D8 | P2 | `http.ts:36,85` | POST and PUT requests have no timeout. | On a half-open connection the Log In spinner never stops, and only killing the app recovers. | Add a 20 s timeout. |
| D9 | P2 | `data.ts:162,172` | `sync()` drops calls made while one is already running, and a stale result overwrites the dispositions campaign. | On a fresh login the campaignId stays `''` all session, so the Calls tab disposition filter is empty. | Queue a follow-up sync when one is running. Only apply the result if the campaign still matches. |
| D10 | P2 | `data.ts:198` | `wipe()` doesn't reset `refreshing`, and the `catch` block writes `syncError` after a wipe. | After logging out mid-sync and logging back in, the first load is skipped or shows "failed". | Reset `refreshing` in `wipe()`, and check `gen` in the `catch` and `finally` blocks. |
| D11 | P2 | `http.ts:95-100` | The `'offline'` error code is never produced, so every `offline` branch is dead code. | Items are parked as "rejected" when the phone simply has no network. | Throw `'offline'` on a network failure. |
| D12 | P2 | `profile.tsx:62,145` | When the profile fails to load there is no error message and no retry, and Edit stays disabled. | The agent can't edit their profile for the rest of the visit. | Show an inline error with a Retry button. |
| D13 | P2 | `details.ts:58-79` | Saves to the same field can land out of order. | A stale value wins on the server. | Keep a sequence number per field and ignore stale replies. |
| D14 | P3 | `session.ts:81` | `syncCampaign` writes to the store before it checks the token. | The previous agent's campaigns can come back after a logout. | Move the token check above the write. |
| D15 | P3 | `forgot-password.tsx:111` | The OTP resend countdown is a chain of timeouts, which pause in the background. | The countdown is wrong when the agent comes back from their email app. | Count down from a stored deadline. |
| D16 | P3 | `profile.tsx:122`, `forgot-password.tsx:65,119` | Small validation and navigation gaps. | 1. Change password can be sent with empty or mismatched fields. 2. The `saving` guard reads stale render state. 3. A `rules` param with no `minLength` can never be satisfied. 4. After a reset, a second login screen is stacked on the first. | Fix each as listed. |
| D17 | P3 | `sync.tsx:78`, `useSyncFailureToast.ts` | The Sync screen, the retry and discard buttons, and the related copy describe the old queue, which no longer exists. | — | Remove them, or restore the queue (D2). |

## Screens and UI interactions

| # | P | File | Problem | Failure scenario | Fix |
|---|---|------|---------|------------------|-----|
| U1 | P1 | `AnimatedSheet.tsx:118`, `feedback.tsx:279` | Sheets and dialogs are RN `<Modal>`s, and they stay above the `/call/incoming` screen. | The menu or the recording sheet is open when a call rings. The incoming screen opens underneath and the call is missed. | Close sheets and dialogs when `useCall` gets a call. |
| U2 ✔ | P1 | `domain/phoneMask.ts:75` | `str.slice(-0)` returns the whole string, and a non-numeric `unmask_count` becomes NaN. | A campaign set to mask fully (`end`, unmask 0) shows the full number. | Use `count > 0 ? str.slice(-count) : ''`, and treat NaN as 0. |
| U3 | P1 | `feedback/sounds.ts:42`, `RecordingPlayer.tsx` | The audio mode is set globally with `playsInSilentMode: false`, and the player never pauses. | 1. On iOS with the silent switch on, recordings are silent. 2. A recording keeps playing under a live call. | Set the playback audio mode before `play()`, and pause on blur, when a call starts and when the app goes to the background. |
| U4 | P1 | `feedback.tsx:273` | The toast host sits underneath any open sheet's Modal. | Errors such as "Couldn't switch campaign", the copy confirmations and auto-call errors are never seen. | Render toasts inside the sheet too, or use a portal. |
| U5 ✔ | P1* | `domain/format.ts:68-75` | `formatDialed` cuts `+91` numbers to 10 digits and drops `*` and `#`. | The dialer shows a different number from the one dialled, for example an extra digit or `98765*43210`. | Only format input that is all digits and the exact length. |
| U6 | P2 | `useAgentAnalytics.ts`, `Dashboard.tsx:265` | Analytics never refresh on pull-to-refresh, on focus or after a call. | The dashboard keeps showing stale "Today" figures; picking another range shows old data with no loading state, and fetch errors are hidden. | Expose `reload`, show a loading state when the range changes, and always show errors. |
| U7 | P2 | `task/[id].tsx:139,172` | "Mark done" is a toggle, and Snooze calls `router.back()` with no latch. | A double tap reopens the task, or pops two screens. | Latch with a ref, and use an explicit "set done" instead of a toggle. |
| U8 | P2 | `AppMenu.tsx:305`, `AppMenu.tsx:33-51` | Logout flushes for up to 15 s per item before showing anything. | The agent taps Log out again. | Show a busy state straight away. |
| U9 | P2 | `TaskRow.tsx:107` | The green "Call {who}" button opens the task instead of dialling. | Agents, and screen-reader users, expect it to dial. | Dial through `useDial`, or relabel it "Open callback". |
| U10 | P2 | `calls.tsx:227`, `CallCard.tsx:76`, `TaskRow.tsx:31` | List performance: `contacts.find` runs for every row on every keystroke, each TaskRow has its own 30 s interval, and FadeInItem replays on virtualized rows. | Lists lag as calls and contacts grow. | Build a contact `Map` once with `useMemo`, share one `now`, and drop the fade inside virtualized lists. |
| U11 | P3 | `calls.tsx:467`, `DispositionPicker.tsx:140` | Sheet content is cleared before the exit animation finishes. | Sheets slide down empty, or show "Nothing matches". | Keep the last value until the sheet has fully closed. |
| U12 | P3 | `(tabs)/_layout.tsx:226` | Every visited tab mounts its own TopBar. | Up to 5 copies of the timers, intervals and status feedback run at once. | Hoist the TopBar above `<Tabs>`, or set `freezeOnBlur`. |
| U13 | P3 | `(tabs)/_layout.tsx:36` | `Date.now()` sits inside a zustand selector. | The Callbacks badge goes stale and disagrees with the bell. | Use `useNow`. |
| U14 | P3 | `useDial.ts:112` | `useDial` has no in-flight guard. | Double-tapping Call shows a false "Already on a call" error. | Add a busy ref. |
| U15 | P3 | `RecordingPlayer.tsx:68` | Reloading after the link expires restarts from 0, and fast taps load twice. | The agent loses their place in the recording. | Seek back to the saved position after the reload, and guard with a ref. |
| U16 | P3 | `AppMenu.tsx:241` | The auto-call switch has no pending state. | The agent taps twice and two requests go out. | Flip the switch straight away, or disable it while the request runs. |
| U17 | P3 | `contact/[id].tsx:44` | A disabled QuickAction is still announced and acts as enabled. | The DNC "Call" button gives a haptic with no explanation. | Pass `disabled`, and show the DNC reason. |
| U18 | P3 | `task/[id].tsx:131`, `calls.tsx:240` | "Tomorrow" snooze adds 24 h to the due time, and the "Call" filter also matches "Callback". | The callback is moved to the wrong day, and the Calls filter shows the wrong rows. | Compute tomorrow from today's date, and match the filter exactly. |
