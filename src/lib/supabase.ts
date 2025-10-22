import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
