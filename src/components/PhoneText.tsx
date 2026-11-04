import { maskNumber } from '@/domain/format';
import { useSettings } from '@/store/settings';
import { T } from './ui';
import type { ComponentProps } from 'react';

export function usePhoneDisplay() {
  const reveal = useSettings((s) => s.revealNumbers);
  return (n: string) => (reveal ? n.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') : maskNumber(n));
}

export function PhoneText({ number, ...rest }: { number: string } & ComponentProps<typeof T>) {
  const show = usePhoneDisplay();
  return (
    <T nums accessibilityLabel={`Number ending ${number.slice(-3).split('').join(' ')}`} {...rest}>
      {show(number)}
    </T>
  );
}
