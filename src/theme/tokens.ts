export type Palette = {
  shell: string;
  page: string;
  surface: string;
  subtle: string;
  mutedFill: string;
  pressed: string;
  selected: string;
  overlay: string;
  invert: string;
  onInvert: string;

  ink: string;
  ink2: string;
  ink3: string;
  inkPlaceholder: string;
  inkStrong: string;

  line: string;
  /** Edge of an interactive control (input, outline button, chip, switch): at least 3:1 against surface */
  controlBorder: string;
  divider: string;

  navy: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  purple: string;
  onPurple: string;
  lavender: string;
  onLavender: string;
  lavenderSoft: string;
  violet: string;
  accentInk: string;

  alert: string;
  onAlert: string;
  danger: string;
  /** danger, about 10% darker: pressed fill for danger buttons */
  dangerPressed: string;
  onDanger: string;
  call: string;
  /** call, about 10% darker: pressed fill for call buttons */
  callPressed: string;
  onCall: string;

  topbar: string;
  onTopbar: string;
  topbarControl: string;

  signalOk: string;
  signalWarn: string;
  signalDown: string;

  successBg: string;
  successFg: string;
  successLine: string;
  errorBg: string;
  errorFg: string;
  errorLine: string;
  warningBg: string;
  warningFg: string;
  warningLine: string;
  infoBg: string;
  infoFg: string;
  infoLine: string;
  purpleBg: string;
  purpleFg: string;
  purpleLine: string;
  neutralBg: string;
  neutralFg: string;
  neutralLine: string;

  callScreen: string;
  callScreen2: string;
  onCallScreen: string;
  onCallScreen2: string;
  callControl: string;
  /** Edge of an in-call button, so it separates from the call screen */
  callControlBorder: string;
  /** Pressed fill for an inactive in-call button */
  callControlPressed: string;
  callControlActive: string;
  onCallControlActive: string;

  shadow: string;
  /** Resting lift for cards (a boxShadow string). Dark mode lifts with a lighter surface instead. */
  cardShadow: string;
  /** Fill behind the selected tab icon: clearly stronger than the page */
  tabSelected: string;
};

export const light: Palette = {
  shell: '#F4F4F7',
  page: '#F4F4F7',
  surface: '#FFFFFF',
  subtle: '#F9F9FB',
  mutedFill: '#F7F7F8',
  pressed: 'rgba(27,27,60,0.12)',
  selected: '#F0EFFB',
  overlay: 'rgba(12,13,13,0.5)',
  invert: '#27292B',
  onInvert: '#FFFFFF',

  ink: '#333333',
  ink2: '#666666',
  ink3: '#686874',
  inkPlaceholder: '#6B6B76',
  inkStrong: '#181A1B',

  line: '#E2E2E4',
  controlBorder: '#82819A',
  divider: '#ECECF0',

  navy: '#1B1B3C',
  primary: '#534B82',
  primaryPressed: '#494276',
  onPrimary: '#FFFFFF',
  purple: '#534B82',
  onPurple: '#FFFFFF',
  lavender: '#B4B4EC',
  onLavender: '#1B1B3C',
  lavenderSoft: '#E6E6FF',
  violet: '#7C6CD6',
  accentInk: '#1B1B3C',

  alert: '#BA1A1A',
  onAlert: '#FFEDEA',
  danger: '#DC3545',
  dangerPressed: '#C62F3E',
  onDanger: '#FFFFFF',
  call: '#277A46',
  callPressed: '#22693C',
  onCall: '#FFFFFF',

  topbar: '#B4B4EC',
  onTopbar: '#1B1B3C',
  topbarControl: 'rgba(255,255,255,0.45)',

  signalOk: '#28A745',
  signalWarn: '#C2750A',
  signalDown: '#DC3545',

  successBg: '#F0F9F4',
  successFg: '#1E7B34',
  successLine: '#D4EDDA',
  errorBg: '#FFF5F5',
  errorFg: '#C82333',
  errorLine: '#F8D7DA',
  warningBg: '#FFF6EC',
  warningFg: '#8F5300',
  warningLine: '#FBE3C4',
  infoBg: '#EEF4FF',
  infoFg: '#2557D6',
  infoLine: '#D6E2FB',
  purpleBg: '#F3EFFB',
  purpleFg: '#57329A',
  purpleLine: '#E1D8F5',
  neutralBg: '#F8F9FA',
  neutralFg: '#5C636A',
  neutralLine: '#E2E3E5',

  callScreen: '#E6E6FF',
  callScreen2: '#F0EFFB',
  onCallScreen: '#1B1B3C',
  onCallScreen2: '#5C5C7A',
  callControl: '#FFFFFF',
  callControlBorder: '#7E7D96',
  callControlPressed: '#CCCAE8',
  callControlActive: '#534B82',
  onCallControlActive: '#FFFFFF',

  shadow: 'rgba(27,27,60,0.18)',
  cardShadow: '0px 1px 2px 0px rgba(27,27,60,0.06), 0px 4px 12px 0px rgba(27,27,60,0.06)',
  tabSelected: '#D6D5F5',
};

