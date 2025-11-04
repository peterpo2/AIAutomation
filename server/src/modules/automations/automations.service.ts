import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { Prisma, type Automation, type Execution } from '@prisma/client';
import { prisma } from '../auth/prisma.client.js';
import { dropboxService } from '../dropbox/dropbox.service.js';

type AutomationStatus = 'operational' | 'monitoring' | 'warning' | 'error';
type AutomationKind = 'webhook' | 'media-fetcher';

export class AutomationError extends Error {
  readonly status: number;
  readonly details?: unknown;
  readonly severity: AutomationStatus;

  constructor(message: string, status = 500, details?: unknown, severity: AutomationStatus = 'error') {
    super(message);
    this.name = 'AutomationError';
    this.status = status;
    this.details = details;
    this.severity = severity;
  }
}

declare const fetch: typeof globalThis.fetch;

const MEDIA_ROOT = process.env.MEDIA_LIBRARY_ROOT || '/app/media';

interface AutomationBlueprint {
  code: string;
  name: string;
  headline: string;
  description: string;
  function: string;
  aiAssist: string;
  deliverables: string[];
  dependencies: string[];
  statusLabel: string;
  sequence: number;
  kind: AutomationKind;
  webhookPath?: string;
  metadata?: Prisma.JsonObject;
}

export interface AutomationNodeView {
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
  kind: AutomationKind;
  webhookPath?: string;
  webhookUrl: string | null;
  connected: boolean;
  lastRun: string | null;
  position?: { x: number; y: number } | null;
  positionX?: number | null;
  positionY?: number | null;
  layout?: { x: number; y: number } | null;
}

export interface AutomationExecutionView {
  id: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  logs: string | null;
  result: unknown;
}

export interface AutomationNodeDetails extends AutomationNodeView {
  metadata: Record<string, unknown> | null;
  executions: AutomationExecutionView[];
}

export interface AutomationRunCascadeEntry {
  automation: AutomationNodeView;
  execution: AutomationExecutionView;
}

export interface AutomationRunResponse {
  automation: AutomationNodeView;
  execution: AutomationExecutionView;
  cascade: AutomationRunCascadeEntry[];
}

