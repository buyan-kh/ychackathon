# Image Search Implementation

This document explains how image search is implemented in the backend using Google Custom Search API.

## Overview

The image search feature allows the AI assistant to automatically find and include relevant images in its responses, making them more engaging and visual.

## Architecture

### 1. Image Search Tool (`image_search_tool.py`)

The `ImageSearchTool` class handles all image search functionality:

```python
from image_search_tool import get_image_search_tool

# Get the singleton instance
tool = get_image_search_tool()

# Search for an image
image_url = await tool.search_image("Golden Gate Bridge")
```

**Key Features:**
- Uses Google Custom Search API
- Searches for high-quality images (HUGE size by default)
- Includes safe search filtering
- Graceful degradation if API is not configured

### 2. System Prompt Integration (`system_prompt.py`)

The system prompt has been updated to encourage the AI to use images:

```
- Try to integrate relevant images in the cards to make them more engaging using the provided tool
- When appropriate, enhance your responses with relevant images by using the getImageSrc tool.
```

### 3. Server Integration (`server.py`)

The `/api/ask` endpoint now:
1. Registers the `getImageSrc` tool with the LLM
2. Handles tool calls during streaming
3. Executes image searches when requested by the AI
4. Returns results to continue the conversation

## Configuration

### Required Environment Variables

Add these to your `.env` file:

```bash
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_custom_search_engine_id_here
```

### Setting Up Google Custom Search

1. **Create a Google Cloud Project**
   - Go to https://console.cloud.google.com/
   - Create a new project or select an existing one

2. **Enable Custom Search API**
   - Go to APIs & Services > Library
   - Search for "Custom Search API"
   - Click "Enable"

3. **Create API Credentials**
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "API Key"
   - Copy the API key to `GOOGLE_API_KEY` in your `.env`

4. **Create a Custom Search Engine**
   - Go to https://programmablesearchengine.google.com/
   - Click "Add" to create a new search engine
   - Set "Search the entire web" option
   - In settings, enable "Image search"
   - Copy the "Search engine ID" to `GOOGLE_CSE_ID` in your `.env`

## Usage

### Testing the Integration

Run the test script to verify everything is configured correctly:

```bash
cd backend
source venv/bin/activate
python test_image_search.py
```

Expected output:
```
✅ Image search is ENABLED
Searching for: Golden Gate Bridge San Francisco
  ✅ Found: https://upload.wikimedia.org/wikipedia/...
```

### Using in Your Application

The image search is automatically available to the AI. Simply ask questions that might benefit from images:

**Example Prompts:**
- "Tell me about the Eiffel Tower" (AI may include an image)
- "Show me Python programming resources" (AI may include Python logo)
- "What does a neural network look like?" (AI may include diagram)

### API Flow

1. User sends a prompt to `/api/ask`
2. AI processes the prompt and decides if images would be helpful
3. If needed, AI calls `getImageSrc` tool with descriptive alt text
4. Backend searches Google for the image
5. Backend sends "thinking" state to frontend (optional)
6. Image URL is returned to AI
7. AI incorporates the image URL in its response
8. Response is streamed to frontend

## Tool Definition

The AI sees this tool definition:

```json
{
  "type": "function",
  "function": {
    "name": "getImageSrc",
    "description": "Get the image URL for the given search query/alt text. Use this to find relevant images to enhance your responses.",
    "parameters": {
      "type": "object",
      "properties": {
        "altText": {
          "type": "string",
          "description": "The search query or alt text describing the image to find"
        }
      },
      "required": ["altText"]
    }
  }
}
```

## Image Size Options

The search defaults to `HUGE` images, but you can modify the size parameter:

- `HUGE` - Largest images (default)
- `XXLARGE` - Extra extra large
- `XLARGE` - Extra large
- `LARGE` - Large
- `MEDIUM` - Medium
- `SMALL` - Small
- `ICON` - Icon size

## Error Handling

The implementation includes comprehensive error handling:

1. **Missing Credentials**: If `GOOGLE_API_KEY` or `GOOGLE_CSE_ID` is not set, the tool is disabled but the app continues to work
2. **API Errors**: Google API errors are logged and the conversation continues without the image
3. **No Results**: If no images are found, the AI is notified and can continue without an image
4. **Network Issues**: Connection errors are caught and logged

## Monitoring

Check the logs for image search activity:

```bash
# View logs
tail -f backend.log

# Look for these messages:
INFO - Found image for 'search query': https://...
WARNING - No images found for 'search query'
ERROR - Google API error searching for 'search query': ...
```

## Limitations

- **API Quota**: Google Custom Search has a free tier limit of 100 queries/day
- **Rate Limiting**: Respect Google's rate limits to avoid throttling
- **Image Availability**: Some images may become unavailable over time
- **Safe Search**: Safe search is always enabled to filter inappropriate content

## Cost

- **Free Tier**: 100 queries/day at no cost
- **Paid Tier**: $5 per 1,000 additional queries (up to 10k queries/day)
- Monitor usage in Google Cloud Console

## Future Enhancements

Potential improvements:
- Cache frequently searched images
- Support for specific image domains/sources
- Image size/aspect ratio preferences
- Multiple image results
- Fallback to alternative image search providers
- Image metadata extraction

## Troubleshooting

### Tool Not Working

1. Check environment variables are set:
   ```bash
   echo $GOOGLE_API_KEY
   echo $GOOGLE_CSE_ID
   ```

2. Run the test script:
   ```bash
   python test_image_search.py
   ```

3. Check server logs for errors

### Quota Exceeded

If you see "Quota exceeded" errors:
- Wait until the next day (quota resets daily)
- Or upgrade to a paid plan in Google Cloud Console

### Images Not Appearing

1. Verify the AI is calling the tool (check logs)
2. Ensure frontend is handling image URLs in responses
3. Check image URLs are accessible (not blocked by CORS)

## Security Considerations

- **API Key Security**: Never commit `.env` file to version control
- **Safe Search**: Always enabled to filter inappropriate content
- **URL Validation**: Frontend should validate image URLs before rendering
- **Rate Limiting**: Implement rate limiting to prevent API abuse

## Support

For issues or questions:
- Check logs: `tail -f backend.log`
- Run test script: `python test_image_search.py`
- Review Google Custom Search documentation
- Check API quota in Google Cloud Console

