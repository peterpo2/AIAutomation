import type { Client } from '../types/client';

export interface ClientEngagementMetrics {
  views: number;
  watchedVideos: number;
  watchRate: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hashString = (input: string) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const getClientEngagementMetrics = (client: Client): ClientEngagementMetrics => {
  const base = hashString(`${client.id}-${client.name}-${client.tiktokHandle}`);

  const views = 4500 + (base % 5500);
  const watchedVideos = 80 + (base % 120);
  const watchRate = clamp(0.45 + ((base % 35) / 100), 0.45, 0.9);

  return {
    views,
    watchedVideos,
    watchRate,
  };
};
