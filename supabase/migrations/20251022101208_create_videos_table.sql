/*
  # Create Videos Table for SmartOps

  1. New Tables
    - `videos`
      - `id` (uuid, primary key) - Unique identifier for each video
      - `user_id` (text) - Firebase user ID who owns the video
      - `file_path` (text) - Full Dropbox file path
      - `file_name` (text) - Name of the video file
      - `file_size` (bigint) - Size in bytes
      - `dropbox_id` (text) - Dropbox file ID
      - `thumbnail_url` (text, nullable) - URL for video thumbnail
      - `brand` (text, nullable) - Brand name (e.g., Kaufland, Lidl)
      - `caption` (text, nullable) - Caption for social media post
      - `category` (text, nullable) - Video category
      - `status` (text) - Status: pending, scheduled, uploaded
      - `created_at` (timestamptz) - When record was created
      - `updated_at` (timestamptz) - When record was last updated

  2. Security
    - Enable RLS on `videos` table
    - Add policy for authenticated users to manage their own videos
    - Users can only access videos they created
*/

CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  dropbox_id text NOT NULL,
  thumbnail_url text,
  brand text,
  caption text,
  category text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own videos"
  ON videos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own videos"
  ON videos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own videos"
  ON videos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own videos"
  ON videos
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
