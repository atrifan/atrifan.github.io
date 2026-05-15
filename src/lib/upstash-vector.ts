/**
 * Upstash Vector Integration (DISABLED)
 *
 * Vector storage is not required for the current extension/device platform.
 * All vector functions return empty results. Type exports and pure utility
 * functions are preserved for UI compatibility.
 */

export interface VectorMetadata {
  user_id: string;
  rag_name: string;
  rag_id?: string;
  doc_id: string;
  title?: string;
  content: string;
  chunk_index?: number;
  source?: string;
  updated_at?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface FieldConfig {
  id_column: string;
  document_column: string;
  fields: FieldMapping[];
}

export interface FieldMapping {
  column: string;
  embed: boolean;
  metadata: boolean;
  format: string;
}

export const FIELD_FORMAT_PRESETS: Record<string, { pattern: RegExp; format: string; description: string }> = {
  price: { pattern: /price|cost|amount|fee/i, format: 'Price: {value}', description: 'Formats as "Price: $X"' },
  rating: { pattern: /rating|score|stars/i, format: 'Rating: {value}/5', description: 'Formats as "Rating: X/5"' },
  category: { pattern: /category|type|kind|genre/i, format: 'Category: {value}', description: 'Formats as "Category: X"' },
  date: { pattern: /date|time|created|updated/i, format: 'Date: {value}', description: 'Formats as "Date: X"' },
  location: { pattern: /location|city|country|address|place/i, format: 'Location: {value}', description: 'Formats as "Location: X"' },
  brand: { pattern: /brand|manufacturer|vendor|company/i, format: 'Brand: {value}', description: 'Formats as "Brand: X"' },
  stock: { pattern: /stock|inventory|available|quantity/i, format: '{value} in stock', description: 'Formats as "X in stock"' },
  boolean: { pattern: /^(is_|has_|can_|enabled|active|available)$/i, format: '{column}: {value}', description: 'Formats boolean fields' },
};

export function getSuggestedFormat(columnName: string): string {
  const lowerName = columnName.toLowerCase();
  for (const [, preset] of Object.entries(FIELD_FORMAT_PRESETS)) {
    if (preset.pattern.test(lowerName)) {
      return preset.format;
    }
  }
  return '{value}';
}

export function buildEmbeddingText(
  row: Record<string, string>,
  fieldConfig: FieldConfig
): string {
  const parts: string[] = [];
  const documentContent = row[fieldConfig.document_column];
  if (documentContent) {
    parts.push(documentContent.trim());
  }
  for (const field of fieldConfig.fields) {
    if (field.embed && row[field.column]) {
      const value = row[field.column].trim();
      if (value) {
        const formatted = field.format
          .replace('{value}', value)
          .replace('{column}', field.column);
        parts.push(formatted);
      }
    }
  }
  return parts.join('. ');
}

export function buildMetadata(
  row: Record<string, string>,
  fieldConfig: FieldConfig,
  baseMetadata: { user_id: string; rag_name: string; rag_id?: string; title?: string; source?: string }
): VectorMetadata {
  const metadata: VectorMetadata = {
    user_id: baseMetadata.user_id,
    rag_name: baseMetadata.rag_name,
    rag_id: baseMetadata.rag_id,
    title: baseMetadata.title,
    source: baseMetadata.source,
    doc_id: row[fieldConfig.id_column] || '',
    content: row[fieldConfig.document_column] || '',
    updated_at: new Date().toISOString(),
  };
  for (const field of fieldConfig.fields) {
    if (field.metadata && row[field.column]) {
      metadata[field.column] = row[field.column];
    }
  }
  return metadata;
}

export function generateVectorId(ragName: string, userId: string, docId: string): string {
  const safeDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${ragName}_${userId}_${safeDocId}`;
}

// All async vector operations are no-ops

export async function upsertVectors(
  _vectors: Array<{ id: string; data: string; metadata: VectorMetadata }>
): Promise<{ success: boolean; count: number }> {
  return { success: false, count: 0 };
}

export async function queryCollection(
  _userId: string,
  _ragName: string,
  _query: string,
  _topK: number = 5
): Promise<Array<{ id: string; score: number; metadata: VectorMetadata }>> {
  return [];
}

export async function queryByUserId(
  _userId: string,
  _query: string,
  _topK: number = 10
): Promise<Array<{ id: string; score: number; metadata: VectorMetadata }>> {
  return [];
}

export async function queryWebsite(
  _query: string,
  _topK: number = 5
): Promise<Array<{ id: string; score: number; metadata: VectorMetadata }>> {
  return [];
}

export async function deleteCollection(
  _userId: string,
  _ragName: string
): Promise<{ success: boolean; deletedCount: number }> {
  return { success: true, deletedCount: 0 };
}

export async function getCollectionVectorIds(
  _userId: string,
  _ragName: string
): Promise<string[]> {
  return [];
}

export async function deleteVectorsByIds(_ids: string[]): Promise<{ success: boolean; count: number }> {
  return { success: true, count: 0 };
}

export function isUpstashConfigured(): boolean {
  return false;
}
