import React from 'react';
import { X, File, Image, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';

export interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'uploading' | 'success' | 'error';
  mediaId?: string | null;
}

interface FileUploadPreviewProps {
  files: UploadFile[];
  onRemoveFile: (fileId: string) => void;
}

const FileUploadPreview: React.FC<FileUploadPreviewProps> = ({ files, onRemoveFile }) => {
  if (files.length === 0) return null;

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="h-5 w-5 text-blue-400" />;
    } else if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.endsWith('.xlsx')) {
      return <FileSpreadsheet className="h-5 w-5 text-green-400" />;
    } else if (fileType.includes('document') || fileType.endsWith('.docx') || fileType.endsWith('.pdf')) {
      return <FileText className="h-5 w-5 text-purple-400" />;
    }
    return <File className="h-5 w-5 text-gray-400" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeDisplay = (fileType: string, fileName: string): string => {
    if (fileType.startsWith('image/')) {
      const subtype = fileType.split('/')[1];
      return subtype ? subtype.toUpperCase() : 'IMAGE';
    } else if (fileName.endsWith('.pdf')) {
      return 'PDF';
    } else if (fileName.endsWith('.docx')) {
      return 'DOCX';
    } else if (fileName.endsWith('.xlsx')) {
      return 'XLSX';
    }
    const fileTypePart = fileType.split('/').pop();
    return fileTypePart ? fileTypePart.toUpperCase() : 'FILE';
  };

  return (
    <div className="absolute top-0 left-0 right-0 p-2 z-10">
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <div
            key={file.id}
            className={`relative flex items-center min-w-40 max-w-40 gap-2 pl-3 ml-1 -mt-7 px-4 py-3 rounded-2xl transition-all duration-200 group
              ${file.status === 'error' ? 'bg-red-900/50' : 'bg-neutral-800'}`}
          >
            {/* File Icon or Loading Spinner */}
            <div className="flex-shrink-0">
              {file.status === 'uploading' ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                getFileIcon(file.type)
              )}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200 truncate">
                {file.status === 'uploading' ? 'Pending...' : file.name}
              </div>
              {file.status !== 'uploading' && (
                <div className="text-xs text-gray-400 mt-0.5">
                  <span>{getFileTypeDisplay(file.type, file.name)}</span>
                  <span className="mx-1">•</span>
                  <span>{formatFileSize(file.size)}</span>
                </div>
              )}
            </div>
            
            {/* Remove Button */}
            <button
              onClick={() => onRemoveFile(file.id)}
              className="absolute top-5 right-1 -translate-y-1/2 flex-shrink-0 p-1 rounded-full bg-zinc-600/50 hover:bg-zinc-600/80 transition-colors opacity-0 group-hover:opacity-100"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3 w-3 text-gray-300" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileUploadPreview;