const automationBlueprints: AutomationBlueprint[] = [
  {
    code: 'ACP',
    name: 'AI Content Planner',
    headline: 'Ideation',
    description:
      'Generates new social-media post ideas based on creative briefs or trending topics for every active client.',
    function:
      'Produces JSON-formatted campaign ideas complete with hooks, suggested assets, and CTA guidance.',
    aiAssist: 'OpenAI analyses brand tone, angles, and trend fit to deliver ready-to-review concepts.',
    deliverables: ['Post idea manifest', 'Trend inspiration digest', 'Brief synopsis'],
    dependencies: [],
    statusLabel: 'Runs daily or on-demand from latest briefs.',
    sequence: 1,
    kind: 'webhook',
    webhookPath: '/workflow/acp',
  },
  {
    code: 'ENS',
    name: 'Engagement Scheduler',
    headline: 'Timing Intelligence',
    description:
      'Finds optimal posting windows for approved ideas by analysing audience analytics and historic performance.',
    function: 'Builds a per-client, per-platform schedule ready for automation rules.',
    aiAssist: 'OpenAI summarises timing rationales, risk watch-outs, and experiment ideas.',
    deliverables: ['Posting window calendar', 'Platform timing insights'],
    dependencies: ['ACP'],
    statusLabel: 'Syncs after each planning run with refreshed analytics.',
    sequence: 2,
    kind: 'webhook',
    webhookPath: '/workflow/ens',
  },
  {
    code: 'MDF',
    name: 'Media Fetcher',
    headline: 'Asset Ingestion',
    description:
      'Fetches approved marketing videos by scanning connected Dropbox folders, downloading only new assets, and staging them on the VPS.',
    function:
      'Polls Dropbox 3–4 times daily, stores files under /app/media/{client}/{month}, and writes metadata into PostgreSQL.',
    aiAssist: 'Flags missing assets or naming mismatches so operators can resolve gaps before scheduling.',
    deliverables: [
      'Local media archive (/app/media/{client}/{month})',
      'PostgreSQL media metadata (video_path, client, status, created_at)',
      'Dropbox retry logs when unavailable',
    ],
    dependencies: ['ENS'],
    statusLabel: 'Pauses gracefully and retries every 30 minutes if Dropbox is unreachable.',
    sequence: 3,
    kind: 'media-fetcher',
    metadata: {
      dropboxPaths: ['/Clients'],
    },
  },
  {
    code: 'ACO',
    name: 'Account Connector',
    headline: 'Credential Management',
    description: 'Ensures SmartOps maintains valid TikTok OAuth tokens for secure publishing.',
    function: 'Validates and refreshes TikTok tokens daily and distributes credentials downstream.',
    aiAssist: 'Summarises token health, expiry risks, and remediation steps for operators.',
    deliverables: ['Token validity dashboard updates', 'Automatic refresh audit log', 'Credential bundles for publishers'],
    dependencies: ['MDF'],
    statusLabel: 'Keeps TikTok OAuth lifecycle healthy across automations.',
    sequence: 4,
    kind: 'webhook',
    webhookPath: '/workflow/aco',
  },
  {
    code: 'ATR',
    name: 'Automation Rules',
    headline: 'Publishing Guardrails',
    description: 'Applies SmartOps logic and pacing constraints to ensure compliant scheduling.',
    function:
      'Validates cadence, asset freshness, and queue eligibility before approving posts for publishing.',
    aiAssist: 'Explains rule denials, highlights risky clusters, and recommends adjustments.',
    deliverables: ['Eligibility decision logs', 'Prioritisation scores', 'Approved queue for Publisher'],
    dependencies: ['ACO'],
    statusLabel: 'Guards publishing logic with configurable constraints.',
    sequence: 5,
    kind: 'webhook',
    webhookPath: '/workflow/atr',
  },
  {
    code: 'PUB',
    name: 'Publisher',
    headline: 'Automated Launch',
    description: 'Publishes approved videos to TikTok according to AI-determined schedules.',
    function: 'Executes posts, updates SmartOps statuses, and writes operator logs.',
    aiAssist: 'Drafts captions, monitors live errors, and summarises runs.',
    deliverables: ['TikTok post confirmations', 'Publishing status updates', 'Execution summaries'],
    dependencies: ['ATR'],
    statusLabel: 'Executes the Engagement Scheduler timeline with compliance safeguards.',
    sequence: 6,
    kind: 'webhook',
    webhookPath: '/workflow/pub',
  },
  {
    code: 'PTR',
    name: 'Performance Tracker',
    headline: 'Analytics & Reporting',
    description: 'Collects TikTok performance analytics, produces weekly dashboards, and distributes Dropbox exports.',
    function: 'Aggregates engagement metrics, pushes dashboard data, and writes Dropbox reports.',
    aiAssist: 'Generates executive-ready commentary when the OpenAI key is active.',
    deliverables: [
      'Weekly analytics reports (/reports dashboard)',
      'Dropbox exports (/Reports/{client}/{month}/)',
      'OpenAI-powered performance commentary',
    ],
    dependencies: ['PUB'],
    statusLabel: 'Refreshes weekly analytics with commentary.',
    sequence: 7,
    kind: 'webhook',
    webhookPath: '/workflow/ptr',
  },
];

const blueprintMap = new Map(automationBlueprints.map((blueprint) => [blueprint.code, blueprint]));

const ensureDirectory = async (targetPath: string) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const resolveN8nBaseUrl = (): string | null => {
  const raw = process.env.N8N_BASE_URL;
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  return raw.trim().endsWith('/') ? raw.trim() : `${raw.trim()}/`;
};

const resolveWebhookUrl = (pathSegment?: string): string | null => {
  if (!pathSegment) {
    return null;
  }
  const base = resolveN8nBaseUrl();
  if (!base) {
    return null;
  }
  const normalizedPath = pathSegment.startsWith('/') ? pathSegment.slice(1) : pathSegment;
  try {
    return new URL(normalizedPath, base).toString();
  } catch (error) {
    console.error('Failed to resolve n8n webhook URL', error);
    return null;
  }
};

