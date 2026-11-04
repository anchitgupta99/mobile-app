/**
 * STUN/TURN servers for the webphone's call audio: the same servers and TURN login as the web agent
 * app's webphone (SIPContext.tsx), on the SIP domain the backend sends. TURN relays the audio when a
 * mobile network or router blocks the direct path.
 */
const TURN_USERNAME = 'clariteluserfs';
const TURN_PASSWORD = 'claritel2026';

export function iceServersFor(sipDomain: string) {
  return [
    { urls: `stun:${sipDomain}:3478` },
    { urls: `turn:${sipDomain}:3478`, username: TURN_USERNAME, credential: TURN_PASSWORD },
    { urls: `turns:${sipDomain}:5349`, username: TURN_USERNAME, credential: TURN_PASSWORD },
  ];
}
