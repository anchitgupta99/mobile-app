# Claritel Agent (mobile)

React Native (Expo SDK 57, Expo Router) app for field agents, built from _PRD: Agent Mobile App_. It covers the MVP agent loop: ring or dial, screen pop, in call, wrap-up, then available again. It runs against the dialer backend's agent mobile routes; only the Contacts tab still shows sample data.

Colours, type and radii come from the Claritel admin app (`claritel dialer admin/src/app/globals.css` and `docs/reference/brand-colors.md`). The app uses the same light and dark roles, Roboto, and Material icons.

## Run

```bash
npm install
npx expo start          # press w for web, or scan with a development build
npm run typecheck
npm run lint
npm test
npm run format
```

### Backend

The app talks to the dialer backend's agent mobile routes (`/v1/api/agent/mobile`). Copy `.env.example` to `.env.local` (git ignores it) and set `EXPO_PUBLIC_API_URL`:

- Backend running on your own PC: `http://<your PC's Wi-Fi IPv4>:4000`. Not `localhost`, because the app runs on the phone. The phone must be on the same Wi-Fi, and the address changes when the PC joins another network.
- A deployed backend (UAT / production): the same value as the web app's `VITE_API_BASE`, e.g. `EXPO_PUBLIC_API_URL=https://<domain>/backend`.

The live socket (`/ws`) uses the API URL's domain automatically (`https://<domain>/backend` → `https://<domain>`), so one value is enough. `EXPO_PUBLIC_SOCKET_URL` is only for a socket on a different domain. For an APK, set the value in the build profile's `env` in `eas.json`, since EAS does not see `.env.local` and the value is fixed into the app at build time.

Restart with `npx expo start -c` after changing it. The app needs the URL: without it every request fails with "The server address is not set".

**APK on the deployed backend** (`eas build --profile preview --platform android`): the `preview` profile in `eas.json` builds an installable APK with `EXPO_PUBLIC_API_URL=https://dialer.claritel.ai/backend`, so it works on any network. Changing the server means changing that value and building again.

The webphone (WebRTC) and the call audio routing need the development build (`eas build --profile development`); they can't run in Expo Go.

### Flow

1. **Login**: login ID and password, with a SIP (webphone) or Mobile (phone-line) tab. There is no OTP step.
2. **Preflight** ("Ready to go live?"): app permissions (microphone, notifications) plus internet, webphone and headset checks. **Go live** sets the agent Available and opens the tabs; **Log out** returns to login. The same screen is reachable later from Profile → Diagnostics.
3. **Tabs**: Home, Calls, Dialer, Contacts and Callbacks, with the status pill and menu in the top bar.

## Motion, haptics and sound

Every confirmation goes through `feedback(event)` in `src/feedback`. Tune the haptic and sound for each event in `src/feedback/events.ts`. Timings and springs live in `src/theme/motion.ts`.

UI sounds are generated placeholders. `npm run sounds` rewrites `assets/sounds/*.wav`, and branded files can replace them under the same names. Sounds respect the silent switch, and during a live call only the call-critical ones play (keypad, connect, end). **Settings → UI sounds / Haptics** turn each layer off. Motion follows the OS Reduce Motion setting.

Gestures: drag sheets down to close, swipe call rows (right: call back, left: disposition) and task rows (right: done, left: snooze), slide to answer, swipe up on the in-call notes bar, and swipe toasts away. Each gesture also has a tap or screen-reader alternative.

## Structure

