# Meeting Summary Feature - Testing Guide

## How to Test

1. **Join a video call** from the canvas (click the video icon)
2. **Have a conversation** (at least 30 seconds for meaningful summary)
3. **Leave the meeting** (click leave button in Daily UI)
4. **Wait 5-15 minutes** for summary to process
5. **Check for summary note** appearing on canvas to the right of video call

## What to Look For in Logs

### ✅ Frontend Console (Browser DevTools)

**When you JOIN the call:**
```
✅ Joined video call successfully
🎥 Attempting to start recording...
✅ Recording started successfully!
📹 Recording ID: <recording_id>
📹 Full recording result: {...}
```

**When you LEAVE the call:**
```
👋 User left meeting
⏹️  Stopping recording...
Recording ID to stop: <recording_id>
✅ Recording stopped successfully!
📹 Recording info: {...}
🏠 Room name: canvas-default
📡 Sending recording complete to backend: http://localhost:8000
Request payload: {...}
✅ Backend response: {...}
🔄 Summary job created with ID: <job_id>
⏳ Starting to poll for summary completion...
```

**While POLLING (every 5 seconds):**
```
🔍 Polling attempt 1/60 for job <job_id>
📊 Job status: processing
⏳ Still processing... will check again in 5 seconds (attempt 1/60)
```

**When SUMMARY COMPLETES:**
```
🔍 Polling attempt X/60 for job <job_id>
📊 Job status: completed
✅ Summary generation completed!
📝 Summary text: <summary_text>
📝 Creating summary note on canvas...
📍 Video shape position: {...}
📍 Creating note at position: {...}
✅ Summary note created successfully on canvas!
```

### ✅ Backend Terminal

**When recording stops:**
```
================================================================================
🎬 RECORDING COMPLETE REQUEST RECEIVED
Recording ID: <recording_id>
Room Name: canvas-default
Room ID: default
Duration: <seconds> seconds
================================================================================
✅ Daily.co API key found
💾 Storing recording metadata in Supabase...
✅ Stored recording metadata: <recording_id>
🤖 Submitting to Daily Batch Processor API...
Endpoint: https://api.daily.co/v1/batch-processor
Payload: {...}
📡 Batch Processor Response Status: 200
📡 Batch Processor Response Body: {...}
✅ Batch job created successfully!
Job ID: <job_id>
Full batch job response: {...}
💾 Storing summary job metadata in Supabase...
✅ Created summary job: <job_id> for recording: <recording_id>
================================================================================
✅ RECORDING COMPLETE HANDLER FINISHED SUCCESSFULLY
================================================================================
```

**When frontend polls (every 5 seconds):**
```
🔍 Polling summary status for job: <job_id>
📡 Checking job status from Daily API...
📡 Daily API Response Status: 200
📊 Job status: processing
📊 Full job response: {...}
⏳ Job still processing...
```

**When summary completes:**
```
🔍 Polling summary status for job: <job_id>
📡 Checking job status from Daily API...
📡 Daily API Response Status: 200
📊 Job status: finished
📊 Full job response: {...}
✅ Summary generation finished!
📥 Fetching summary from: <summary_url>
✅ Summary fetched successfully!
📝 Summary preview (first 200 chars): <summary_preview>...
💾 Updating database with completed summary...
✅ Summary completed for job: <job_id>
```

## Troubleshooting

### ❌ No "Recording started" log
**Problem:** Recording didn't start
**Check:**
- Daily.co room has `enable_recording: "cloud"` enabled
- Your Daily.co account has recording permissions
- No browser console errors about `startRecording()`

### ❌ No "Recording stopped" log when leaving
**Problem:** Leave event not firing
**Check:**
- Make sure you're clicking "Leave" in the Daily UI
- Check if recording ID was set (`recordingIdRef.current`)

### ❌ Backend doesn't receive recording-complete request
**Problem:** Frontend can't reach backend
**Check:**
- Backend is running on correct port (8000)
- `REACT_APP_BACKEND_URL` is set correctly
- CORS is enabled on backend
- Check browser Network tab for failed requests

### ❌ Batch Processor returns error
**Problem:** Daily API rejected the request
**Check:**
- `DAILY_API_KEY` is valid and set in backend/.env
- Recording ID is valid (was actually created by Daily)
- Daily.co account has batch processor access
- Check backend logs for Daily API error response

### ❌ Polling times out (5 minutes)
**Problem:** Summary takes longer than expected
**Solutions:**
- Increase `maxAttempts` in VideoCallShapeUtil.jsx (line 18)
- Check Daily Batch Processor status manually in Daily dashboard
- Meeting might have been too short (needs at least ~30 seconds of audio)

### ❌ Summary note doesn't appear on canvas
**Problem:** Canvas shape creation failed
**Check:**
- Editor instance is available
- Video call shape still exists when summary completes
- Check browser console for shape creation errors
- Verify note shape type is supported by tldraw

## Expected Timeline

- **T+0s:** User leaves call
- **T+1s:** Recording stops, backend notified
- **T+2s:** Batch job submitted to Daily
- **T+5s:** First poll attempt
- **T+10s-5min:** Polling every 5 seconds
- **T+varies:** Summary completes (depends on recording length)
- **T+complete:** Note appears on canvas

## Manual Testing with Daily Dashboard

You can also check job status manually:
1. Go to Daily.co dashboard
2. Navigate to "Recordings" section
3. Find your recording by ID
4. Check batch processor jobs
5. View generated summary directly

## Database Queries (Supabase)

Check if data is being stored:

```sql
-- Check recordings
SELECT * FROM meeting_recordings ORDER BY created_at DESC LIMIT 5;

-- Check summaries
SELECT * FROM meeting_summaries ORDER BY created_at DESC LIMIT 5;

-- Check specific job
SELECT * FROM meeting_summaries WHERE batch_job_id = 'your-job-id';
```
