/*
  # Create Analytics Table for SmartOps

  1. New Tables
    - `analytics`
      - `id` (uuid, primary key) - Unique identifier
      - `video_id` (uuid, foreign key) - Reference to videos table
      - `views` (integer) - Number of views
      - `likes` (integer) - Number of likes
      - `comments` (integer) - Number of comments
      - `shares` (integer) - Number of shares
      - `recorded_at` (timestamptz) - When analytics were recorded
      - `created_at` (timestamptz) - When record was created

  2. Security
    - Enable RLS on `analytics` table
    - Add policies for authenticated users to view and manage analytics
*/

CREATE TABLE IF NOT EXISTS analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analytics"
  ON analytics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert analytics"
  ON analytics
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update analytics"
  ON analytics
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_analytics_video_id ON analytics(video_id);
CREATE INDEX IF NOT EXISTS idx_analytics_recorded_at ON analytics(recorded_at DESC);
