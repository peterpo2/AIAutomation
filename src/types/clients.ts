export type ClientStatus = 'Active' | 'Paused' | 'Prospect';

export interface ClientMetrics {
  totalViews: number;
  engagementRate: number;
  completionRate: number;
  postsPerWeek: number;
}

export interface ClientAccount {
  handle: string;
  username: string;
  password: string;
  followers: number;
  lastPosted: string | null;
}

export interface ClientRecord {
  id: string;
  name: string;
  industry: string;
  region: string;
  status: ClientStatus;
  notes: string;
  account: ClientAccount;
  metrics: ClientMetrics;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ClientFormValues {
  name: string;
  industry: string;
  region: string;
  status: ClientStatus;
  notes: string;
  handle: string;
  username: string;
  password: string;
  followers: number;
  totalViews: number;
  engagementRate: number;
  completionRate: number;
  postsPerWeek: number;
  lastPosted: string | null;
}
