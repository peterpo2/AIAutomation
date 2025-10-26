export type AutomationStatus = 'operational' | 'monitor' | 'upcoming';

export interface AutomationNode {
  code: string;
  step: string;
  title: string;
  description: string;
  function: string;
  aiAssist: string;
  status: AutomationStatus;
  statusLabel: string;
  sequence: number;
  dependencies: string[];
  deliverables: string[];
  webhookPath: string;
  webhookUrl: string | null;
  connected: boolean;
  position?: { x: number; y: number } | null;
  positionX?: number | null;
  positionY?: number | null;
  layout?: { x: number; y: number } | null;
}

export interface AutomationRunResult {
  code: string;
  ok: boolean;
  httpStatus: number | null;
  statusText: string | null;
  webhookUrl: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  requestPayload: unknown;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
  error?: string;
}

export type AutomationRunStatus = 'idle' | 'running' | 'success' | 'error';

export interface AutomationRunState {
  status: AutomationRunStatus;
  result?: AutomationRunResult;
}
