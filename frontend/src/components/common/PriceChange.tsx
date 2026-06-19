export function PriceChange({
  value,
  suffix = '%',
  className = '',
  showArrow = true,
}: {
  value: number | null | undefined;
  suffix?: string;
  className?: string;
  showArrow?: boolean;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={`text-txt-secondary ${className}`}>—</span>;
  }
  const pos = value >= 0;
  return (
    <span className={`font-semibold ${pos ? 'text-status-green' : 'text-status-red'} ${className}`}>
      {showArrow && (pos ? '▲ ' : '▼ ')}
      {pos ? '+' : ''}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}
