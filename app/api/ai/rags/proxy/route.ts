/**
 * RAG Proxy API
 *
 * Forwards requests to external RAG endpoints to avoid CORS issues.
 * Used for both testing during import and actual RAG queries.
 * Supports various auth methods and request configurations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

interface TestProxyRequest {
  url: string;
  method: 'GET' | 'POST';
  paramsLocation: 'query' | 'body';
  contentType: 'application/json' | 'application/x-www-form-urlencoded';
  authType: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  authConfig: {
    apiKey?: string;
    bearerToken?: string;
    basicCredentials?: string;
  };
  oauth2Config?: {
    accessToken?: string;
  };
  customHeaders: Record<string, string>;
  fieldMapping: {
    query: string;
    embedding: string;
    top_n: string;
    dimensions: string;
    model: string;
  };
  query: string;
  topN: number;
  generateEmbedding: boolean;
  embeddingModel?: string;
  dimensions?: number;
  embedding?: number[];
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: TestProxyRequest = await request.json();
    const {
      url,
      method,
      paramsLocation,
      contentType,
      authType,
      authConfig,
      customHeaders,
      fieldMapping,
      query,
      topN,
      generateEmbedding,
      embeddingModel,
      dimensions,
    } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Build request params
    const params: Record<string, string | number | number[]> = {
      [fieldMapping.query || 'query']: query,
      [fieldMapping.top_n || 'top_n']: topN,
    };

    // Add embedding-related params if needed
    if (generateEmbedding) {
      // TODO: Generate actual embedding using the selected model
      // For now, we'll send placeholder values
      if (dimensions) {
        params[fieldMapping.dimensions || 'dimensions'] = dimensions;
      }
      if (embeddingModel) {
        params[fieldMapping.model || 'model'] = embeddingModel;
      }
      // Embedding would be generated here and added to params
      // params[fieldMapping.embedding || 'embedding'] = embedding;
    }

    // Build headers
    const headers: Record<string, string> = {
      ...customHeaders,
    };

    // Add auth headers
    if (authType === 'api_key' && authConfig.apiKey) {
      headers['X-API-Key'] = authConfig.apiKey;
    } else if (authType === 'bearer' && authConfig.bearerToken) {
      headers['Authorization'] = `Bearer ${authConfig.bearerToken}`;
    } else if (authType === 'basic' && authConfig.basicCredentials) {
      headers['Authorization'] = `Basic ${Buffer.from(authConfig.basicCredentials).toString('base64')}`;
    }

    // Build request URL and body
    let requestUrl = url;
    let requestBody: string | undefined;

    if (paramsLocation === 'query') {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.set(key, String(value));
      });
      requestUrl = `${url}${url.includes('?') ? '&' : '?'}${searchParams.toString()}`;
    } else {
      headers['Content-Type'] = contentType;
      if (contentType === 'application/json') {
        requestBody = JSON.stringify(params);
      } else {
        const formParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          formParams.set(key, String(value));
        });
        requestBody = formParams.toString();
      }
    }

    // Make the request
    const response = await fetch(requestUrl, {
      method,
      headers,
      body: method === 'POST' ? requestBody : undefined,
    });

    const responseText = await response.text();
    let responseData: unknown;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData,
    });
  } catch (error) {
    console.error('Error in RAG test proxy:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Proxy request failed' 
    }, { status: 500 });
  }
}

