export type UserRole = 'Admin' | 'CEO' | 'Team';

export interface UserProfile {
  email: string;
  role: UserRole;
  createdAt: string | null;
  permissions: string[];
  immutableRole?: boolean;
}

export interface RoleDefinition {
  role: UserRole;
  label: string;
  summary: string;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
}

export interface PermissionMatrix {
  roles: RoleDefinition[];
  permissions: PermissionDefinition[];
  rolePermissions: Record<UserRole, string[]>;
  immutableAssignments: {
    adminEmail: string | null;
    ceoEmail: string | null;
  };
}

