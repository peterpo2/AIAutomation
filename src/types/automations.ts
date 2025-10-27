export type AutomationStatus = 'operational' | 'monitoring' | 'warning' | 'error';

export interface AutomationNode {
  code: string;
  name: string;
  headline: string;
  description: string;
  function: string;
  aiAssist: string;
  deliverables: string[];
  dependencies: string[];
  status: AutomationStatus;
  statusLabel: string;
  sequence: number;
  kind: 'webhook' | 'media-fetcher';
  webhookPath?: string;
  webhookUrl: string | null;
  connected: boolean;
  lastRun: string | null;
  position?: { x: number; y: number } | null;
  positionX?: number | null;
  positionY?: number | null;
  layout?: { x: number; y: number } | null;
}

export interface AutomationExecution {
  id: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  logs: string | null;
  result: unknown;
}

export interface AutomationDetail extends AutomationNode {
  metadata: Record<string, unknown> | null;
  executions: AutomationExecution[];
}

export interface AutomationRunCascadeEntry {
  automation: AutomationNode;
  execution: AutomationExecution;
}

export interface AutomationRunResponse {
  automation: AutomationNode;
  execution: AutomationExecution;
  cascade: AutomationRunCascadeEntry[];
}
