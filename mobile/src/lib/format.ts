import type { DevicePlatform, WaitingPeriodMinutes } from '@/types';

import type { IconName } from '@/components/ui';

/** "3 minutes ago", "Yesterday", "6 days ago". Used everywhere a timestamp shows. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "2 days", "15 minutes" — how a waiting period is described in prose. */
export function describeWaitingPeriod(minutes: WaitingPeriodMinutes): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 1440) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  const days = minutes / 1440;
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Remaining time on a countdown, as "1d 4h 12m" / "12m 30s". */
export function countdown(targetIso: string, now = Date.now()): string {
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return 'Ready';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** Fraction elapsed between two ISO timestamps, clamped to 0–1. */
export function elapsedFraction(startIso: string, endIso: string, now = Date.now()): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function platformLabel(platform: DevicePlatform): string {
  switch (platform) {
    case 'ios':
      return 'iPhone';
    case 'android':
      return 'Android';
    case 'macos':
      return 'Mac';
    case 'windows':
      return 'Windows PC';
  }
}

export function platformIcon(platform: DevicePlatform): IconName {
  switch (platform) {
    case 'ios':
      return 'phone-portrait';
    case 'android':
      return 'phone-portrait-outline';
    case 'macos':
      return 'laptop-outline';
    case 'windows':
      return 'desktop-outline';
  }
}

/** 74152 → "74k". Domain counts are context, not precision. */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function initialsFrom(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Weekday initials ending today, to label a 7-day sparkline. */
export function weekdayLabels(now = new Date()): string[] {
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    return letters[day.getDay()];
  });
}
