import { T } from './ui';
import type { ComponentProps } from 'react';

/**
 * A number as the app shows it. The server decides: numbers come masked per campaign from the server (call
 * history), or are masked by the campaign's rule (live calls, see the call store), so they are shown as they come.
 */
export function usePhoneDisplay() {
  return (n: string) => n;
}

/** A call's customer as the server shows them: the lead's name, else the number (masked as the campaign says) */
export function useCallParty() {
  const phone = usePhoneDisplay();
  return (c: { number: string; displayNumber?: string; customerName?: string }, contactName?: string | null) => {
    const number = c.displayNumber ?? phone(c.number);
    return { name: contactName || c.customerName || number, number, named: !!(contactName || c.customerName) };
  };
}

export function PhoneText({ number, ...rest }: { number: string } & ComponentProps<typeof T>) {
  const show = usePhoneDisplay();
  return (
    <T nums accessibilityLabel={`Number ending ${number.slice(-3).split('').join(' ')}`} {...rest}>
      {show(number)}
    </T>
  );
}
