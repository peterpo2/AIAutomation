export const USER_ROLES = ['Admin', 'CEO', 'Team', 'Client'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
}

export interface RoleDefinition {
  role: UserRole;
  label: string;
  summary: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'viewDashboard',
    label: 'View dashboard',
    description: 'Access the SmartOps overview with key automation metrics and activity feed.',
  },
  {
    key: 'manageUsers',
    label: 'Manage users',
    description: 'Invite teammates, assign roles, and deactivate accounts.',
  },
  {
    key: 'manageUploads',
    label: 'Manage uploads',
    description: 'Queue, edit, and approve social media assets prior to scheduling.',
  },
  {
    key: 'viewReports',
    label: 'View reports',
    description: 'Access performance analytics and export campaign level reports.',
  },
  {
    key: 'manageSettings',
    label: 'Manage workspace settings',
    description: 'Modify workspace preferences including authentication and notification settings.',
  },
  {
    key: 'manageIntegrations',
    label: 'Manage integrations',
    description: 'Configure Dropbox, messaging, and other external integrations.',
  },
  {
    key: 'configureAutomation',
    label: 'Configure automation',
    description: 'Adjust schedulers, AI captioning rules, and system level automation.',
  },
  {
    key: 'approveCampaigns',
    label: 'Approve campaigns',
    description: 'Provide executive sign-off on strategic campaigns prior to launch.',
  },
  {
    key: 'viewFinancials',
    label: 'View financial insights',
    description: 'Review campaign budgets, spend, and high level ROI metrics.',
  },
  {
    key: 'receiveAlerts',
    label: 'Receive critical alerts',
    description: 'Be notified of escalations, failures, and mission critical activity.',
  },
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'Admin',
    label: 'Administrator',
    summary: 'Owns platform configuration, integrations, and technical operations.',
  },
  {
    role: 'CEO',
    label: 'Executive (CEO)',
    summary: 'Oversees strategic initiatives, approvals, and financial performance.',
  },
  {
    role: 'Team',
    label: 'Marketing Team',
    summary: 'Manages day-to-day campaign execution and content preparation.',
  },
  {
    role: 'Client',
    label: 'Client / Stakeholder',
    summary: 'Has read-only visibility into deliverables and reports.',
  },
];

export const ROLE_PERMISSIONS: Record<UserRole, PermissionDefinition['key'][]> = {
  Admin: PERMISSION_DEFINITIONS.map((permission) => permission.key),
  CEO: [
    'viewDashboard',
    'manageUsers',
    'manageUploads',
    'viewReports',
    'manageSettings',
    'manageIntegrations',
    'configureAutomation',
    'approveCampaigns',
    'viewFinancials',
    'receiveAlerts',
  ],
  Team: ['viewDashboard', 'manageUploads', 'viewReports', 'receiveAlerts'],
  Client: ['viewDashboard', 'viewReports'],
};

export const DEFAULT_ROLE: UserRole = 'Client';
