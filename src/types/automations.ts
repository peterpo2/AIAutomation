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
}
