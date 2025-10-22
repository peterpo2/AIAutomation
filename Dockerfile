# Shared multi-stage Dockerfile for frontend and backend images

# Frontend build stage
FROM node:20-alpine AS frontend-build
WORKDIR /frontend

COPY package*.json ./
RUN npm ci

COPY . .

# Inject Vite environment variables at build-time so the compiled assets
# match the deployment configuration. docker-compose forwards the values from
# the shared .env file via build args.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_KEY
ARG VITE_DROPBOX_APP_KEY

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
ENV VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}
ENV VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
ENV VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}
ENV VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}
ENV VITE_FIREBASE_VAPID_KEY=${VITE_FIREBASE_VAPID_KEY}
ENV VITE_DROPBOX_APP_KEY=${VITE_DROPBOX_APP_KEY}

RUN npm run build

# Backend build stage
FROM node:20-alpine AS backend-build
WORKDIR /backend

RUN apk add --no-cache openssl

COPY server/package*.json ./
RUN npm ci --legacy-peer-deps

COPY server/ .
RUN npx prisma generate --schema src/prisma/schema.prisma
RUN npm run build

# Strip dev dependencies before copying to the runtime image
RUN npm prune --omit=dev

# Frontend runtime image (Nginx)
FROM nginx:1.25-alpine AS frontend

COPY --from=frontend-build /frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Backend runtime image
FROM node:20-alpine AS backend
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=backend-build /backend/node_modules ./node_modules
COPY --from=backend-build /backend/dist ./dist
COPY server/package.json ./package.json
COPY --from=backend-build /backend/src/prisma ./prisma

EXPOSE 8080

CMD ["node", "dist/main.js"]
