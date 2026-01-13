'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { BackToTools } from '../components/BackToTools';
import { ADS_CONFIG } from '../config/ads.config';

interface RAGDetailPageProps {
  ragId: string;
  isPro: boolean;
  isPlus: boolean;
}

interface RAG {
  id: string;
  name: string;
  description: string | null;
  source_url: string | null;
  icon: string;
  has_embeddings: boolean;
  embedding_model: string | null;
  token_limit: number;
  document_count: number;
  total_tokens: number;
  is_enabled: boolean;
  created_at: string;
}

interface Document {
  id: string;
  title: string | null;
  source_identifier: string | null;
  token_count: number;
  created_at: string;
}

export function RAGDetailPage({ ragId, isPro, isPlus }: RAGDetailPageProps) {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;

  const [rag, setRag] = useState<RAG | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CSV upload state
  const [csvData, setCsvData] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fetchRag = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/rags?context=chat`);
      if (response.ok) {
        const data = await response.json();
        const found = data.rags?.find((r: RAG) => r.id === ragId);
        if (found) {
          setRag(found);
        } else {
          setError('RAG not found');
        }
      }
    } catch (err) {
      setError('Failed to fetch RAG');
    }
  }, [ragId]);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/rags/documents?ragId=${ragId}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  }, [ragId]);

  useEffect(() => {
    if (canAccessPro) {
      Promise.all([fetchRag(), fetchDocuments()]).finally(() => setLoading(false));
    }
  }, [canAccessPro, fetchRag, fetchDocuments]);

  const handleCsvUpload = async () => {
    if (!csvData.trim()) {
      setUploadError('Please enter CSV data');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      // Parse CSV - simple parser for title,content format
      const lines = csvData.trim().split('\n');
      const docs = lines.slice(1).map((line, idx) => {
        const parts = line.split(',');
        const title = parts[0]?.trim() || `Row ${idx + 1}`;
        const content = parts.slice(1).join(',').trim();
        return { title, content, sourceIdentifier: `csv-row-${idx + 1}` };
      }).filter(d => d.content);

      if (docs.length === 0) {
        throw new Error('No valid documents found in CSV');
      }

      const response = await fetch('/api/ai/rags/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ragId, documents: docs }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload documents');
      }

      const data = await response.json();
      setUploadSuccess(`Successfully uploaded ${data.count} documents`);
      setCsvData('');
      fetchDocuments();
      fetchRag();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Delete this document?')) return;

    try {
      await fetch(`/api/ai/rags/documents?id=${docId}`, { method: 'DELETE' });
      fetchDocuments();
      fetchRag();
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleDeleteRag = async () => {
    if (!confirm('Delete this entire knowledge base? This cannot be undone.')) return;

    try {
      await fetch(`/api/ai/rags?id=${ragId}`, { method: 'DELETE' });
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to delete RAG:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !rag) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {error || 'RAG not found'}
          </h1>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex">
        {ADS_CONFIG.enabled && (
          <SideAds
            leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
            leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
            leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
            rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
            rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
            rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
          />
        )}

        <main className="flex-1 max-w-4xl mx-auto px-4 py-8">
          <BackToTools />

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <span className="text-4xl">{rag.icon}</span>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {rag.name}
                </h1>
                {rag.description && (
                  <p className="text-gray-600 dark:text-gray-400">{rag.description}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleDeleteRag}
              className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
            >
              Delete
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{rag.document_count}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Documents</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{rag.total_tokens.toLocaleString()}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Tokens</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{rag.token_limit.toLocaleString()}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Token Limit</div>
            </div>
          </div>

          {/* Upload CSV */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Upload Data (CSV)
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Format: title,content (first row is header, will be skipped)
            </p>
            <textarea
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              placeholder="title,content&#10;FAQ 1,This is the answer to FAQ 1&#10;FAQ 2,This is the answer to FAQ 2"
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm mb-4"
            />
            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
                {uploadSuccess}
              </div>
            )}
            <button
              onClick={handleCsvUpload}
              disabled={isUploading || !csvData.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Upload CSV Data'}
            </button>
          </div>

          {/* Documents List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Documents ({documents.length})
            </h2>
            {documents.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No documents yet. Upload some data above.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {doc.title || doc.source_identifier || 'Untitled'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {doc.token_count} tokens
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
