import OpenAI from 'openai';
import { prisma } from '../auth/prisma.client.js';
import { notificationsService } from '../notifications/notifications.service.js';

interface GenerateOptions {
  keywords?: string[];
  notify?: boolean;
  force?: boolean;
}

interface CaptionResult {
  videoId: string;
  caption: string;
  hashtags: string[];
  generatedAt: Date;
}

const DEFAULT_LANGUAGE = process.env.CAPTION_LANG || 'bg';
const MAX_TOKENS = Number(process.env.CAPTION_MAX_TOKENS || 150);
const STALE_DAYS = Number(process.env.CAPTION_STALE_DAYS || 30);

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing');
  }
  return new OpenAI({ apiKey });
};

const sanitizeHashtags = (hashtags: unknown): string[] => {
  if (Array.isArray(hashtags)) {
    return hashtags
      .map((tag) => `${tag}`.trim())
      .filter((tag) => tag.startsWith('#'))
      .slice(0, 6);
  }
  if (typeof hashtags === 'string') {
    return hashtags
      .split(/[,\n\s]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.startsWith('#') && tag.length > 1)
      .slice(0, 6);
  }
  return [];
};

const parseResponse = (content: string) => {
  try {
    const parsed = JSON.parse(content);
    const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
    const hashtags = sanitizeHashtags(parsed.hashtags);
    return { caption, hashtags };
  } catch (error) {
    console.warn('Caption generator: unable to parse JSON response', error);
    const [firstLine, ...rest] = content.split('\n').map((line) => line.trim()).filter(Boolean);
    const caption = firstLine || content.trim();
    const hashtags = sanitizeHashtags(rest.join(' '));
    return { caption, hashtags };
  }
};

const parseStoredHashtags = (value?: string | null) => {
  if (!value) {
    return [] as string[];
  }
  try {
    const parsed = JSON.parse(value);
    return sanitizeHashtags(parsed);
  } catch (error) {
    console.warn('Caption generator: stored hashtags not JSON, falling back', error);
    return sanitizeHashtags(value);
  }
};

type VideoRecord = NonNullable<Awaited<ReturnType<typeof prisma.video.findUnique>>>;

const buildPrompt = (video: VideoRecord, keywords: string[] = []) => {
  const keywordSection =
    keywords.length > 0
      ? `Optional focus keywords: ${keywords.join(', ')}.`
      : 'No additional keywords were supplied.';
  return `You are an expert TikTok caption writer for brands like ${video.brand ?? 'SmartOps clients'}.
Write a short, catchy caption in ${DEFAULT_LANGUAGE} that uses engaging emojis and includes a concise hook referencing the video name "${video.fileName}".
Respond with JSON only in the following shape: {"caption": "...", "hashtags": ["#tag1", "#tag2"]}.
The caption should be at most 2 sentences. Provide 3-5 relevant and trending hashtags in ${DEFAULT_LANGUAGE}.
Folder context: ${video.folderPath || 'root'}.
${keywordSection}`;
};

const getVideoById = async (videoId: string) => {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) {
    throw new Error(`Video ${videoId} not found`);
  }
  return video;
};

const shouldSkipGeneration = (video: VideoRecord, options?: GenerateOptions) => {
  if (options?.force) {
    return false;
  }
  if (!video.caption) {
    return false;
  }
  if (!video.captionGeneratedAt) {
    return false;
  }
  return true;
};

const storeResult = async (video: VideoRecord, caption: string, hashtags: string[]) => {
  const generatedAt = new Date();
  const data = await prisma.video.update({
    where: { id: video.id },
    data: {
      caption,
      hashtags: hashtags.length > 0 ? JSON.stringify(hashtags) : null,
      captionGeneratedAt: generatedAt,
    },
  });
  return { data, generatedAt };
};

const notify = async (video: VideoRecord) => {
  await notificationsService.sendPush(
    'caption:generated',
    'AI Caption Ready',
    `🧠 AI caption generated for ${video.fileName}`,
  );
};

const runGeneration = async (video: VideoRecord, options?: GenerateOptions): Promise<CaptionResult> => {
  if (shouldSkipGeneration(video, options)) {
    return {
      videoId: video.id,
      caption: video.caption ?? '',
      hashtags: parseStoredHashtags(video.hashtags),
      generatedAt: video.captionGeneratedAt ?? new Date(),
    };
  }

  const openai = getOpenAIClient();
  const prompt = buildPrompt(video, options?.keywords ?? []);

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: prompt,
    temperature: 0.8,
    max_output_tokens: MAX_TOKENS,
  });

  const content = response.output_text ?? '';
  const { caption, hashtags } = parseResponse(content);
  const { data: updated, generatedAt } = await storeResult(video, caption, hashtags);

  if (options?.notify) {
    await notify(updated);
  }

  return {
    videoId: updated.id,
    caption,
    hashtags,
    generatedAt,
  };
};

export const captionGeneratorService = {
  async generateForVideoId(videoId: string, options?: GenerateOptions) {
    const video = await getVideoById(videoId);
    return runGeneration(video, options);
  },

  async generateForVideo(video: VideoRecord, options?: GenerateOptions) {
    return runGeneration(video, options);
  },

  async refreshStaleCaptions() {
    const staleDate = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await prisma.video.findMany({
      where: {
        status: 'uploaded',
        OR: [
          { captionGeneratedAt: null },
          { captionGeneratedAt: { lt: staleDate } },
          { hashtags: null },
        ],
      },
      take: 25,
    });

    for (const video of candidates) {
      const metrics = video as unknown as { viewCount?: number | bigint; views?: number | bigint };
      const rawViewCount = metrics.viewCount ?? metrics.views;
      const viewCount =
        typeof rawViewCount === 'bigint'
          ? Number(rawViewCount)
          : typeof rawViewCount === 'number'
            ? rawViewCount
            : undefined;
      const isTopVideo = viewCount === undefined || viewCount > 1000;
      if (!isTopVideo) {
        continue;
      }
      try {
        await runGeneration(video, { force: true, notify: false });
      } catch (error) {
        console.error(`Failed to refresh caption for video ${video.id}`, error);
      }
    }
  },
};
