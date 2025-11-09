"""
Embed tool for creating Google Maps and YouTube embeds.
"""
import os
import logging
from typing import Optional, Dict, Any
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


class EmbedTool:
    """Tool for creating Google Maps and YouTube embeds."""
    
    def __init__(self, google_maps_api_key: Optional[str] = None, youtube_api_key: Optional[str] = None):
        """
        Initialize the embed tool.
        
        Args:
            google_maps_api_key: Google Maps API key (defaults to GOOGLE_MAPS_API_KEY env var)
            youtube_api_key: YouTube Data API key (defaults to YOUTUBE_API_KEY env var)
        """
        self.google_maps_api_key = google_maps_api_key or os.getenv("GOOGLE_MAPS_API_KEY")
        self.youtube_api_key = youtube_api_key or os.getenv("YOUTUBE_API_KEY")
        
        # Check if APIs are configured
        self.google_maps_enabled = bool(self.google_maps_api_key)
        self.youtube_enabled = bool(self.youtube_api_key)
        
        if not self.google_maps_enabled:
            logger.warning("Google Maps API key not configured. Maps embeds will be disabled.")
        if not self.youtube_enabled:
            logger.warning("YouTube API key not configured. YouTube embeds will be disabled.")
        
        # Initialize YouTube service if enabled
        self.youtube_service = None
        if self.youtube_enabled:
            try:
                self.youtube_service = build("youtube", "v3", developerKey=self.youtube_api_key)
            except Exception as e:
                logger.error(f"Failed to initialize YouTube service: {e}", exc_info=True)
                self.youtube_enabled = False
                self.youtube_service = None
    
    def create_google_maps_embed(self, query: str, lat: Optional[float] = None, lng: Optional[float] = None) -> Optional[str]:
        """
        Create a Google Maps embed URL for searching locations.
        
        Args:
            query: Search query (e.g., "Chinese food", "pizza")
            lat: Optional latitude for centering the map
            lng: Optional longitude for centering the map
        
        Returns:
            Google Maps embed URL or None if API key not configured
        """
        if not self.google_maps_enabled:
            logger.warning("Google Maps API key not configured")
            return None
        
        # Build the embed URL
        base_url = "https://www.google.com/maps/embed/v1/search"
        params = f"key={self.google_maps_api_key}&q={query}"
        
        # Add center coordinates if provided
        if lat is not None and lng is not None:
            params += f"&center={lat},{lng}&zoom=14"
        
        embed_url = f"{base_url}?{params}"
        logger.info(f"Created Google Maps embed for query: {query}")
        return embed_url
    
    def search_youtube_video(self, query: str) -> Optional[str]:
        """
        Search for a YouTube video and return the first result's video ID.
        Falls back to creating a search embed URL if API is unavailable.
        
        Args:
            query: Search query (e.g., "how to cook orange chicken")
        
        Returns:
            Video ID of the first result, or None if API unavailable
        """
        if not self.youtube_enabled:
            logger.warning("YouTube API key not configured")
            return None
        
        if not hasattr(self, 'youtube_service') or self.youtube_service is None:
            logger.warning("YouTube service not initialized, will use search embed fallback")
            return None
        
        try:
            # Search for videos
            search_response = self.youtube_service.search().list(
                q=query,
                part="id,snippet",
                maxResults=1,
                type="video",
                order="relevance",
                safeSearch="moderate"
            ).execute()
            
            # Extract video ID from results
            if "items" in search_response and len(search_response["items"]) > 0:
                video_id = search_response["items"][0]["id"]["videoId"]
                video_title = search_response["items"][0]["snippet"]["title"]
                logger.info(f"Found YouTube video: {video_title} (ID: {video_id})")
                return video_id
            else:
                logger.warning(f"No YouTube results found for query: {query}")
                return None
                
        except HttpError as e:
            error_details = str(e)
            if e.resp.status == 403:
                logger.warning(f"YouTube Data API v3 search is blocked (403) for '{query}'. "
                             f"Will use search embed URL fallback instead.")
            else:
                logger.warning(f"YouTube API error searching for '{query}': {e}. Using fallback.")
            return None
        except Exception as e:
            logger.warning(f"Unexpected error searching YouTube for '{query}': {e}. Using fallback.")
            return None
    
    def create_youtube_embed(self, video_id: str) -> str:
        """
        Create a YouTube embed URL from a video ID.
        
        Args:
            video_id: YouTube video ID
        
        Returns:
            YouTube embed URL
        """
        return f"https://www.youtube.com/embed/{video_id}"
    
    def create_youtube_search_embed(self, query: str) -> str:
        """
        Create a YouTube embed URL for search queries.
        
        Note: YouTube doesn't officially support embedding search results.
        This creates a URL that will attempt to show YouTube content related
        to the search query. For best results, enable YouTube Data API v3
        to get specific video IDs.
        
        Args:
            query: Search query (e.g., "how to cook orange chicken")
        
        Returns:
            YouTube embed URL (may show related content or require user interaction)
        """
        import urllib.parse
        encoded_query = urllib.parse.quote_plus(query)
        # Create a YouTube URL that can be used for search
        # Since YouTube search pages can't be embedded, we'll use
        # YouTube's watch page with search parameters as a fallback
        # This won't embed perfectly but provides a functional alternative
        embed_url = f"https://www.youtube.com/embed?q={encoded_query}"
        logger.info(f"Created YouTube search embed fallback for query: {query}")
        logger.warning("Note: YouTube search embeds have limited support. Consider enabling YouTube Data API v3 for better results.")
        return embed_url


# Global instance
_embed_tool: Optional[EmbedTool] = None


def get_embed_tool() -> EmbedTool:
    """Get or create the global embed tool instance."""
    global _embed_tool
    if _embed_tool is None:
        _embed_tool = EmbedTool()
    return _embed_tool
