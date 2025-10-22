import { prisma } from '../auth/prisma.client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { captionGeneratorService } from '../caption-generator/caption-generator.service.js';

export const uploadsService = {
  async list() {
    return prisma.video.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async create(data: {
    fileName: string;
    folderPath?: string;
    dropboxId?: string;
    size?: number;
    brand?: string;
    caption?: string;
  }) {
    const video = await prisma.video.create({
      data: {
        fileName: data.fileName,
        folderPath: data.folderPath ?? '',
        dropboxId: data.dropboxId ?? `manual-${Date.now()}`,
        size: BigInt(data.size ?? 0),
        status: 'pending',
        brand: data.brand,
        caption: data.caption,
      },
    });
    if (!data.caption) {
      captionGeneratorService
        .generateForVideo(video, { notify: true })
        .catch((error) => console.error(`Auto caption generation failed for ${video.id}`, error));
    }
    return video;
  },

  async update(id: string, data: { status?: string; brand?: string; caption?: string }) {
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
};
