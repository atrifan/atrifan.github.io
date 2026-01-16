/**
 * RAG Swagger Generator
 * Generates OpenAPI 3.0 specs for RAG collection endpoints
 */

export interface RAGSwaggerConfig {
  ragName: string;
  displayName: string;
  description?: string;
  serverDescription?: string;
  sourceType: 'csv' | 'url';
  embeddingModel?: string;
  embeddingDimensions?: number;
  topN?: number;
  // For URL source
  sourceUrl?: string;
  httpMethod?: 'GET' | 'POST';
  paramsLocation?: 'query' | 'body';
  requestContentType?: string;
  fieldMapping?: Record<string, string>;
  // Host configuration
  hostUrl?: string; // For CSV: uses NEXT_PUBLIC_URL, for URL: uses sourceUrl
}

/**
 * Generate OpenAPI 3.0 spec for a RAG collection
 */
export function generateRAGSwagger(config: RAGSwaggerConfig): object {
  const {
    ragName,
    displayName,
    description,
    serverDescription,
    sourceType,
    embeddingModel,
    embeddingDimensions = 384,
    topN = 5,
    sourceUrl,
    httpMethod = 'POST',
    paramsLocation = 'body',
    requestContentType = 'application/json',
    fieldMapping = {},
    hostUrl,
  } = config;

  // Determine the base URL
  const baseUrl = sourceType === 'csv' 
    ? (hostUrl || process.env.NEXT_PUBLIC_URL || 'https://tulzo.com')
    : sourceUrl || '';

  // For CSV, the endpoint is our collection API
  // For URL, the endpoint is the remote source
  const path = sourceType === 'csv' 
    ? `/api/collection/{apiKey}/${ragName}`
    : '';

  const spec: Record<string, unknown> = {
    openapi: '3.0.3',
    info: {
      title: displayName || ragName,
      description: serverDescription || description || `RAG collection: ${displayName}`,
      version: '1.0.0',
      'x-rag-source-type': sourceType,
      'x-embedding-model': embeddingModel,
      'x-embedding-dimensions': embeddingDimensions,
    },
    servers: [
      {
        url: baseUrl,
        description: sourceType === 'csv' ? 'Tulzo RAG Collection API' : 'Remote RAG Endpoint',
      },
    ],
    paths: {},
    components: {
      schemas: {
        SearchRequest: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text',
            },
            top_n: {
              type: 'integer',
              description: 'Number of results to return',
              default: topN,
              minimum: 1,
              maximum: 20,
            },
            ...(sourceType === 'url' && {
              embedding: {
                type: 'array',
                items: { type: 'number' },
                description: `Embedding vector (${embeddingDimensions} dimensions)`,
              },
            }),
          },
          required: ['query'],
        },
        SearchResponse: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string', description: 'Document content' },
                  score: { type: 'number', description: 'Similarity score' },
                  metadata: { type: 'object', description: 'Document metadata' },
                },
              },
            },
            query: { type: 'string' },
            model: { type: 'string' },
          },
        },
      },
    },
  };

  // Build the path operation
  const operation: Record<string, unknown> = {
    operationId: `search_${ragName.replace(/-/g, '_')}`,
    summary: `Search ${displayName}`,
    description: description || `Search the ${displayName} knowledge base`,
    tags: ['RAG Search'],
  };

  if (sourceType === 'csv') {
    // CSV uses our standard collection API
    (spec.paths as Record<string, unknown>)[path] = {
      post: {
        ...operation,
        parameters: [
          {
            name: 'apiKey',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Your API key',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SearchRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Search results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SearchResponse' },
              },
            },
          },
        },
      },
    };
  } else {
    // URL source - use the remote endpoint configuration
    const urlPath = new URL(sourceUrl || '').pathname || '/search';
    const method = httpMethod.toLowerCase();

    const pathOperation: Record<string, unknown> = { ...operation };

    if (paramsLocation === 'query' || method === 'get') {
      // Query parameters
      pathOperation.parameters = [
        {
          name: fieldMapping.query || 'query',
          in: 'query',
          required: true,
          schema: { type: 'string' },
          description: 'Search query',
        },
        {
          name: fieldMapping.top_n || 'top_n',
          in: 'query',
          required: false,
          schema: { type: 'integer', default: topN },
          description: 'Number of results',
        },
        {
          name: fieldMapping.embedding || 'embedding',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'Embedding vector (JSON array)',
        },
      ];
    } else {
      // Request body
      const contentType = requestContentType || 'application/json';
      pathOperation.requestBody = {
        required: true,
        content: {
          [contentType]: {
            schema: {
              type: 'object',
              properties: {
                [fieldMapping.query || 'query']: { type: 'string' },
                [fieldMapping.top_n || 'top_n']: { type: 'integer', default: topN },
                [fieldMapping.embedding || 'embedding']: {
                  type: 'array',
                  items: { type: 'number' },
                  description: `Embedding vector (${embeddingDimensions} dimensions)`,
                },
              },
              required: [fieldMapping.query || 'query'],
            },
          },
        },
      };
    }

    pathOperation.responses = {
      '200': {
        description: 'Search results',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SearchResponse' },
          },
        },
      },
    };

    (spec.paths as Record<string, unknown>)[urlPath] = {
      [method]: pathOperation,
    };
  }

  return spec;
}

/**
 * Replace host URL placeholder in swagger spec
 * Used when displaying swagger with actual host
 */
export function replaceSwaggerHost(spec: object, newHost: string): object {
  const updated = JSON.parse(JSON.stringify(spec));
  if (updated.servers && updated.servers[0]) {
    updated.servers[0].url = newHost;
  }
  return updated;
}