| Path                     | What                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/`               | Routes. `(tabs)` holds Home, Calls, Dialer, Contacts and Callbacks. `call/` holds the incoming, in-call and wrap-up modals.                                                    |
| `src/theme/`             | Colour roles for light and dark, plus spacing, radius and font tokens                                                                                                          |
| `src/components/`        | Shared building blocks: `ui.tsx`, `TopBar` (status pill), `Sheet`, `feedback` (toasts and dialogs), rows                                                                       |
| `src/components/motion/` | Reanimated and Gesture Handler primitives: `PressableScale`, `AnimatedSheet`, `SwipeRow`, `FadeInItem`, `RollingDigits`                                                        |
| `src/feedback/`          | Semantic feedback: `feedback('event')` maps to a haptic and a UI sound. `events.ts` is the tuning table and `gate.ts` holds the gating rules (settings, live call, web).       |
| `src/api/`               | The backend client (`client.ts`, `http.ts`), the live socket (`socket.ts`) and the event stream (`events.ts`)                                                                  |
| `src/telephony/`         | The webphone (`sip/`), its call adapter (`voip.ts`) and the call state machine (`callStore.ts`)                                                                               |
| `src/store/`             | Session, settings, the local data cache (delta sync), and the offline outbox with idempotency keys                                                                             |
| `src/mocks/seed.ts`      | The Contacts tab's sample contacts and their activity timeline (not on the server yet)                                                                                        |

## Requirement coverage (MVP)

- **AUTH**: login ID and password with Standard, SIP and Mobile login, a "Ready to go live?" pre-flight (internet, webphone, headset and mic checks, re-run from Profile → Diagnostics), device registration, biometric lock after idle time, remote sign-out that wipes local data
- **STAT**: status pill on every tab with a timer and an Available / Break (Bio, Meeting, Lunch, Tea) / Offline menu, status changes from the web app applied in real time; a header theme toggle and a menu with campaign, auto-call (on by default), profile, settings and log out
- **HOME**: mobile agent analytics with Today / Yesterday / custom ranges, live queue, totals, shift bar, inbound and outbound rows, and collapsible call time, break time, hourly trend and AHT charts
- **IN**: screen pop, phone-line fallback, a missed call creating a callback task with an SLA timer
- **OUT**: dial from the keypad (the center tab becomes the call button on the Dialer), a contact, history or a task; a preview card for task calls; DNC and calling-hour checks; auto-call dials the next lead after wrap-up in auto campaigns
- **CALL**: mute, hold, keypad, audio route, transfer, conference and end; internal (agent directory) and external transfer targets with consult, busy / no answer / declined states, merge into conference and per-participant mute and remove; a sheet with editable CRM fields (live calls only), notes and script; a network quality indicator
- **WRAP**: disposition chips from config, conditional fields (Callback opens date presets and creates a task), ACW timer, Submit and go available, a required disposition that blocks back and dismiss, local-first save; after submit the call is read-only
- **HIST**: read-only call cards, lead search, Today / Yesterday / date range, More filters (call type, disconnected by, duration, campaign, disposition), call back, a copyable lead details sheet, recording playback at 1×, 1.5× and 2× from signed, expiring URLs
- **CRM**: search by name, company or last digits; a 360 timeline; contacts are read-only outside a live call
- **TASK**: callbacks: create, complete and snooze; overdue, today and upcoming groups
- **SET**: campaign, agent profile (view and edit) and log out
- **NFR**: masked numbers, screenshot blocking on contact and recording screens, 48 dp tap targets, screen-reader labels, dynamic text up to 1.6×

## Not real yet (needs a development build and the backend)

- **Native ringing.** `src/telephony/nativeCall.ts` is a shim. Wire it to CallKit and ConnectionService, for example `react-native-callkeep` plus PushKit and FCM high-priority VoIP pushes.
- **VoIP audio.** The SIP/WebRTC stack with Opus is not connected. `voipAdapter` only calls the API.
- **Real API.** Swap `src/api/client.ts` for the client generated from the shared OpenAPI spec, and `realtime.ts` for the WebSocket.
- **Secure storage.** Tokens sit in AsyncStorage. Move them to `expo-secure-store` (Keychain and Keystore) and encrypt the local cache.
- **Notifications.** Push notifications and local reminder notifications are not set up yet (`expo-notifications`).
