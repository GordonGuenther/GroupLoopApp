import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

type DateTimeFieldProps = { value: Date; onChange: (value: Date) => void };

// `datetime-local` works in local time without seconds: "2026-09-24T14:30".
const toInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

/** Picks a date and time with the browser's native input. */
export function DateTimeField({ value, onChange }: DateTimeFieldProps) {
  const theme = useTheme();
  return (
    <input
      type="datetime-local"
      value={toInputValue(value)}
      onChange={(event) => event.target.value && onChange(new Date(event.target.value))}
      style={{
        color: theme.text,
        backgroundColor: theme.backgroundElement,
        border: 'none',
        borderRadius: Spacing.two,
        padding: `${Spacing.two}px ${Spacing.three}px`,
        fontSize: 16,
        fontFamily: 'inherit',
      }}
    />
  );
}
