import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const normalizeEnv = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const supabaseUrl = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = normalizeEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

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
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase credentials are missing.');
    }
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

export type VideoMetadata = {
  id?: string;
  file_path: string;
  file_name: string;
  file_size: number;
  brand?: string;
  caption?: string;
  category?: string;
  dropbox_id: string;
  thumbnail_url?: string;
  created_at?: string;
  user_id?: string;
  status?: 'pending' | 'scheduled' | 'uploaded';
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
