# SmartOps Frontend (VPS Edition)

Modern automation dashboard for social-media content teams built for a Bulgarian PR and marketing firm.

## Features

- React + Vite + TypeScript + Tailwind CSS
- Dropbox integration (browse, preview, select videos)
- Firebase Auth & push notifications
- Supabase database for metadata storage
- Progressive Web App (PWA) for Safari & iPhone
- VPS self-hosting via Docker + Nginx
- Professional, responsive UI with smooth animations

## Tech Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Charts**: Recharts
- **Authentication**: Firebase Auth
- **Database**: Supabase
- **File Storage**: Dropbox API
- **Notifications**: Firebase Cloud Messaging
- **Routing**: React Router v7

## Project Structure

```
/smartops-frontend
 ├─ src/
 │   ├─ pages/               # Main application pages
 │   │   ├─ Login.tsx       # Firebase authentication
 │   │   ├─ Dashboard.tsx   # Overview & quick actions
 │   │   ├─ Dropbox.tsx     # File browser with video selection
 │   │   ├─ Uploads.tsx     # Upload queue with metadata editing
 │   │   ├─ Reports.tsx     # Analytics & performance charts
 │   │   └─ Settings.tsx    # User preferences & integrations
 │   ├─ components/         # Reusable components
 │   │   ├─ Layout.tsx      # Main layout with sidebar
 │   │   └─ ProtectedRoute.tsx # Route protection
 │   ├─ context/            # React context providers
 │   │   └─ AuthContext.tsx # Authentication state
 │   ├─ lib/                # External integrations
 │   │   ├─ firebase.ts     # Firebase config & messaging
 │   │   ├─ supabase.ts     # Supabase client & types
 │   │   └─ dropbox.ts      # Dropbox API integration
 │   ├─ App.tsx             # Main app with routing
 │   ├─ main.tsx            # App entry point
 │   └─ index.css           # Global styles
 ├─ public/
 │   ├─ manifest.json       # PWA manifest
 │   ├─ service-worker.js   # Service worker for offline support
 │   └─ firebase-messaging-sw.js # Firebase messaging worker
 ├─ Dockerfile              # Multi-stage Docker build
 ├─ nginx.conf              # Nginx configuration
 └─ .env.example            # Environment variables template
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required variables:

```env
# Supabase (Database)
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Firebase (Authentication & Notifications)
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-key

# Dropbox (File Integration)
VITE_DROPBOX_APP_KEY=your-dropbox-app-key
```

### 3. Update Firebase Messaging Service Worker

Edit `public/firebase-messaging-sw.js` with your Firebase config.

### 4. Development

```bash
npm run dev
```

Visit `http://localhost:5173`

### 5. Build for Production

```bash
npm run build
```

## VPS Deployment

### Prerequisites

- VPS running Ubuntu 22.04 LTS (Hetzner or Contabo)
- Docker and Docker Compose installed
- Domain name pointed to your VPS

### Deployment Steps

#### 1. SSH into Your VPS

```bash
ssh root@your-vps-ip
```

#### 2. Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

#### 3. Clone the Repository

```bash
git clone https://github.com/youruser/smartops-frontend.git
cd smartops-frontend
```

#### 4. Create Production .env File

```bash
nano .env
```

Add your production environment variables.

#### 5. Build Docker Image

```bash
docker build -t smartops .
```

#### 6. Run Container

```bash
docker run -d -p 80:80 --name smartops smartops
```

#### 7. Set Up SSL with Certbot

```bash
# Install Certbot
apt-get update
apt-get install certbot python3-certbot-nginx

# Get SSL Certificate
certbot --nginx -d smartops.yourdomain.com

# Auto-renewal is set up automatically
```

#### 8. Configure Nginx for HTTPS

Your site will now be accessible at `https://smartops.yourdomain.com`

### Update Deployment

To update the application:

```bash
cd smartops-frontend
git pull origin main
docker build -t smartops .
docker stop smartops
docker rm smartops
docker run -d -p 80:80 --name smartops smartops
```

## Database Schema

The application uses Supabase with the following tables:

### Videos Table

Stores metadata about videos from Dropbox:

- `id`: UUID primary key
- `user_id`: Firebase user ID
- `file_path`: Full Dropbox file path
- `file_name`: Video filename
- `file_size`: Size in bytes
- `dropbox_id`: Dropbox file ID
- `thumbnail_url`: Video thumbnail URL
- `brand`: Brand name (Kaufland, Lidl, etc.)
- `caption`: Social media caption
- `category`: Video category
- `status`: pending, scheduled, or uploaded
- `created_at`: Timestamp

### Analytics Table

Stores performance metrics:

- `id`: UUID primary key
- `video_id`: Foreign key to videos table
- `views`: View count
- `likes`: Like count
- `comments`: Comment count
- `shares`: Share count
- `recorded_at`: Timestamp

## Features Overview

### Authentication (Firebase)
- Secure email/password login
- Password reset flow
- User session management
- Protected routes

### Dropbox Integration
- OAuth 2.0 authentication
- Folder navigation with breadcrumbs
- Video file filtering (.mp4, .mov, .avi, etc.)
- Thumbnail preview
- Multi-select videos

### Upload Queue
- Manage selected videos
- Edit metadata (brand, caption, category)
- Save to Supabase database
- Track upload status

### Analytics Dashboard
- Overview cards with key metrics
- Weekly performance charts
- Top performing videos
- Engagement rates
- Export functionality (placeholder)

### Settings
- User profile information
- Dropbox connection management
- Push notification toggle
- Dark mode toggle
- Connection status indicators

### PWA Features
- Offline support with service worker
- Add to home screen (iOS/Android)
- Push notifications
- Fast load times with caching

## Development Guidelines

### Code Style
- TypeScript for type safety
- Functional components with hooks
- Tailwind CSS for styling
- Framer Motion for animations

### File Organization
- One component per file
- Separate utilities and configurations
- Clear folder structure

### Security
- Environment variables for secrets
- Firebase Authentication
- Supabase Row Level Security
- HTTPS in production

## Cost Estimate

Running on a VPS in Bulgaria:

| Component | Provider | Cost |
|-----------|----------|------|
| VPS (1 vCPU / 2GB RAM) | Hetzner CX11 | ~€5/month |
| Domain + SSL | Cloudflare | Free |
| Firebase | Free tier | €0 |
| Supabase | Free tier | €0 |
| Dropbox | Existing account | €0 |

**Total: ~€5/month**

## Future Enhancements (Phase 2)

- n8n automation integration
- TikTok API for automatic uploads
- AI-powered caption generation (OpenAI)
- Advanced analytics with custom date ranges
- Team collaboration features
- Scheduled post calendar
- Video editing tools

## Support

For issues or questions:
1. Check existing documentation
2. Review environment variable configuration
3. Verify Firebase and Dropbox setup
4. Check browser console for errors

## License

Proprietary - Bulgarian PR & Marketing Firm

## Version

1.0.0 - Frontend MVP (Phase 1)
