# Full app review — 2 Nov 2026

Branch `feat/agent-workflow-v2`. Static checks at review time: `tsc` clean, `expo lint` 0 errors / 1 warning, `jest` 9/9 pass, `expo-doctor` 21/21.
Every finding below was verified by reading the cited code.

## Status (updated 2 Nov 2026, same day)

All findings except #69 are fixed in the working tree (uncommitted). Line numbers in the tables are from the original review and have shifted.
After the fixes: `tsc` clean, `expo lint` 0 errors / 0 warnings, `jest` 9 suites / 36 tests pass, `expo-doctor` 21/21.

Still open or newly noticed while fixing:

| # | Area | Problem | Note |
|---|------|---------|------|
| 69 | Assets | Synthesised placeholder UI/DTMF sounds | Needs branded audio files; out of scope for a code fix |
| 72 | Wrap-up | A hard reload on web (or a crash on native) loses the in-memory `wrapUpCallId`, so the mandatory wrap-up is skipped | Persist `wrapUpCallId`, `notes` and `taskLinks` from the call store |
| 73 | Recording | expo-audio's web player logs an uncaught `NotSupportedError` internally when a source fails to load | Library-internal; the player's own load timeout shows the error state |
| 74 | Animation | Reanimated warns "using shared value's .value inside inline style" on web (pre-existing, source not yet located) | Find the inline style reading `.value` and move it into `useAnimatedStyle` |
| 75 | Product | `app.json` no longer declares VoIP/foreground-service capabilities; they must be re-added together with the native telephony module | Deliberate (#19) |


Priority key: **P0** breaks a core flow or loses data · **P1** wrong behaviour an agent will hit · **P2** correctness / polish / release blockers · **P3** minor, dead code, hygiene.

## P0 — Critical

| # | Area | File | Problem | Failure scenario | Fix |
|---|------|------|---------|------------------|-----|
| 1 | Call flow | `src/telephony/callStore.ts:376,472` | Inbound call accepted during wrap-up overwrites `wrapUpCallId` | Agent is on mandatory wrap-up for call A, call B arrives and is answered; A is left undispositioned forever and completed calls are read-only | Reject/queue inbound while `wrapUpCallId` is set, or keep a wrap-up queue |
| 2 | Call flow | `src/app/_layout.tsx:53-59,120-123` | Idle lock during wrap-up replaces the wrap-up screen; routing never re-pushes it (`prev.current === wrap`) | After unlock, `wrapUpCallId` stays set, every dial fails with "Finish wrap-up first", no UI path back | Treat pending wrap-up like an active call in the lock guard; re-push wrap-up whenever `wrap && here !== 'call/wrap-up'` |
| 3 | Call flow / auth | `src/app/_layout.tsx:94-131`, `src/store/session.ts:101` | `logout()` does not clear the call store; gate (`/login`) and call routing (`/call/active`) fight in an infinite replace/push loop | Remote `device.revoked` or menu logout during a call or wrap-up | Clear `call`, `wrapUpCallId`, `consult`, `conference` on logout; make call routing a no-op unless `token && live && !locked` |
| 4 | Sync | `src/store/outbox.ts:66`, `src/store/data.ts:64-76` | `flush()` returns immediately when already syncing, so `sync()` merges stale server rows over unflushed local edits | Reconnect: call upsert already sent, disposition still queued → server row with `disposition: null` wins the merge | Return the in-flight flush promise; skip merging rows with pending outbox items |
| 5 | Security / privacy | `src/store/data.ts:60-97` vs `session.ts:101` | Remote revoke during an in-flight `sync()` writes contacts/calls back to AsyncStorage after `wipe()` | Signed-out device keeps full CRM cache | Check `token` (or a sync generation) before `set()` in `sync` |
| 6 | Wrap-up | `src/app/call/wrap-up.tsx:130-134` | Only Android hardware back is blocked; browser Back on web escapes wrap-up | Same stuck state as #2 on the web target | Use `beforeRemove` listener (as `useConfirmDiscard` does) or re-push from routing |

## P1 — High

| # | Area | File | Problem | Failure scenario | Fix |
|---|------|------|---------|------------------|-----|
| 7 | Recording | `src/components/RecordingPlayer.tsx:20-41` | Player discards the signed `url` and fakes playback with a `setInterval` | Agent taps Play, progress bar moves, nothing is heard; link expires silently | Build an `expo-audio` player from `r.url`, drive state from it, refetch on expiry |
| 8 | Call flow | `callStore.ts:463-474`, `active.tsx:404` | Ending a call that never connected (checking/dialing) still forces a disposition-required wrap-up | Mis-tap Dial, cancel in <1 s, now blocked from all outbound calls until a fake disposition is entered | Only set `wrapUpCallId` when the call rang/connected; record early cancels as `failed` |
| 9 | Auto-call | `src/telephony/autoCall.ts:23` | Picks any open task by `dueAt` regardless of whether it is due | Auto-call dials a callback scheduled for tomorrow right after wrap-up | Filter `dueAt <= now` |
| 10 | Callbacks | `wrap-up.tsx:214-217` | Any disposition marks the linked callback task done | "No answer" on a callback deletes the callback | Only complete the task for resolved dispositions; snooze otherwise |
| 11 | Lock | `src/app/lock.tsx:21-24` | Lock unlocks with no auth when biometrics not enrolled, and always on web | Lock screen is decorative on those devices | Always call `authenticateAsync` (passcode fallback); require password on web |
| 12 | Splash | `package.json`, `app.json`, `_layout.tsx:25,147` | `expo-splash-screen` not installed and no `splash` config; `preventAutoHideAsync`/`hideAsync` are no-ops; `assets/splash-icon.png` orphaned | Cold start shows the bare white template screen, then jumps to the shader overlay | `npx expo install expo-splash-screen` and add the plugin with image + dark variant |
| 13 | Sync | `src/store/outbox.ts:76-87` | Rejected items retry forever; `attempts` is never read | A validation error keeps the sync chip red indefinitely; only `clear()` escapes and it drops good items too | Park items in a `failed` state after N attempts / non-offline errors |
| 14 | Logout | `src/store/session.ts:103` | Logout clears unsynced outbox with no warning | Three offline dispositions destroyed on logout | Flush first, confirm if items remain, or key outbox by agent |
| 15 | Logout | `src/store/session.ts:101-112` | Logout never sends `offline` to the server; `breakCode`/`statusSince` not reset | Server keeps routing calls to a signed-out device | Send `setStatus('offline')` before wipe |
| 16 | Campaign | `session.ts:79`, `data.ts:70`, `client.ts:172` | Campaign picker only mutates `agent`; disposition config is fetched for the cached campaign id | Pick "Renewals", wrap-up still shows Home Loans dispositions | Pass `agent.campaignId` to `dispositions.config` and resync on change |
| 17 | GL | `src/components/splash/ShaderBackground.tsx:10-27` | `stop.current` is set only in `onContextCreate`; if context is created after unmount the RAF loop never stops | 60 fps draw loop on a destroyed context forever (battery, GL errors) | `unmounted` ref; bail/dispose in `onContextCreate` |
| 18 | Store | `src/store/session.ts:118`, `_layout.tsx:49` | Idle lock only checked on AppState change, not cold start; `status`/`locked` trusted from disk | Kill app, reopen hours later: no lock, still "Available" | Run idle check on hydration; refetch status from server |

## P2 — Medium

| # | Area | File | Problem | Failure scenario | Fix |
|---|------|------|---------|------------------|-----|
| 19 | Release | `app.json:14-18,26-34` | `voip`/`audio` background modes and `MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE*` declared with no native telephony module | App Store / Play review rejection | Remove until the telephony layer exists |
| 20 | Release | `eas.json` | Only a `preview` profile; no `production`/`development`, no `submit` | `eas build` without `--profile` fails | Add the profiles |
| 21 | Security | `src/store/storage.ts:4` | Token and full CRM cache in plain AsyncStorage | Readable on rooted/backed-up Android | `expo-secure-store` for token; keep PII out of persisted payloads |
| 22 | Placeholder | `src/app/login.tsx:30,173` | Login ID prefilled with `priya.sharma`; "Prototype accepts any login ID…" caption; tabs say WebRTC/Mobile not SIP/Mobile | Demo copy in production UI; diverges from plan §1a | Default `''`, gate hints behind `__DEV__`, align labels |
| 23 | Placeholder | `src/components/Preflight.tsx:21-55`, `Transfer.tsx:600` | Hardcoded "Realtek(R) Audio"/"Jabra" devices, timer-based "passed" checks, random level meter, "Prototype: tap a chip…" copy | Phone shows a Realtek mic and a passed webphone check regardless of reality | Gate behind mock flag / `__DEV__` |
| 24 | Placeholder | `src/app/(tabs)/index.tsx:23-34` | Home fabricates queue count (random 2–7 every 15 s) and emits it on the realtime bus | "In queue" tile is noise; freezes on other tabs | Move to the simulator/mocks, label as demo |
| 25 | Wrap-up | `wrap-up.tsx:119,151` | `postCall` flips false on submit before `close()` | Modal flashes "Call closed / read-only" during exit animation | Latch `postCall` in state on mount |
| 26 | Lock | `_layout.tsx:98-101` | Unlock always `replace('/')`, discarding the stack | Agent deep in contact → task loses place | Present lock as overlay / transparentModal |
| 27 | Contact | `src/app/contact/[id].tsx:100` | "Email" quick action is a toast placeholder | Tapping does nothing useful | `Linking.openURL('mailto:…')` |
| 28 | Slider | `src/components/Slider.tsx:15-19` | `minDistance(0)` + `onBegin` writes value on touch-down inside a ScrollView | Starting a scroll on the slider jumps mic/headset level | Use `activeOffsetX`/`failOffsetY`, set in `onStart` |
| 29 | Data | `src/store/data.ts:193-197` | `addNote` writes only local timeline, no caller | Dead code | Enqueue or delete |
| 30 | Data | `data.ts:125-135` | `saveDisposition` updates `lastDisposition`/`lastContactAt` locally only | Other devices never see it | Enqueue a contact patch |
| 31 | Data | `data.ts:65,80`, `client.ts:54` | Delta sync watermark is the client clock | Clock skew skips rows forever | Use server cursor |
| 32 | Android UI | `src/components/InfoTip.tsx:35-68` | Modal without `statusBarTranslucent`; coords from `measureInWindow` | Tooltip lands a status-bar height too low on edge-to-edge | Add translucent flags |
| 33 | Android UI | `AnimatedSheet.tsx:113`, `Sheet.tsx:33` | `navigationBarTranslucent` missing; bottom inset double-padded | Backdrop stops above nav bar, extra gap | Add `navigationBarTranslucent` |
| 34 | GL | `src/components/splash/shader.ts:296-311` | No compile/link status checks; web ignores `webglcontextlost` | Blank/black splash with no log on shader failure | Check status, fall back to solid colour |
| 35 | Status | `outbox.ts:61`, `session.ts:103-108` | Queued local status survives a remote (web) status change | Reconnect re-sends stale Break over supervisor's Available | Drop queued status item on remote change |
| 36 | Telephony | `callStore.ts:411-420` | `answer()`'s delayed `connect` reads `get().call` at fire time | Can mark a different, new call as connected | Capture id and bail if changed |
| 37 | Telephony | `callStore.ts:422-431`, `nativeCall.ts:7` | `decline()` has no inbound guard; vibration ignores haptics setting | Declining a ringing outbound records a "missed" call and creates a callback task | Guard on direction; honour setting |
| 38 | Compliance | `src/telephony/compliance.ts:15`, `autoCall.ts:52-70` | `hour12:false` can yield "24"; invalid timezone throws `RangeError` with no `.catch` in autoCall | Unhandled rejection kills auto-call | `hourCycle:'h23'`, try/catch, add `.catch` |
| 39 | Conference | `callStore.ts:296-303` | Customer leg can be removed while agents remain; one-leg conference never collapses | Agents-only "call" continues | End/convert when customer removed |
| 40 | Consult | `callStore.ts:234,254,287` | cancel/merge unconditionally un-hold | Manually held call resumes unexpectedly | Remember `heldBefore` |

## P3 — Low

| # | Area | File | Problem | Fix |
|---|------|------|---------|-----|
| 41 | Nav | `task/[id].tsx:144,179`, `sync.tsx:36` | `router.back()` without `canGoBack()` guard; dead buttons on cold deep link | Reuse guard pattern |
| 42 | Nav | `wrap-up.tsx:146` | `dismissTo('/callbacks')` unwinds past contact screen | Conditional back |
| 43 | Nav | `+not-found.tsx:20`, `profile.tsx:41` | Not-found bounces via gate; profile renders blank View with no header when `agent` null | Direct root / render header |
| 44 | UX | `(tabs)/index.tsx:96-100` | Home snooze has no Undo (callbacks/notifications do) | Add Undo |
| 45 | UX | `lock.tsx:26-27` | User-cancel shows "Not recognised" | Check `res.error` |
| 46 | Validation | `task/new.tsx:44,141` | `dirty` ignores kind/due; due can be nudged into the past | Include in dirty; clamp |
| 47 | Validation | `forgot-password.tsx:19,282` | "At least 8 characters" not enforced | Add check |
| 48 | Display | `call-detail/[id].tsx:91` | "Ended by: Customer" when `disconnectedBy` undefined | Render "—" |
| 49 | Display | `task/[id].tsx:114` | Raw disposition code shown, not label | Use `useDispositionLabel` |
| 50 | Display | `data.ts:108` | Outbound no-answer titled "Not dispositioned" | Branch on outcome |
| 51 | Display | `data.ts:183-185` | Timeline leaks raw keys (`dnc: true`) | Map to labels |
| 52 | Display | `format.ts:46-50` | "24 h" / "60 min" rounding | Compare unrounded |
| 53 | Display | `CallCard.tsx:188` | Lead Id fabricated from `ct_` → `LD-10` and copyable | Real id or omit |
| 54 | Display | `Dashboard.tsx:374` | "This month" days computed at module load | Compute in render |
| 55 | Data | `dispositions.ts:26` vs `seed.ts:58,97` | `findPath` is leaf-only; seeded parent labels never resolve | Seed leaf labels |
| 56 | Data | `callStore.ts:141-144` | Call UUID not a valid v4 (variant nibble) | Fix variant |
| 57 | Telephony | `voip.ts:14-15` | `mute`/`dtmf` are silent no-ops in VoIP mode | TODO or route via API |
| 58 | Leaks | `callStore.ts:76-77,480`, `simulator.ts:22` | `taskLinks`/`notes` never pruned; module-level realtime handler re-registers on Fast Refresh | Prune in `finishWrapUp`; guard registration |
| 59 | Leaks | `AppMenu.tsx:119,220,184` | 250 ms `setTimeout`s never cleared; "undefined, view profile" when agent null | Ref + clear; default name |
| 60 | Feedback | `feedback/index.ts:17` | `inCall` true while merely ringing; mutes non-critical sounds | Use connected/held |
| 61 | Animation | `TopBar.tsx:167` | Theme icon snaps back 180° after spin | Rotate and leave |
| 62 | Animation | `ListPlaceholder.tsx:19-23` | Reduce Motion toggle can freeze skeleton at 0.45 | Reset opacity in cleanup |
| 63 | Perf | `PressableScale.tsx:19-33`, gesture objects in SwipeRow/AnimatedSheet/Slider | React state per press; gestures rebuilt every render | Shared value / useMemo |
| 64 | A11y | `RecordingPlayer.tsx:77`, `AnimatedSheet.tsx:117`, `InfoTip.tsx:59`, `Dashboard.tsx:60,100` | adjustable without actions; backdrops lack `button` role; labels on non-accessible Views | Add actions / roles |
| 65 | Theme | `ui.tsx:670`, `InfoTip.tsx:74` | `shadowColor: '#000'` instead of `c.shadow` | Use token |
| 66 | Web | `usePermissions.ts:52-55` | `Linking.openSettings()` outside try; rejects on web | Guard |
| 67 | Dead code | `session.ts:72`, `client.ts:71-115`, `types.ts`, `settings.ts:13-20`, `seed.ts:356` | `refreshToken` dropped; `api.phone.*`, `auth.sso`, `devices.setRouting`, server `idleLockMinutes`, DND/language/outdoor settings unused | Delete or keep for contract |
| 68 | Lint | `(tabs)/dialer.tsx:103` | Unnecessary `contacts` dep in `useMemo` (the one lint warning) | Pass contacts to a pure matcher |
| 69 | Assets | `assets/sounds`, `scripts/generate-sounds.mjs` | Synthesised placeholder sounds | Replace before release |
| 70 | Docs | `README.md:18-20`, `AGENT_WORKFLOW_V2_PLAN.md:3` | README describes removed OTP login and demo controls; `device.revoked`/`agent.status_changed` have no emitters; plan says "no code written yet" | Update docs |
| 71 | Repo | `node_modules.zip` (untracked) | 1 stray archive in the repo root | Delete / gitignore |