export const dark: Palette = {
  shell: '#0C0D0D',
  page: '#0C0D0D',
  surface: '#1E2022',
  subtle: '#27292B',
  mutedFill: '#3D4143',
  pressed: 'rgba(255,255,255,0.12)',
  selected: 'rgba(113,104,165,0.15)',
  overlay: 'rgba(0,0,0,0.65)',
  invert: '#FFFFFF',
  onInvert: '#000000',

  ink: '#F2F2F3',
  ink2: '#AFB3B6',
  ink3: 'rgba(175,179,182,0.75)',
  inkPlaceholder: 'rgba(255,255,255,0.5)',
  inkStrong: '#F2F2F3',

  line: 'rgba(255,255,255,0.15)',
  controlBorder: 'rgba(255,255,255,0.38)',
  divider: 'rgba(255,255,255,0.15)',

  navy: '#7168A5',
  primary: '#5E5596',
  primaryPressed: '#6B62A6',
  onPrimary: '#FFFFFF',
  purple: '#ADA5E1',
  onPurple: '#121024',
  lavender: '#C6C6FC',
  onLavender: '#1B1B3C',
  lavenderSoft: 'rgba(161,161,236,0.25)',
  violet: '#ADA5E1',
  accentInk: '#DBD5FF',

  alert: '#FF6157',
  onAlert: '#330002',
  danger: '#FF877A',
  dangerPressed: '#E6796E',
  onDanger: '#330002',
  call: '#80D997',
  callPressed: '#73C388',
  onCall: '#00381B',

  topbar: '#181A1B',
  onTopbar: '#F2F2F3',
  topbarControl: 'rgba(255,255,255,0.08)',

  signalOk: '#80D997',
  signalWarn: '#E6B538',
  signalDown: '#FF6157',

  successBg: 'rgba(128,217,151,0.2)',
  successFg: '#80D997',
  successLine: '#2D874E',
  errorBg: 'rgba(255,135,122,0.2)',
  errorFg: '#FF8A80',
  errorLine: '#BA1A1A',
  warningBg: 'rgba(255,211,98,0.15)',
  warningFg: '#FFE5A3',
  warningLine: '#866000',
  infoBg: 'rgba(0,130,195,0.2)',
  infoFg: '#53C6FF',
  infoLine: '#00689C',
  purpleBg: 'rgba(113,104,165,0.15)',
  purpleFg: '#DBD5FF',
  purpleLine: '#494276',
  neutralBg: 'rgba(255,255,255,0.1)',
  neutralFg: '#AFB3B6',
  neutralLine: 'rgba(255,255,255,0.15)',

  callScreen: '#0C0D0D',
  callScreen2: '#181A1B',
  onCallScreen: '#F2F2F3',
  onCallScreen2: '#AFB3B6',
  callControl: 'rgba(255,255,255,0.16)',
  callControlBorder: 'rgba(255,255,255,0.38)',
  callControlPressed: 'rgba(255,255,255,0.28)',
  callControlActive: '#ADA5E1',
  onCallControlActive: '#121024',

  shadow: 'rgba(0,0,0,0.5)',
  cardShadow: '0px 0px 0px 0px transparent',
  tabSelected: 'rgba(161,161,236,0.32)',
};

export const outdoor: Palette = {
  ...light,
  page: '#FFFFFF',
  shell: '#FFFFFF',
  ink: '#000000',
  ink2: '#1F1F1F',
  ink3: '#3D3D3D',
  inkPlaceholder: '#5C5C5C',
  inkStrong: '#000000',
  line: '#000000',
  controlBorder: '#000000',
  divider: '#5C5C5C',
  topbar: '#1B1B3C',
  onTopbar: '#FFFFFF',
  topbarControl: 'rgba(255,255,255,0.2)',
  lavenderSoft: '#C6C6FC',
  successFg: '#00521F',
  errorFg: '#8A0012',
  warningFg: '#5C3B00',
  infoFg: '#00326E',
  purpleFg: '#2E1466',
  neutralFg: '#1F1F1F',
};

export type Tone = 'success' | 'error' | 'warning' | 'info' | 'purple' | 'neutral';

export function tone(p: Palette, t: Tone) {
  return {
    bg: p[`${t}Bg` as const],
    fg: p[`${t}Fg` as const],
    line: p[`${t}Line` as const],
  };
}

export const space = {
  '4xs': 4,
  '3xs': 8,
  '2xs': 12,
  xs: 16,
  s: 20,
  md: 24,
  lg: 32,
  xl: 40,
} as const;

export const radius = {
  '2xs': 4,
  xs: 8,
  card: 16,
  sm: 16,
  md: 24,
  lg: 32,
  pill: 500,
} as const;

export const font = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  semibold: 'Roboto_600SemiBold',
  bold: 'Roboto_700Bold',
} as const;

export const minTap = 48;
