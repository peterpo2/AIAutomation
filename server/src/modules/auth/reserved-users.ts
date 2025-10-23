import type { UserRole } from './permissions.js';

export interface SeedUserDefinition {
  role: UserRole;
  email: string;
  password?: string;
  displayName?: string;
}

const DEFAULT_ACCOUNTS = {
  admin: {
    role: 'Admin' as const,
    email: 'admin@smartops.test',
    password: 'DemoAdmin123!',
    displayName: 'SmartOps Administrator',
  },
  ceo: {
    role: 'CEO' as const,
    email: 'ceo@smartops.test',
    password: 'DemoCeo123!',
    displayName: 'SmartOps CEO',
  },
  team: [
    {
      role: 'Team' as const,
      email: 'marketing@smartops.test',
      password: 'DemoTeam123!',
      displayName: 'Marketing Strategist',
    },
    {
      role: 'Team' as const,
      email: 'creative@smartops.test',
      password: 'DemoTeam123!',
      displayName: 'Creative Producer',
    },
    {
      role: 'Team' as const,
      email: 'operations@smartops.test',
      password: 'DemoOps123!',
      displayName: 'Operations Specialist',
    },
    {
      role: 'Team' as const,
      email: 'editor@smartops.test',
      password: 'DemoTeam123!',
      displayName: 'Content Editor',
    },
    {
      role: 'Team' as const,
      email: 'analyst@smartops.test',
      password: 'DemoTeam123!',
      displayName: 'Performance Analyst',
    },
  ],
} as const;

const parseRole = (value: string | undefined, fallback: UserRole): UserRole => {
  if (!value) return fallback;
  const normalized = value.trim();
  const allowed: UserRole[] = ['Admin', 'CEO', 'Team'];
  return allowed.includes(normalized as UserRole) ? (normalized as UserRole) : fallback;
};

const stringOrNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const getAdminEmail = () => stringOrNull(process.env.FIREBASE_ADMIN_EMAIL) ?? DEFAULT_ACCOUNTS.admin.email;
export const getAdminUid = () => stringOrNull(process.env.FIREBASE_ADMIN_UID);
export const getAdminPassword = () =>
  stringOrNull(process.env.FIREBASE_ADMIN_PASSWORD) ?? DEFAULT_ACCOUNTS.admin.password;

export const getCeoEmail = () => stringOrNull(process.env.FIREBASE_CEO_EMAIL) ?? DEFAULT_ACCOUNTS.ceo.email;
export const getCeoUid = () => stringOrNull(process.env.FIREBASE_CEO_UID);
export const getCeoPassword = () => stringOrNull(process.env.FIREBASE_CEO_PASSWORD) ?? DEFAULT_ACCOUNTS.ceo.password;

const getStandardSeatSeed = (index: number): SeedUserDefinition | null => {
  const defaultSeed = DEFAULT_ACCOUNTS.team[index] ?? null;
  const emailKey = `SMARTOPS_TEAM_${index + 1}_EMAIL` as keyof NodeJS.ProcessEnv;
  const passwordKey = `SMARTOPS_TEAM_${index + 1}_PASSWORD` as keyof NodeJS.ProcessEnv;
  const roleKey = `SMARTOPS_TEAM_${index + 1}_ROLE` as keyof NodeJS.ProcessEnv;
  const nameKey = `SMARTOPS_TEAM_${index + 1}_NAME` as keyof NodeJS.ProcessEnv;

  const email = stringOrNull(process.env[emailKey]) ?? defaultSeed?.email ?? null;
  if (!email) return null;

  const password = stringOrNull(process.env[passwordKey]) ?? defaultSeed?.password ?? undefined;
  const role = parseRole(process.env[roleKey], 'Team');
  const displayName = stringOrNull(process.env[nameKey]) ?? defaultSeed?.displayName ?? undefined;

  return { role, email, password, displayName };
};

export const getStandardSeatSeeds = (): SeedUserDefinition[] => {
  return [0, 1, 2, 3, 4]
    .map((index) => getStandardSeatSeed(index))
    .filter((seed): seed is SeedUserDefinition => seed !== null);
};

export const getSeedUsers = (): SeedUserDefinition[] => {
  const adminEmail = getAdminEmail();
  const ceoEmail = getCeoEmail();

  const seeds: SeedUserDefinition[] = [];

  if (adminEmail) {
    seeds.push({
      role: 'Admin',
      email: adminEmail,
      password: getAdminPassword(),
      displayName: DEFAULT_ACCOUNTS.admin.displayName,
    });
  }

  if (ceoEmail) {
    seeds.push({
      role: 'CEO',
      email: ceoEmail,
      password: getCeoPassword(),
      displayName: DEFAULT_ACCOUNTS.ceo.displayName,
    });
  }

  return seeds.concat(getStandardSeatSeeds());
};

export const getImmutableAssignments = () => ({
  adminEmail: getAdminEmail(),
  ceoEmail: getCeoEmail(),
});

export const DEFAULT_ACCOUNT_SUMMARY = {
  admin: DEFAULT_ACCOUNTS.admin,
  ceo: DEFAULT_ACCOUNTS.ceo,
  team: DEFAULT_ACCOUNTS.team,
};
