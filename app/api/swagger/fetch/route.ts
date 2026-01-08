/**
 * Swagger Fetch API
 * 
 * Fetches OpenAPI/Swagger spec from a URL with optional auth headers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { url, apiKey, bearerToken } = body;
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }
    
    // Build headers
    const headers: Record<string, string> = {
      'Accept': 'application/json, application/yaml, text/yaml, */*',
      'User-Agent': 'Tulzo-Swagger-Importer/1.0',
    };
    
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    
    // Fetch the spec
    const response = await fetch(url, {
      method: 'GET',
      headers,
      // 30 second timeout
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }
    
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    
    // Detect format
    let format: 'json' | 'yaml' = 'json';
    if (contentType.includes('yaml') || url.endsWith('.yaml') || url.endsWith('.yml')) {
      format = 'yaml';
    } else if (text.trim().startsWith('{')) {
      format = 'json';
    } else {
      format = 'yaml';
    }
    
    // Extract host from URL for default environment
    const defaultHost = `${parsedUrl.protocol}//${parsedUrl.host}`;
    
    return NextResponse.json({
      success: true,
      spec: text,
      format,
      defaultHost,
      sourceUrl: url,
    });
    
  } catch (error) {
    console.error('Error fetching swagger:', error);
    
    if ((error as Error).name === 'TimeoutError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: 408 });
    }
    
    return NextResponse.json(
      { error: `Failed to fetch: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