const resolveBasicAuthHeader = (): string | null => {
  const active = `${process.env.N8N_BASIC_AUTH_ACTIVE ?? ''}`.toLowerCase() === 'true';
  if (!active) {
    return null;
  }

  const user = process.env.N8N_BASIC_AUTH_USER;
  const password = process.env.N8N_BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    console.warn('n8n basic auth marked active but credentials are missing.');
    return null;
  }

  const token = Buffer.from(`${user}:${password}`).toString('base64');
  return `Basic ${token}`;
};

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing');
  }
  return new OpenAI({ apiKey });
};

const normaliseAutomationStatus = (status: string | null | undefined): AutomationStatus => {
  if (!status) return 'operational';
  const normalized = status.toLowerCase();
  if (normalized.includes('monitor')) {
    return 'monitoring';
  }
  if (normalized.includes('warn') || normalized.includes('watch')) {
    return 'warning';
  }
  if (normalized.includes('error') || normalized.includes('down') || normalized.includes('offline')) {
    return 'error';
  }
  return 'operational';
};

const mapExecution = (execution: Execution): AutomationExecutionView => ({
  id: execution.id,
  status: execution.status,
  startedAt: execution.startedAt ? execution.startedAt.toISOString() : null,
  finishedAt: execution.finishedAt ? execution.finishedAt.toISOString() : null,
  logs: execution.logs,
  result: execution.result,
});

