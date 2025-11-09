# Quick Start: Image Search

## Setup (5 minutes)

### 1. Get Google API Credentials

**Get API Key:**
1. Visit https://console.cloud.google.com/apis/credentials
2. Create credentials → API Key
3. Copy the key

**Get Custom Search Engine ID:**
1. Visit https://programmablesearchengine.google.com/
2. Create new search engine
3. Enable "Search the entire web"
4. Enable "Image search" in settings
5. Copy the Search engine ID

### 2. Update Environment Variables

Edit `backend/.env`:

```bash
GOOGLE_API_KEY=AIzaSy...your_key
GOOGLE_CSE_ID=23660e...your_cse_id
```

### 3. Test It

```bash
cd backend
source venv/bin/activate
python test_image_search.py
```

You should see:
```
✅ Image search is ENABLED
✅ Found: https://...
```

## How It Works

### 1. The AI automatically uses images when helpful

**User prompt:** "Tell me about the Golden Gate Bridge"

**Behind the scenes:**
1. AI receives the prompt
2. AI decides an image would be helpful
3. AI calls `getImageSrc("Golden Gate Bridge")`
4. Backend searches Google Images
5. Returns image URL to AI
6. AI includes image in response

### 2. Tool Definition

The AI sees this tool:

```javascript
{
  name: "getImageSrc",
  description: "Get image URL for given alt text",
  parameters: {
    altText: "Search query for the image"
  }
}
```

### 3. Streaming Response Format

The server streams events in this format:

```javascript
// Regular content
data: {"content": "Here's information about..."}

// Tool thinking state (optional)
data: {"thinking": "Searching for images...", "description": "Finding the perfect image"}

// Final marker
data: [DONE]
```

## Example Requests

### Simple prompt (may trigger image search)
```bash
curl -X POST http://localhost:8000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show me the Eiffel Tower"
  }'
```

### With context
```bash
curl -X POST http://localhost:8000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell me about this landmark",
    "context": "The Eiffel Tower in Paris"
  }'
```

## Frontend Integration

The frontend should handle image URLs in the AI response. Example structure:

```javascript
// Handle streaming response
const response = await fetch('/api/ask', {
  method: 'POST',
  body: JSON.stringify({ prompt: userPrompt })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      
      if (data.content) {
        // Handle markdown content (may include image URLs)
        appendContent(data.content);
      }
      
      if (data.thinking) {
        // Show loading state
        showThinking(data.thinking, data.description);
      }
    }
  }
}
```

## Testing Different Scenarios

### 1. Landmarks and Places
```
"Tell me about the Colosseum"
"Show me Mount Everest"
"What does the Taj Mahal look like?"
```

### 2. Logos and Brands
```
"What's the Python programming language?"
"Tell me about Tesla"
"Show me the React logo"
```

### 3. Concepts and Diagrams
```
"Explain neural networks"
"What is cloud computing?"
"Show me a DNA structure"
```

### 4. General Knowledge
```
"What does a blue whale look like?"
"Show me the solar system"
"What is a volcano?"
```

## Monitoring

### Check if image search is working:

```bash
# Watch server logs
cd backend
tail -f logs/server.log | grep -i "image"
```

### Expected log entries:

```
INFO - Found image for 'Golden Gate Bridge': https://upload.wikimedia.org/...
INFO - Executing tool: getImageSrc
```

## Troubleshooting

### ❌ "Image search is DISABLED"
- Check `.env` file has both `GOOGLE_API_KEY` and `GOOGLE_CSE_ID`
- Restart the server after adding env variables

### ❌ "No images found"
- Try a more specific search term
- Check Google Custom Search Engine is configured for "entire web"
- Verify image search is enabled in CSE settings

### ❌ "Quota exceeded"
- Free tier: 100 queries/day
- Wait until next day or upgrade to paid tier
- Monitor usage at https://console.cloud.google.com/

### ❌ Tool not being called
- AI decides when images are helpful
- Try prompts that explicitly ask for visual content
- Check system prompt includes image encouragement

## Advanced Usage

### Customize image size:

Edit `image_search_tool.py`:

```python
# Change default size
async def search_image(self, alt_text: str, size: str = "XLARGE"):
    # Options: HUGE, XXLARGE, XLARGE, LARGE, MEDIUM, SMALL, ICON
```

### Add more tool parameters:

```python
def get_tool_definition(self) -> Dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": "getImageSrc",
            "parameters": {
                "type": "object",
                "properties": {
                    "altText": {"type": "string"},
                    "imageType": {
                        "type": "string",
                        "enum": ["photo", "clipart", "lineart", "face", "news"]
                    }
                }
            }
        }
    }
```

## Performance Tips

1. **Caching**: Consider caching popular image searches
2. **Rate Limiting**: Add rate limiting to prevent quota exhaustion
3. **Fallbacks**: Have default images for common queries
4. **Async**: The tool is already async for better performance

## Security Notes

- ✅ Safe search is always enabled
- ✅ API keys are in `.env` (not in code)
- ✅ Tool errors don't crash the server
- ⚠️ Validate image URLs in frontend before rendering
- ⚠️ Consider adding CORS headers for image proxying

## Next Steps

1. ✅ Test the basic functionality
2. Monitor usage and costs
3. Enhance frontend to beautifully render images
4. Add image caching if needed
5. Consider adding more visual tools (charts, diagrams, etc.)

## Support

Need help?
- Run: `python test_image_search.py`
- Check: `IMAGE_SEARCH_IMPLEMENTATION.md` for detailed docs
- Logs: Check server logs for error messages
- Google: https://developers.google.com/custom-search/v1/overview

