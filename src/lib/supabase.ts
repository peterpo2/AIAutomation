import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingVars: string[] = [];

if (!supabaseUrl) {
  missingVars.push('VITE_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  missingVars.push('VITE_SUPABASE_ANON_KEY');
}

let supabaseClient: SupabaseClient | null = null;
let initializationError: Error | null = null;

if (missingVars.length > 0) {
  initializationError = new Error(
    `Missing Supabase environment variables: ${missingVars.join(', ')}. Please set them in your .env file.`,
  );
  if (import.meta.env.DEV) {
    console.warn(initializationError.message);
  }
} else {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    initializationError =
      error instanceof Error
        ? error
        : new Error('Failed to initialize Supabase client.');
    if (import.meta.env.DEV) {
      console.error('Supabase initialization error:', initializationError);
    }
  }
}

export const supabase = supabaseClient;
export const supabaseInitError = initializationError;

export const VIDEO_STATUSES = ['pending', 'ready', 'uploaded'] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export type VideoMetadata = {
  id?: string | number | null;
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  brand?: string | null;
  caption?: string | null;
  category?: string | null;
  dropbox_id?: string | null;
  thumbnail_url?: string | null;
  created_at?: string | null;
  user_id?: string | null;
  status?: VideoStatus | null;
};

export type AnalyticsData = {
  id?: string;
  video_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  recorded_at: string;
};
