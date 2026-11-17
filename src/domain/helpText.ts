/**
 * Helper text shown behind ⓘ tips and as hints across the app.
 * Kept in one place so product can review and edit the wording without touching screens.
 */
export const helpText = {
  totalCalls: { title: 'Total calls', text: 'Inbound and outbound calls you handled in the selected period.' },
  talkTime: { title: 'Talk time', text: 'Time spent connected to customers. Login is the total time you were logged in.' },
  aht: {
    title: 'AHT (average handling time)',
    text: 'Average time per call, from answer to wrap-up submitted: talk time plus hold plus after-call work.',
  },
  shiftSummary: {
    title: 'Shift summary',
    text: 'How your logged-in time was spent. Call: on calls and wrap-up. Break: any break status. Idle: online and waiting for a call.',
  },
  abandoned: { title: 'Abandoned', text: 'Inbound callers who hung up before an agent answered.' },

  callMode: {
    title: 'Data call vs phone line',
    text: 'Data call uses the internet (WebRTC) and rings in the app. Phone line calls your mobile number and connects you through the regular network. The app picks phone line when your internet is too weak.',
  },
  campaign: { title: 'Campaign', text: 'The campaign this call belongs to. Its disposition list and script are used in wrap-up.' },
  list: { title: 'List', text: 'The lead list inside the campaign that this number came from.' },
  dialMode: {
    title: 'Dial mode',
    text: 'Manual: you dialed. Auto: placed by Auto-call after your last wrap-up. Inbound: the customer called in.',
  },
  callUuid: { title: 'Call UUID', text: 'Unique ID for this call. Share it with support or a supervisor to find the recording and logs.' },

  acw: {
    title: 'After-call work (ACW)',
    text: 'Time to finish wrap-up for this call. When it runs out, the disposition is submitted automatically as it stands.',
  },
  requiredFields: 'A disposition and fields marked * are required. After you submit, this call can’t be edited.',

  sla: {
    title: 'Call-back SLA',
    text: 'The latest time this callback should happen. Missed calls get an SLA automatically; once it passes, it shows as breached.',
  },
  dnc: {
    title: 'Do not call',
    text: 'This number is on the do-not-call list, so calling is blocked. Ask a supervisor if this looks wrong.',
  },
  swipe: 'Swipe a callback right to mark it done, or left to snooze it for an hour.',
  notifications: 'Missed calls, callbacks and reminders that are due now. Swipe right to mark done, left to snooze.',

  permissions: {
    title: 'App permissions',
    text: 'The microphone is needed to talk on calls. Notifications let incoming calls ring while the app is closed.',
  },
  internetCheck: {
    title: 'Internet connection',
    text: 'Checks speed and latency. Weak internet makes data calls choppy; the app can fall back to your phone line.',
  },
  webphoneCheck: { title: 'Webphone', text: 'Checks that this device is registered to your extension so calls can reach it.' },
  headsetCheck: {
    title: 'Headset & microphone',
    text: 'Pick your devices and use Test mic. Keep input level high enough that customers hear you clearly.',
  },

  loginType: {
    title: 'Login type',
    text: 'WebRTC: calls ring in this app over the internet. Mobile: calls ring on your mobile number through the phone line. Pick Mobile if your internet is unreliable.',
  },
  syncChip: 'Changes are saved on this phone and sync when you are back online.',
} as const;
