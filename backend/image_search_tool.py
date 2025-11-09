"""
Image search tool using Google Custom Search API.
"""
import os
import logging
from typing import Optional, Dict, Any
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


class ImageSearchTool:
    """Tool for searching images using Google Custom Search API."""
    
    def __init__(self, api_key: Optional[str] = None, cse_id: Optional[str] = None):
        """
        Initialize the image search tool.
        
        Args:
            api_key: Google API key (defaults to GOOGLE_API_KEY env var)
            cse_id: Custom Search Engine ID (defaults to GOOGLE_CSE_ID env var)
        """
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        self.cse_id = cse_id or os.getenv("GOOGLE_CSE_ID")
        
        if not self.api_key or not self.cse_id:
            logger.warning("Google API key or CSE ID not configured. Image search will be disabled.")
            self.enabled = False
        else:
            self.enabled = True
            self.service = build("customsearch", "v1", developerKey=self.api_key)
    
    async def search_image(self, alt_text: str, size: str = "HUGE") -> Optional[str]:
        """
        Search for an image using Google Custom Search.
        
        Args:
            alt_text: The search query/alt text for the image
            size: Image size preference (HUGE, XXLARGE, XLARGE, LARGE, MEDIUM, SMALL, ICON)
        
        Returns:
            URL of the first matching image, or None if no results
        """
        if not self.enabled:
            logger.warning("Image search is disabled (missing API credentials)")
            return None
        
        try:
            # Execute the search
            result = self.service.cse().list(
                q=alt_text,
                cx=self.cse_id,
                searchType='image',
                imgSize=size.upper(),  # Ensure uppercase
                num=1,  # Only get the first result
                safe='active'  # Safe search enabled
            ).execute()
            
            # Extract image URL from results
            if 'items' in result and len(result['items']) > 0:
                image_url = result['items'][0]['link']
                logger.info(f"Found image for '{alt_text}': {image_url}")
                return image_url
            else:
                logger.warning(f"No images found for '{alt_text}'")
                return None
                
        except HttpError as e:
            logger.error(f"Google API error searching for '{alt_text}': {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error searching for '{alt_text}': {e}", exc_info=True)
            return None
    
    def get_tool_definition(self) -> Dict[str, Any]:
        """
        Get the OpenAI function tool definition for this image search tool.
        
        Returns:
            Tool definition dictionary compatible with OpenAI's function calling
        """
        return {
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


# Global instance
_image_search_tool: Optional[ImageSearchTool] = None


def get_image_search_tool() -> ImageSearchTool:
    """Get or create the global image search tool instance."""
    global _image_search_tool
    if _image_search_tool is None:
        _image_search_tool = ImageSearchTool()
    return _image_search_tool

