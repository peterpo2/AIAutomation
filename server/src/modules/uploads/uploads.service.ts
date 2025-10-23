import { prisma } from '../auth/prisma.client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { captionGeneratorService } from '../caption-generator/caption-generator.service.js';

const parseSize = (size?: number | string): bigint => {
  if (typeof size === 'number') {
    if (!Number.isFinite(size)) return 0n;
    return BigInt(Math.max(Math.round(size), 0));
  }

  if (typeof size === 'string') {
    const numeric = Number(size);
    if (!Number.isFinite(numeric)) return 0n;
    return BigInt(Math.max(Math.round(numeric), 0));
  }

  return 0n;
};

export const uploadsService = {
  async list(userEmail?: string) {
    const where = userEmail ? { user: { email: userEmail } } : undefined;

    return prisma.video.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(userEmail: string, data: {
    fileName: string;
    folderPath?: string;
    dropboxId?: string;
    size?: number;
    brand?: string;
    caption?: string;
    category?: string;
  }) {
    const video = await prisma.video.create({
      data: {
        fileName: data.fileName,
        folderPath: data.folderPath ?? '',
        dropboxId: data.dropboxId ?? `manual-${Date.now()}`,
        size: parseSize(data.size),
        status: 'pending',
        brand: data.brand,
        caption: data.caption,
        category: data.category,
        user: { connect: { email: userEmail } },
      },
    });
    if (!data.caption) {
      captionGeneratorService
        .generateForVideo(video, { notify: true })
        .catch((error) => console.error(`Auto caption generation failed for ${video.id}`, error));
    }
    return video;
  },

  async update(
    id: string,
    userEmail: string,
    data: { status?: string; brand?: string; caption?: string; category?: string },
  ) {
    const existing = await prisma.video.findFirst({ where: { id, user: { email: userEmail } } });
    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {};
    if (data.status) {
      updateData.status = data.status;
    }
    if (typeof data.brand !== 'undefined') {
      updateData.brand = data.brand;
    }
    if (typeof data.caption !== 'undefined') {
      updateData.caption = data.caption;
    }
    if (typeof data.category !== 'undefined') {
      updateData.category = data.category;
    }

    const video = await prisma.video.update({
      where: { id },
      data: updateData,
    });
    if (data.status === 'uploaded') {
      await notificationsService.sendPush(
        'upload:complete',
        'Upload Completed',
        `${video.fileName} finished uploading`,
      );
    }
    return video;
  },

  async remove(id: string, userEmail: string) {
    const existing = await prisma.video.findFirst({ where: { id, user: { email: userEmail } } });
    if (!existing) {
      return false;
    }

    await prisma.video.delete({ where: { id } });
    return true;
  },
};
