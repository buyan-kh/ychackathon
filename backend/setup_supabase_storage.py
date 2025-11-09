#!/usr/bin/env python3
"""
Setup Supabase Storage Bucket for PDFs
Run this script to create the 'pdfs' bucket in your Supabase project
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def setup_supabase_storage():
    """Create the pdfs storage bucket in Supabase"""
    
    # Get Supabase credentials
    supabase_url = os.getenv("SUPABASE_URL", "https://amwpjpgiupicbrfgeskl.supabase.co")
    supabase_key = os.getenv("SUPABASE_ANON_KEY", 
                             "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtd3BqcGdpdXBpY2JyZmdlc2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MzQzMTIsImV4cCI6MjA3ODIxMDMxMn0.j5s1zmNDLcuO9Armsl72hRrGFp8k9-0kbzvgZKqpkxM")
    
    # Initialize Supabase client
    supabase: Client = create_client(supabase_url, supabase_key)
    
    try:
        # Check if bucket already exists
        buckets = supabase.storage.list_buckets()
        bucket_names = [bucket['name'] for bucket in buckets]
        
        if 'pdfs' in bucket_names:
            print("✓ Bucket 'pdfs' already exists")
        else:
            # Create the pdfs bucket
            supabase.storage.create_bucket(
                'pdfs',
                options={
                    'public': False,  # Private bucket, use signed URLs
                    'file_size_limit': 52428800,  # 50MB limit
                    'allowed_mime_types': ['application/pdf']
                }
            )
            print("✓ Successfully created 'pdfs' bucket")
        
        # Verify bucket access
        try:
            supabase.storage.from_('pdfs').list()
            print("✓ Bucket is accessible and ready for use")
        except Exception as e:
            print(f"⚠ Bucket exists but may have access issues: {e}")
        
        return True
        
    except Exception as e:
        print(f"✗ Error setting up storage: {e}")
        print("\nManual Setup Instructions:")
        print("1. Go to your Supabase Dashboard")
        print("2. Navigate to Storage section")
        print("3. Click 'New bucket'")
        print("4. Name: pdfs")
        print("5. Public: OFF (use signed URLs)")
        print("6. File size limit: 50MB")
        print("7. Allowed MIME types: application/pdf")
        return False

if __name__ == "__main__":
    print("Setting up Supabase Storage for PDF RAG System...")
    print("=" * 60)
    success = setup_supabase_storage()
    print("=" * 60)
    if success:
        print("\n✓ Supabase storage setup complete!")
        print("\nNext steps:")
        print("1. Run the SQL script (setup_supabase.sql) in Supabase SQL Editor")
        print("2. Install Python dependencies: pip install -r requirements.txt")
        print("3. Run the POC script to test the pipeline")
    else:
        print("\n✗ Setup incomplete. Please follow manual instructions above.")