const isJsonObject = (
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeJsonMetadata = (
  existing: Prisma.JsonValue | null | undefined,
  next: Prisma.JsonObject,
): Prisma.JsonObject => ({
  ...(isJsonObject(existing) ? existing : {}),
  ...next,
});

const computeMetadata = (blueprint: AutomationBlueprint): Prisma.JsonObject => ({
  headline: blueprint.headline,
  deliverables: blueprint.deliverables,
  dependencies: blueprint.dependencies,
  statusLabel: blueprint.statusLabel,
  sequence: blueprint.sequence,
  aiAssist: blueprint.aiAssist,
  function: blueprint.function,
  ...(blueprint.metadata ?? {}),
});

const buildMetadataRecord = (
  automationMetadata: Prisma.JsonValue | null | undefined,
  blueprint: AutomationBlueprint,
): Record<string, unknown> => ({
  ...computeMetadata(blueprint),
  ...(isJsonObject(automationMetadata) ? automationMetadata : {}),
});

const createSummaryMetadata = (summary: string): Prisma.JsonObject => ({
  lastSummary: summary,
});

const seedAutomations = async () => {
  const records = await prisma.automation.findMany();
  const recordMap = new Map(records.map((record) => [record.code, record]));

  for (const blueprint of automationBlueprints) {
    const existing = recordMap.get(blueprint.code);
    const webhookUrl = resolveWebhookUrl(blueprint.webhookPath) ?? existing?.webhookUrl ?? null;
    const metadata = mergeJsonMetadata(existing?.metadata, computeMetadata(blueprint));

    if (existing) {
      await prisma.automation.update({
        where: { id: existing.id },
        data: {
          name: blueprint.name,
          description: blueprint.description,
          kind: blueprint.kind,
          webhookUrl,
          metadata,
        },
      });
    } else {
      await prisma.automation.create({
        data: {
          code: blueprint.code,
          name: blueprint.name,
          description: blueprint.description,
          status: 'operational',
          kind: blueprint.kind,
          webhookUrl,
          metadata,
        },
      });
    }
  }
};

const loadAutomationsWithLastRun = async () => {
  await seedAutomations();
  const automations = await prisma.automation.findMany({
    include: {
      executions: {
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });
  return new Map(automations.map((automation) => [automation.code, automation]));
};

const sanitizeSegment = (segment: string | null | undefined, fallback: string): string => {
  const raw = segment?.trim();
  if (!raw) return fallback;
  return raw.replace(/[^a-zA-Z0-9-_]/g, '-');
};

const parseDropboxPath = (folderPath: string) => {
  const segments = folderPath.split('/').filter(Boolean);
  const client = sanitizeSegment(segments[1], 'general');
  const month = sanitizeSegment(segments[2], 'unassigned');
  return { client, month };
};

const downloadMediaAssets = async (
  created: { dropboxId: string; fileName: string; folderPath: string }[],
): Promise<{ downloaded: number; files: Prisma.JsonObject[] }> => {
  if (created.length === 0) {
    return { downloaded: 0, files: [] };
  }

  const results: Prisma.JsonObject[] = [];

  for (const video of created) {
    try {
      const { buffer } = await dropboxService.downloadFile(video.dropboxId);
      const { client, month } = parseDropboxPath(video.folderPath);
      const targetDir = path.join(MEDIA_ROOT, client, month);
      await ensureDirectory(targetDir);

      const localPath = path.join(targetDir, video.fileName);
      await fs.writeFile(localPath, buffer);

      await prisma.mediaAsset.upsert({
        where: { dropboxId: video.dropboxId },
        update: {
          client,
          month,
          videoPath: localPath,
          status: 'downloaded',
          fileName: video.fileName,
        },
        create: {
          dropboxId: video.dropboxId,
          client,
          month,
          videoPath: localPath,
          status: 'downloaded',
          fileName: video.fileName,
        },
      });

      results.push({
        dropboxId: video.dropboxId,
        fileName: video.fileName,
        localPath,
        client,
        month,
      });
    } catch (error) {
      console.error('Failed to download Dropbox media asset', video.dropboxId, error);
      results.push({
        dropboxId: video.dropboxId,
        fileName: video.fileName,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  const successfulDownloads = results.filter((item) => !('error' in item));

  return {
    downloaded: successfulDownloads.length,
    files: results,
  };
};

const runMediaFetcher = async (
  blueprint: AutomationBlueprint,
  { scheduleRetry }: { scheduleRetry: (delayMs: number) => void },
): Promise<{
  status: AutomationStatus;
  summary: string;
  result: Prisma.JsonObject;
  logs: string;
}> => {
  const dropboxPaths = Array.isArray(blueprint.metadata?.dropboxPaths)
    ? (blueprint.metadata?.dropboxPaths as string[])
    : ['/'];

  const downloads: Prisma.JsonObject[] = [];
  let totalNew = 0;

  for (const pathCandidate of dropboxPaths) {
    let syncResult;
    try {
      syncResult = await dropboxService.syncFolders(pathCandidate);
    } catch (error) {
      scheduleRetry(30 * 60 * 1000);
      throw new AutomationError(
        'Dropbox is unreachable. Monitoring connection and retrying in 30 minutes.',
        503,
        {
          cause: error instanceof Error ? error.message : 'unknown dropbox error',
          path: pathCandidate,
        },
        'warning',
      );
    }
    totalNew += syncResult.newFiles;
    const created = syncResult.created.map((video) => ({
      dropboxId: video.dropboxId,
      fileName: video.fileName,
      folderPath: video.folderPath,
    }));
    const downloadResult = await downloadMediaAssets(created);
    downloads.push({
      path: pathCandidate,
      downloaded: downloadResult.downloaded,
      files: downloadResult.files,
    });
  }

  return {
    status: 'operational' as AutomationStatus,
    summary: totalNew > 0 ? `${totalNew} new video(s) ingested from Dropbox.` : 'No new videos detected.',
    result: {
      totalNew,
      downloads,
    } as Prisma.JsonObject,
    logs:
      totalNew > 0
        ? downloads
            .flatMap((item) => (Array.isArray(item.files) ? item.files : []))
            .map((file) => JSON.stringify(file))
            .join('\n')
        : 'Checked Dropbox folders – no new media found.',
  };
};

const runWebhookAutomation = async (
  blueprint: AutomationBlueprint,
  payload?: unknown,
): Promise<{
  status: AutomationStatus;
  summary: string;
  result: Prisma.JsonObject;
  logs: string;
}> => {
  const webhookUrl = resolveWebhookUrl(blueprint.webhookPath);
  if (!webhookUrl) {
    throw new AutomationError(
      'n8n base URL is not configured. Monitoring until the endpoint becomes available.',
      503,
      undefined,
      'monitoring',
    );
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = resolveBasicAuthHeader();
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
    });
  } catch (error) {
    throw new AutomationError(
      'Unable to contact n8n webhook. Monitoring connectivity before retrying.',
      503,
      { cause: error instanceof Error ? error.message : 'Unknown fetch error' },
      'monitoring',
    );
  }

  const duration = Date.now() - startedAt;
  const contentType = response.headers.get('content-type') ?? '';
  let responseBody: unknown = null;

  if (contentType.includes('application/json')) {
    responseBody = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => null);
    responseBody = text && text.length > 0 ? text : null;
  }

  const logs = [`Webhook: ${webhookUrl}`, `Status: ${response.status}`, `Duration: ${duration}ms`].join('\n');

  if (!response.ok) {
    const severity: AutomationStatus = response.status >= 500 ? 'warning' : 'monitoring';
    throw new AutomationError(`n8n responded with status ${response.status}`, 502, {
      responseBody,
    }, severity);
  }

  return {
    status: 'operational',
    summary: `Webhook executed successfully in ${duration}ms`,
    result: { responseBody, status: response.status } as Prisma.JsonObject,
    logs,
  };
};

const updateAutomationStatus = async (
  automation: Automation,
  status: AutomationStatus,
  summary: string,
) => {
  await prisma.automation.update({
    where: { id: automation.id },
    data: {
      status,
      lastRun: new Date(),
      metadata: mergeJsonMetadata(automation.metadata, createSummaryMetadata(summary)),
    },
  });
};

const toNodeView = (
  blueprint: AutomationBlueprint,
  automation: Automation,
  layout: { x: number; y: number } | null,
): AutomationNodeView => {
  const lastRun = automation.lastRun ? automation.lastRun.toISOString() : null;
  const status = normaliseAutomationStatus(automation.status);
  const metadata = isJsonObject(automation.metadata) ? automation.metadata : null;

  return {
    code: automation.code,
    name: blueprint.name,
    headline: blueprint.headline,
    description: automation.description,
    function: blueprint.function,
    aiAssist: blueprint.aiAssist,
    deliverables: blueprint.deliverables,
    dependencies: blueprint.dependencies,
    status,
    statusLabel:
      metadata && typeof metadata.lastSummary === 'string'
        ? (metadata.lastSummary as string)
        : blueprint.statusLabel,
    sequence: blueprint.sequence,
    kind: blueprint.kind,
    webhookPath: blueprint.webhookPath,
    webhookUrl: automation.webhookUrl,
    connected: Boolean(automation.webhookUrl) || blueprint.kind === 'media-fetcher',
    lastRun,
    position: layout,
    positionX: layout?.x ?? null,
    positionY: layout?.y ?? null,
    layout,
  } satisfies AutomationNodeView;
};

const dependencyGraph = (() => {
  const graph = new Map<string, Set<string>>();
  for (const blueprint of automationBlueprints) {
    for (const dependency of blueprint.dependencies) {
      if (!graph.has(dependency)) {
        graph.set(dependency, new Set());
      }
      graph.get(dependency)!.add(blueprint.code);
    }
  }
  return graph;
})();

const computeReachableCodes = (start: string): Set<string> => {
  const reachable = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = dependencyGraph.get(current);
    if (!dependents) continue;
    for (const next of dependents) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  return reachable;
};

const runAutomationStep = async ({
  blueprint,
  automation,
  payload,
  source,
  scheduleRetry,
}: {
  blueprint: AutomationBlueprint;
  automation: Automation;
  payload?: unknown;
  source: string;
  scheduleRetry: (delayMs: number) => void;
}): Promise<{ automation: AutomationNodeView; execution: AutomationExecutionView }> => {
  const execution = await prisma.execution.create({
    data: {
      automationId: automation.id,
      status: 'running',
      startedAt: new Date(),
    },
  });

  try {
    const result: {
      status: AutomationStatus;
      summary: string;
      result: Prisma.JsonObject;
      logs: string;
    } =
      blueprint.kind === 'media-fetcher'
        ? await runMediaFetcher(blueprint, { scheduleRetry })
        : await runWebhookAutomation(blueprint, payload);

    const logsWithSource = result.logs
      ? `${result.logs}\nTriggered by: ${source}.`
      : `Triggered by: ${source}.`;

    const completedExecution = await prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        logs: logsWithSource,
        result: result.result,
      },
    });

    await updateAutomationStatus(automation, result.status, result.summary);

    const freshAutomation = await prisma.automation.findUnique({
      where: { id: automation.id },
      include: {
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!freshAutomation) {
      throw new AutomationError('Automation record disappeared after execution.', 500);
    }

    const layout: { x: number; y: number } | null = null;
    return {
      automation: toNodeView(blueprint, freshAutomation, layout),
      execution: mapExecution(completedExecution),
    } satisfies { automation: AutomationNodeView; execution: AutomationExecutionView };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : 'Unknown automation failure';
    const severity = error instanceof AutomationError ? error.severity : 'error';

      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: 'error',
          finishedAt,
          logs:
            error instanceof Error && error.stack
              ? `${error.stack}\nSource: ${source}.`
              : `${message}\nSource: ${source}.`,
          result: { error: message } as Prisma.JsonObject,
        },
      });

      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          status: severity,
          lastRun: finishedAt,
          metadata: mergeJsonMetadata(automation.metadata, createSummaryMetadata(message)),
        },
      });

    if (error instanceof AutomationError) {
      throw error;
    }

    throw new AutomationError(message, 500, undefined, severity);
  }
};

