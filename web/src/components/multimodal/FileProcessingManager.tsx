import React, { useState, useRef } from 'react';
import { Upload, FileText, Image, Globe, Database, Search, Settings, Webhook } from 'lucide-react';

interface FileProcessingManagerProps {
  onFileProcessed?: (result: any) => void;
  onContextRetrieved?: (context: string) => void;
}

interface ProcessingResult {
  success: boolean;
  fileInfo?: any;
  processingResult?: any;
  validation?: any;
}

interface RAGResult {
  success: boolean;
  query: string;
  results: any[];
  context: string;
  metadata: any;
}

interface WebSearchResult {
  success: boolean;
  query: string;
  results: any[];
  total_results: number;
  search_engine: string;
  search_type: string;
}

export const FileProcessingManager: React.FC<FileProcessingManagerProps> = ({
  onFileProcessed,
  onContextRetrieved
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'rag' | 'web' | 'settings'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [ragResult, setRagResult] = useState<RAGResult | null>(null);
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [ragQuery, setRagQuery] = useState('');
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [processType, setProcessType] = useState<'analyze' | 'extract' | 'ingest'>('analyze');
  const [supportedFileTypes, setSupportedFileTypes] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load supported file types
  const loadSupportedFileTypes = async () => {
    try {
      const response = await fetch('/api/multimodal/file-types');
      const data = await response.json();
      if (data.success) {
        setSupportedFileTypes(data);
      }
    } catch (error) {
      console.error('Failed to load supported file types:', error);
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setProcessingResult(null);

    try {
      const formData = new FormData();
      const file = files[0];
      if (file) {
        formData.append('file', file);
        formData.append('process_type', processType);

        const response = await fetch('/api/multimodal/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        setProcessingResult(result);
        
        if (result.success && onFileProcessed) {
          onFileProcessed(result);
        }
      }
    } catch (error) {
      console.error('File upload failed:', error);
      setProcessingResult({
        success: false,
        processingResult: { error: 'Upload failed' }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Process URL
  const handleUrlProcess = async () => {
    if (!urlInput.trim()) return;

    setIsProcessing(true);
    setProcessingResult(null);

    try {
      const response = await fetch('/api/multimodal/process-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: urlInput,
          extract_type: 'content'
        }),
      });

      const result = await response.json();
      setProcessingResult(result);
      
      if (result.success && onFileProcessed) {
        onFileProcessed(result);
      }
    } catch (error) {
      console.error('URL processing failed:', error);
      setProcessingResult({
        success: false,
        processingResult: { error: 'URL processing failed' }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform semantic search
  const handleRAGSearch = async () => {
    if (!ragQuery.trim()) return;

    setIsProcessing(true);
    setRagResult(null);

    try {
      const response = await fetch('/api/search/semantic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: ragQuery,
          top_k: 5,
          similarity_threshold: 0.3
        }),
      });

      const result = await response.json();
      
      // Transform semantic search result to match expected RAG result format
      const transformedResult = {
        success: result.success || false,
        query: ragQuery,
        results: result.results?.map((item: any, index: number) => ({
          id: item.id || `result_${index}`,
          content_preview: item.content || '',
          similarity: item.similarity || 0,
          context_type: 'semantic_search'
        })) || [],
        context: result.results?.map((item: any) => item.content).join('\n\n') || '',
        metadata: {
          total_results: result.total_matches || 0,
          average_similarity: result.results?.reduce((acc: number, item: any) => acc + (item.similarity || 0), 0) / (result.results?.length || 1) || 0,
          search_type: result.search_type || 'semantic'
        }
      };
      
      setRagResult(transformedResult);
      
      if (transformedResult.success && onContextRetrieved && transformedResult.context) {
        onContextRetrieved(transformedResult.context);
      }
    } catch (error) {
      console.error('Semantic search failed:', error);
      setRagResult({
        success: false,
        query: ragQuery,
        results: [],
        context: '',
        metadata: { error: 'Semantic search failed' }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform hybrid search
  const handleRAGQuery = async () => {
    if (!ragQuery.trim()) return;

    setIsProcessing(true);
    setRagResult(null);

    try {
      const response = await fetch('/api/search/hybrid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: ragQuery,
          top_k: 5
        }),
      });

      const result = await response.json();
      
      // Transform hybrid search result to match expected RAG result format
      const transformedResult = {
        success: result.success || false,
        query: ragQuery,
        results: result.results?.map((item: any, index: number) => ({
          id: item.id || `result_${index}`,
          content_preview: item.content || '',
          similarity: item.combined_score || item.semantic_score || 0,
          context_type: 'hybrid_search'
        })) || [],
        context: result.results?.map((item: any) => item.content).join('\n\n') || '',
        metadata: {
          total_results: result.results?.length || 0,
          average_similarity: result.results?.reduce((acc: number, item: any) => acc + (item.combined_score || item.semantic_score || 0), 0) / (result.results?.length || 1) || 0,
          search_type: result.search_type || 'hybrid'
        }
      };
      
      setRagResult(transformedResult);
      
      if (transformedResult.success && onContextRetrieved && transformedResult.context) {
        onContextRetrieved(transformedResult.context);
      }
    } catch (error) {
      console.error('Hybrid search failed:', error);
      setRagResult({
        success: false,
        query: ragQuery,
        results: [],
        context: '',
        metadata: { error: 'Hybrid search failed' }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform web search
  const handleWebSearch = async () => {
    if (!webSearchQuery.trim()) return;

    setIsProcessing(true);
    setWebSearchResult(null);

    try {
      const response = await fetch('/api/search/web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: webSearchQuery,
          max_results: 10
        }),
      });

      const result = await response.json();
      setWebSearchResult(result);
      
      if (result.success && onContextRetrieved && result.results?.length > 0) {
        // Create context from web search results
        const context = result.results.map((item: any) => 
          `${item.title}: ${item.description} (Source: ${item.url})`
        ).join('\n\n');
        onContextRetrieved(context);
      }
    } catch (error) {
      console.error('Web search failed:', error);
      setWebSearchResult({
        success: false,
        query: webSearchQuery,
        results: [],
        total_results: 0,
        search_engine: 'duckduckgo',
        search_type: 'web'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Render file upload section
  const renderUploadSection = () => (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <div className="mt-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Select Files'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.md"
          />
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Supports PDF, DOCX, Excel, Images, Text files
        </p>
      </div>

      {/* Processing options */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Processing Type
        </label>
        <div className="flex space-x-4">
          {['analyze', 'extract', 'ingest'].map((type) => (
            <label key={type} className="flex items-center">
              <input
                type="radio"
                name="processType"
                value={type}
                checked={processType === type}
                onChange={(e) => setProcessType(e.target.value as any)}
                className="mr-2"
              />
              <span className="capitalize">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Processing result */}
      {processingResult && (
        <div className={`p-4 rounded-md ${
          processingResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <h4 className="font-medium">
            {processingResult.success ? 'Processing Successful' : 'Processing Failed'}
          </h4>
          {processingResult.processingResult && (
            <pre className="mt-2 text-sm overflow-auto max-h-32">
              {JSON.stringify(processingResult.processingResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );

  // Render URL processing section
  const renderUrlSection = () => (
    <div className="space-y-4">
      <div className="flex space-x-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter URL to process..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleUrlProcess}
          disabled={isProcessing || !urlInput.trim()}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {isProcessing ? 'Processing...' : 'Process'}
        </button>
      </div>

      {/* Processing result */}
      {processingResult && (
        <div className={`p-4 rounded-md ${
          processingResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <h4 className="font-medium">
            {processingResult.success ? 'URL Processing Successful' : 'URL Processing Failed'}
          </h4>
          {processingResult.processingResult && (
            <pre className="mt-2 text-sm overflow-auto max-h-32">
              {JSON.stringify(processingResult.processingResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );

  // Render RAG section
  const renderRAGSection = () => (
    <div className="space-y-4">
      <div className="flex space-x-2">
        <input
          type="text"
          value={ragQuery}
          onChange={(e) => setRagQuery(e.target.value)}
          placeholder="Enter query for RAG search..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleRAGSearch}
          disabled={isProcessing || !ragQuery.trim()}
          className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          Search
        </button>
        <button
          onClick={handleRAGQuery}
          disabled={isProcessing || !ragQuery.trim()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          Query
        </button>
      </div>

      {/* RAG results */}
      {ragResult && (
        <div className={`p-4 rounded-md ${
          ragResult.success ? 'bg-blue-50 border border-blue-200' : 'bg-red-50 border border-red-200'
        }`}>
          <h4 className="font-medium">
            {ragResult.success ? 'RAG Results' : 'RAG Failed'}
          </h4>
          
          {ragResult.metadata && (
            <div className="mt-2 text-sm">
              <p>Results: {ragResult.metadata.total_results}</p>
              <p>Avg Similarity: {ragResult.metadata.average_similarity}</p>
            </div>
          )}

          {ragResult.results && ragResult.results.length > 0 && (
            <div className="mt-4 space-y-2 max-h-48 overflow-auto">
              {ragResult.results.map((result, index) => (
                <div key={index} className="p-2 bg-white rounded border">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Similarity: {(result.similarity * 100).toFixed(1)}%</span>
                    <span>{result.context_type}</span>
                  </div>
                  <p className="text-sm mt-1 line-clamp-2">{result.content_preview}</p>
                </div>
              ))}
            </div>
          )}

          {ragResult.context && (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">Full Context</summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded max-h-32 overflow-auto">
                {ragResult.context}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );

  // Render web search section
  const renderWebSearchSection = () => (
    <div className="space-y-4">
      <div className="flex space-x-2">
        <input
          type="text"
          value={webSearchQuery}
          onChange={(e) => setWebSearchQuery(e.target.value)}
          placeholder="Enter query for web search..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleWebSearch}
          disabled={isProcessing || !webSearchQuery.trim()}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          Search Web
        </button>
      </div>

      {/* Web search results */}
      {webSearchResult && (
        <div className={`p-4 rounded-md ${
          webSearchResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <h4 className="font-medium">
            {webSearchResult.success ? 'Web Search Results' : 'Web Search Failed'}
          </h4>
          
          <div className="mt-2 text-sm">
            <p>Results: {webSearchResult.total_results}</p>
            <p>Engine: {webSearchResult.search_engine}</p>
          </div>

          {webSearchResult.results && webSearchResult.results.length > 0 && (
            <div className="mt-4 space-y-2 max-h-48 overflow-auto">
              {webSearchResult.results.map((result, index) => (
                <div key={index} className="p-2 bg-white rounded border">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Source: {result.source}</span>
                    <span>{result.search_engine}</span>
                  </div>
                  <h5 className="font-medium text-sm mt-1">{result.title}</h5>
                  <p className="text-sm mt-1 line-clamp-2">{result.description}</p>
                  <a 
                    href={result.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline mt-1 block"
                  >
                    {result.url}
                  </a>
                </div>
              ))}
            </div>
          )}

          {webSearchResult.results && webSearchResult.results.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer font-medium">Search Context</summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded max-h-32 overflow-auto">
                {webSearchResult.results.map((item: any) => 
                  `${item.title}: ${item.description} (Source: ${item.url})`
                ).join('\n\n')}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );

  // Render settings section
  const renderSettingsSection = () => (
    <div className="space-y-4">
      <div className="bg-gray-50 p-4 rounded-md">
        <h4 className="font-medium mb-2">Supported File Types</h4>
        {supportedFileTypes ? (
          <div className="space-y-2 text-sm">
            <div>
              <strong>Allowed Extensions:</strong>
              <div className="flex flex-wrap gap-1 mt-1">
                {supportedFileTypes.supported_file_types.allowed_extensions.map((ext: string) => (
                  <span key={ext} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                    {ext}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <strong>Max File Size:</strong> {supportedFileTypes.supported_file_types.max_file_size_mb}MB
            </div>
          </div>
        ) : (
          <button
            onClick={loadSupportedFileTypes}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Load Supported Types
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Tabs */}
      <div className="border-b">
        <nav className="flex space-x-8 px-6">
      {[
        { id: 'upload' as const, name: 'File Upload', icon: Upload },
        { id: 'url' as const, name: 'URL Processing', icon: Globe },
        { id: 'rag' as const, name: 'RAG Search', icon: Database },
        { id: 'web' as const, name: 'Web Search', icon: Webhook },
        { id: 'settings' as const, name: 'Settings', icon: Settings }
      ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'upload' && renderUploadSection()}
        {activeTab === 'url' && renderUrlSection()}
        {activeTab === 'rag' && renderRAGSection()}
        {activeTab === 'web' && renderWebSearchSection()}
        {activeTab === 'settings' && renderSettingsSection()}
      </div>
    </div>
  );
};

export default FileProcessingManager;
