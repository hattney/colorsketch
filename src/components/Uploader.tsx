import { Camera, UploadCloud } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { fileToImage } from '../utils/loadImage';

interface UploaderProps {
  onImageSelected: (image: HTMLImageElement) => void;
}

export default function Uploader({ onImageSelected }: UploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = async (file: File) => {
    setError(null);
    setIsLoading(true);
    try {
      const img = await fileToImage(file);
      onImageSelected(img);
    } catch {
      setError('This image could not be read. Try a JPG, PNG, WebP, or HEIC file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) loadFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full">
      <div
        className={`dot-grid flex cursor-pointer flex-col items-center justify-center px-6 py-12 text-center transition-colors ${
          isDragging ? 'bg-[color:var(--crayon-yellow)]/25' : ''
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
      >
        <div
          className="flex w-full max-w-md flex-col items-center rounded-xl border-[2.5px] border-ink bg-white px-6 py-10"
          style={{ boxShadow: '6px 6px 0 var(--crayon-blue)' }}
        >
          <UploadCloud className="mb-4 h-14 w-14" strokeWidth={2.2} aria-hidden="true" />
          <h3 className="m-0 mb-1.5 font-display text-2xl font-extrabold tracking-[-0.02em]">
            Upload a photo
          </h3>
          <p className="m-0 mb-6 text-[14px] text-ink-soft">
            Drag and drop, paste, or click to browse
          </p>
          <input
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button type="button" disabled={isLoading} className="btn max-w-[280px]">
            <Camera className="h-5 w-5" aria-hidden="true" />
            {isLoading ? 'Reading image…' : 'Choose image'}
          </button>
          <p className="m-0 mt-4 text-xs text-ink-soft">
            JPG, PNG, WebP, HEIC (iPhone) · up to 10 MB
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="m-0 px-6 py-3 text-sm font-bold text-[color:var(--crayon-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
