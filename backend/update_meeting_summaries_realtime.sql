-- Migration: Add support for real-time transcription summaries
-- Run this script in your Supabase SQL Editor AFTER running add_meeting_summaries.sql

-- Add new columns to meeting_summaries table
ALTER TABLE meeting_summaries
ADD COLUMN IF NOT EXISTS transcript_text TEXT,
ADD COLUMN IF NOT EXISTS generation_method TEXT DEFAULT 'realtime';

-- Make recording_id nullable (for realtime summaries without recordings)
ALTER TABLE meeting_summaries
ALTER COLUMN recording_id DROP NOT NULL;

-- Update comments
COMMENT ON COLUMN meeting_summaries.transcript_text IS 'Full transcript text from live transcription';
COMMENT ON COLUMN meeting_summaries.generation_method IS 'Method used: realtime (instant) or batch (Daily processor)';
