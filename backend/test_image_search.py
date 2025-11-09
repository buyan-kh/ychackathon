"""
Test script for image search functionality.
Run this to verify your Google Custom Search API is configured correctly.
"""
import asyncio
import sys
from dotenv import load_dotenv
from image_search_tool import get_image_search_tool

# Load environment variables
load_dotenv()


async def test_image_search():
    """Test the image search tool."""
    print("Testing Image Search Tool...")
    print("-" * 50)
    
    # Get the tool
    tool = get_image_search_tool()
    
    if not tool.enabled:
        print("❌ Image search is DISABLED")
        print("Please configure GOOGLE_API_KEY and GOOGLE_CSE_ID in your .env file")
        sys.exit(1)
    
    print("✅ Image search is ENABLED")
    print()
    
    # Test searches
    test_queries = [
        "Golden Gate Bridge San Francisco",
        "Python programming logo",
        "Artificial intelligence neural network"
    ]
    
    for query in test_queries:
        print(f"Searching for: {query}")
        result = await tool.search_image(query)
        
        if result:
            print(f"  ✅ Found: {result}")
        else:
            print(f"  ❌ No results found")
        print()
    
    print("-" * 50)
    print("Test complete!")


if __name__ == "__main__":
    asyncio.run(test_image_search())

