import { OpenAPIV3 } from 'openapi-types';

export const swaggerSpec: OpenAPIV3.Document = {
  openapi: '3.0.0',
  info: {
    title: 'SmartOps Automation Engine API',
    version: '1.0.0',
    description: 'API documentation for SmartOps backend services',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      firebase: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Firebase',
      },
    },
  },
  security: [{ firebase: [] }],
  paths: {
    '/auth/me': {
      get: {
        summary: 'Get current user profile',
        responses: {
          '200': {
            description: 'User profile',
          },
        },
      },
    },
    '/dropbox/refresh': {
      post: {
        summary: 'Trigger immediate Dropbox sync',
        responses: {
          '202': { description: 'Sync started' },
        },
      },
    },
    '/dropbox/sync': {
      post: {
        summary: 'Alias for triggering Dropbox sync',
        responses: {
          '202': { description: 'Sync started' },
        },
      },
      get: {
        summary: 'Trigger Dropbox sync via GET (legacy support)',
        responses: {
          '202': { description: 'Sync started' },
        },
      },
    },
    '/uploads': {
      get: {
        summary: 'List uploads',
        responses: { '200': { description: 'List of videos' } },
      },
      post: {
        summary: 'Add upload metadata',
        responses: { '201': { description: 'Video enqueued' } },
      },
    },
    '/uploads/{id}': {
      patch: {
        summary: 'Update video status or metadata',
        parameters: [
          {
            in: 'path',
            name: 'id',
            schema: { type: 'string' },
            required: true,
          },
        ],
        responses: { '200': { description: 'Updated' } },
      },
    },
    '/captions/generate/{videoId}': {
      post: {
        summary: 'Regenerate AI caption for a video',
        parameters: [
          {
            in: 'path',
            name: 'videoId',
            schema: { type: 'string' },
            required: true,
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  keywords: {
                    oneOf: [
                      { type: 'array', items: { type: 'string' } },
                      { type: 'string' },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Caption generated' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/reports': {
      get: {
        summary: 'Get weekly performance report',
        responses: { '200': { description: 'Report data' } },
      },
    },
  },
};
