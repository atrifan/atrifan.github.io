import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * OAuth Dynamic Client Registration (DCR) endpoint
 * RFC 7591: https://tools.ietf.org/html/rfc7591
 *
 * Allows clients to dynamically register and obtain credentials.
 */

interface DCRRequest {
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
  software_id?: string;
  software_version?: string;
}

interface DCRResponse {
  client_id: string;
  client_secret: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
  software_id?: string;
  software_version?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: DCRRequest = await request.json();

    // Generate dynamic client credentials
    const clientId = `dynamic_client_${Date.now()}`;
    const clientSecret = crypto.randomBytes(32).toString('base64url');
    const issuedAt = Math.floor(Date.now() / 1000);

    const response: DCRResponse = {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: issuedAt,
      client_secret_expires_at: 0, // 0 means never expires
      redirect_uris: body.redirect_uris || [],
      grant_types: body.grant_types || ['authorization_code', 'refresh_token'],
      response_types: body.response_types || ['code'],
      token_endpoint_auth_method: body.token_endpoint_auth_method || 'none',
    };

    // Include optional fields if provided
    if (body.client_name) response.client_name = body.client_name;
    if (body.client_uri) response.client_uri = body.client_uri;
    if (body.logo_uri) response.logo_uri = body.logo_uri;
    if (body.scope) response.scope = body.scope;
    if (body.contacts) response.contacts = body.contacts;
    if (body.tos_uri) response.tos_uri = body.tos_uri;
    if (body.policy_uri) response.policy_uri = body.policy_uri;
    if (body.software_id) response.software_id = body.software_id;
    if (body.software_version) response.software_version = body.software_version;

    return NextResponse.json(response, {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Invalid request body' },
      { status: 400 }
    );
  }
}

// Also support GET for discovery
export async function GET() {
  return NextResponse.json(
    { error: 'invalid_request', error_description: 'Use POST to register a client' },
    { status: 405 }
  );
}

