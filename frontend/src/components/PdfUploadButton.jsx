import React, { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from './ui/sonner';
import { Upload, FileText } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const PdfUploadButton = ({ onUploadSuccess }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Invalid file type', {
        description: 'Please upload a PDF file',
        duration: 3000,
      });
      return;
    }

    // Validate file size (20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      toast.error('File too large', {
        description: 'Maximum file size is 20MB',
        duration: 3000,
      });
      return;
    }

    // Close dialog and show upload toast
    setIsOpen(false);
    setIsUploading(true);

    // Create progress toast
    const uploadToast = toast.loading(`Uploading ${file.name}...`, {
      description: 'Processing your PDF',
      duration: Infinity,
    });

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload to backend
      const response = await axios.post(`${BACKEND_URL}/api/pdf/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          toast.loading(`Uploading ${file.name}...`, {
            description: `${percentCompleted}% complete`,
            id: uploadToast,
          });
        },
      });

      // Success
      toast.success('PDF uploaded successfully!', {
        id: uploadToast,
        description: `${response.data.page_count} pages processed, ${response.data.chunk_count} chunks created`,
        duration: 5000,
      });

      // Callback with document data
      if (onUploadSuccess) {
        onUploadSuccess(response.data);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      
      toast.error('Upload failed', {
        id: uploadToast,
        description: errorMessage,
        duration: 5000,
        action: {
          label: 'Retry',
          onClick: () => {
            // Reset file input and reopen dialog
            event.target.value = '';
            setIsOpen(true);
          },
        },
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={isUploading}
          data-testid="pdf-upload-trigger-button"
        >
          <Upload className="h-4 w-4" />
          Upload PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload PDF Document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid w-full items-center gap-1.5">
            <label
              htmlFor="pdf-file"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Select PDF File
            </label>
            <input
              id="pdf-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileSelect}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="pdf-upload-input"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Maximum file size: 20MB. PDF will be processed and embedded for search.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};