import type { ReactNode } from 'react';

export function GlowCard({
  children,
  className = '',
  ringColor,
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  ringColor?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`glass ${hover ? 'glass-hover cursor-pointer' : ''} ${className}`}
      style={ringColor ? { borderColor: ringColor, boxShadow: `0 0 24px ${ringColor}33` } : undefined}
    >
      {children}
    </div>
  );
}
