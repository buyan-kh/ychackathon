-- Migration: Add Meeting Summaries Feature
-- Run this script in your Supabase SQL Editor

-- Create meeting_recordings table to track Daily.co recordings
CREATE TABLE IF NOT EXISTS meeting_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id TEXT UNIQUE NOT NULL,
    room_name TEXT NOT NULL,
    room_url TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'processing', 'failed'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create meeting_summaries table to store AI-generated summaries
CREATE TABLE IF NOT EXISTS meeting_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id TEXT NOT NULL REFERENCES meeting_recordings(recording_id) ON DELETE CASCADE,
    batch_job_id TEXT UNIQUE, -- Daily Batch Processor job ID
    summary_text TEXT,
    summary_type TEXT DEFAULT 'summary', -- 'summary', 'transcript', 'soap'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    canvas_shape_id TEXT, -- ID of the note shape created on canvas
    room_id TEXT, -- Canvas room ID for placing summary
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_recording_id ON meeting_recordings(recording_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_room_name ON meeting_recordings(room_name);
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_recording_id ON meeting_summaries(recording_id);
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_batch_job_id ON meeting_summaries(batch_job_id);
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_status ON meeting_summaries(status);
CREATE INDEX IF NOT EXISTS idx_meeting_summaries_canvas_shape_id ON meeting_summaries(canvas_shape_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updated_at
CREATE TRIGGER update_meeting_recordings_updated_at BEFORE UPDATE ON meeting_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_summaries_updated_at BEFORE UPDATE ON meeting_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE meeting_recordings IS 'Stores metadata for Daily.co meeting recordings';
COMMENT ON TABLE meeting_summaries IS 'Stores AI-generated summaries from Daily Batch Processor';
COMMENT ON COLUMN meeting_summaries.batch_job_id IS 'Daily Batch Processor job ID for tracking async processing';
COMMENT ON COLUMN meeting_summaries.canvas_shape_id IS 'Links summary to canvas note shape for display';