export const automationsService = {
  async listNodes(userId?: string | null): Promise<AutomationNodeView[]> {
    const automationMap = await loadAutomationsWithLastRun();

    let layoutMap = new Map<string, { x: number; y: number }>();
    if (userId) {
      try {
        const layouts = await prisma.automationLayout.findMany({ where: { userId } });
        layoutMap = new Map(
          layouts.map((layout) => [layout.automationCode, { x: layout.positionX, y: layout.positionY }]),
        );
      } catch (error) {
        console.error('Failed to load automation layouts for user', userId, error);
      }
    }

    const nodes: AutomationNodeView[] = [];

    for (const blueprint of automationBlueprints) {
      const automation = automationMap.get(blueprint.code);
      if (!automation) {
        continue;
      }

      const layout = layoutMap.get(automation.code) ?? null;
      nodes.push(toNodeView(blueprint, automation, layout));
    }

    return nodes.sort((a, b) => a.sequence - b.sequence);
  },

  async getNode(code: string, userId?: string | null): Promise<AutomationNodeDetails> {
    const normalizedCode = code.toUpperCase();
    const blueprint = blueprintMap.get(normalizedCode);
    if (!blueprint) {
      throw new AutomationError(`Automation node ${normalizedCode} was not found.`, 404);
    }

    const automation = await prisma.automation.findUnique({
      where: { code: normalizedCode },
    });

    if (!automation) {
      throw new AutomationError(`Automation node ${normalizedCode} is not initialised.`, 404);
    }

    let layout: { x: number; y: number } | null = null;
    if (userId) {
      const record = await prisma.automationLayout.findUnique({
        where: {
          userId_automationCode: {
            userId,
            automationCode: normalizedCode,
          },
        },
      });
      if (record) {
        layout = { x: record.positionX, y: record.positionY };
      }
    }

    const executions = await prisma.execution.findMany({
      where: { automationId: automation.id },
      orderBy: { startedAt: 'desc' },
      take: 25,
    });

      return {
        ...toNodeView(blueprint, automation, layout),
        metadata: buildMetadataRecord(automation.metadata, blueprint),
        executions: executions.map(mapExecution),
      } satisfies AutomationNodeDetails;
  },

  async saveNodePosition({
    userId,
    code,
    position,
  }: {
    userId: string;
    code: string;
    position: { x: number; y: number };
  }): Promise<void> {
    const normalizedCode = code.toUpperCase();
    if (!blueprintMap.has(normalizedCode)) {
      throw new AutomationError(`Automation node ${normalizedCode} was not found.`, 404);
    }

    try {
      await prisma.automationLayout.upsert({
        where: {
          userId_automationCode: {
            userId,
            automationCode: normalizedCode,
          },
        },
        update: {
          positionX: position.x,
          positionY: position.y,
        },
        create: {
          userId,
          automationCode: normalizedCode,
          positionX: position.x,
          positionY: position.y,
        },
      });
    } catch (error) {
      console.error('Failed to persist automation layout for user', userId, normalizedCode, error);
      throw new AutomationError('Unable to save automation layout.', 500);
    }
  },

  async runNode({
    code,
    payload,
    cascade = true,
    source = 'manual',
  }: {
    code: string;
    payload?: unknown;
    cascade?: boolean;
    source?: string;
  }): Promise<AutomationRunResponse> {
    await seedAutomations();

    const normalizedCode = code.toUpperCase();
    const blueprint = blueprintMap.get(normalizedCode);
    if (!blueprint) {
      throw new AutomationError(`Automation node ${normalizedCode} was not found.`, 404);
    }

    const automation = await prisma.automation.findUnique({ where: { code: normalizedCode } });
    if (!automation) {
      throw new AutomationError(`Automation node ${normalizedCode} is not initialised.`, 404);
    }

    const createRetryScheduler = (targetCode: string) => (delayMs: number) => {
      if (!Number.isFinite(delayMs) || delayMs <= 0) {
        return;
      }
      const ms = Math.trunc(delayMs);
      const minutes = Math.max(1, Math.round(ms / 60000));
      console.warn(`Scheduling retry for automation ${targetCode} in ${minutes} minute(s).`);
      setTimeout(() => {
        automationsService
          .runNode({ code: targetCode, cascade: false, source: 'retry' })
          .catch((err) => console.error(`Retry for automation ${targetCode} failed`, err));
      }, ms);
    };

    const primary = await runAutomationStep({
      blueprint,
      automation,
      payload,
      source,
      scheduleRetry: createRetryScheduler(normalizedCode),
    });

    const cascadeResults: Array<{ automation: AutomationNodeView; execution: AutomationExecutionView }> = [];

    if (cascade) {
      const reachable = computeReachableCodes(normalizedCode);
      reachable.delete(normalizedCode);

      const visited = new Set<string>([normalizedCode]);
      let progress = true;

      while (progress && reachable.size > 0) {
        progress = false;

        for (const candidate of Array.from(reachable)) {
          const candidateBlueprint = blueprintMap.get(candidate);
          if (!candidateBlueprint) {
            reachable.delete(candidate);
            continue;
          }

          const dependenciesMet =
            candidateBlueprint.dependencies.length === 0
              ? false
              : candidateBlueprint.dependencies.every((dependency) => visited.has(dependency));

          if (!dependenciesMet) {
            continue;
          }

          const candidateAutomation = await prisma.automation.findUnique({ where: { code: candidate } });
          if (!candidateAutomation) {
            reachable.delete(candidate);
            continue;
          }

          const result = await runAutomationStep({
            blueprint: candidateBlueprint,
            automation: candidateAutomation,
            source: `cascade:${candidateBlueprint.dependencies.join('+') || normalizedCode}`,
            scheduleRetry: createRetryScheduler(candidate),
          });

          cascadeResults.push(result);
          visited.add(candidate);
          reachable.delete(candidate);
          progress = true;
        }
      }
    }

    return { automation: primary.automation, execution: primary.execution, cascade: cascadeResults } satisfies AutomationRunResponse;
  },

  async getStatuses(): Promise<AutomationNodeView[]> {
    return this.listNodes();
  },

  async runPipeline(startCode = 'ACP', source: string = 'scheduled'): Promise<AutomationRunResponse> {
    return this.runNode({ code: startCode, cascade: true, source });
  },

  async generateInsights({ focus }: { focus?: string }) {
    try {
      const openai = getOpenAIClient();
      const response = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content:
              'You are an automation strategist for a creative agency. Provide concise, high-impact recommendations referencing the workflow nodes when relevant. Respond using markdown with short sections.',
          },
          {
            role: 'user',
            content: `Workflow nodes: ${automationBlueprints
              .map((node) => `${node.code} – ${node.name}: ${node.statusLabel}`)
              .join('; ')}. Focus on ${focus ?? 'overall pipeline performance'} and surface next best actions, risk watch-outs, and opportunities for OpenAI augmentation.`,
          },
        ],
      });

      if (response.output_text) {
        return response.output_text;
      }

      return 'Insights are not available at the moment. Please try again shortly.';
    } catch (error) {
      console.error('Failed to generate automation insights', error);
      return 'Insights are currently unavailable. Verify the OpenAI configuration and try again.';
    }
  },
};
