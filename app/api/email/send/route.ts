import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Cache the verified domain to avoid repeated API calls
let cachedDomain: string | null = null;
let domainCacheTime: number = 0;
const DOMAIN_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getVerifiedDomain(): Promise<string> {
  // Return cached domain if still valid
  if (cachedDomain && Date.now() - domainCacheTime < DOMAIN_CACHE_TTL) {
    return cachedDomain;
  }

  try {
    const { data, error } = await resend.domains.list();

    if (error || !data?.data?.length) {
      console.error('Failed to fetch domains:', error);
      return 'resend.dev'; // Fallback to Resend's default domain
    }

    // Find a verified domain with sending capability
    const verifiedDomain = data.data.find(
      (d) => d.status === 'verified' || d.status === 'not_started'
    );

    if (verifiedDomain) {
      cachedDomain = verifiedDomain.name;
      domainCacheTime = Date.now();
      return cachedDomain;
    }

    // If no verified domain, use the first available
    cachedDomain = data.data[0].name;
    domainCacheTime = Date.now();
    return cachedDomain;
  } catch (err) {
    console.error('Error fetching Resend domains:', err);
    return 'resend.dev';
  }
}

/**
 * POST /api/email/send
 *
 * Send an email using Resend.
 * The sender domain is fetched dynamically from Resend's verified domains.
 *
 * Body:
 * - to: string (recipient email, required)
 * - subject: string (required)
 * - body: string (plain text or HTML, required)
 * - isHtml?: boolean (default: false)
 */
export async function POST(request: NextRequest) {
  try {
    // Check for internal call
    const internalUserId = request.headers.get('X-User-Id');
    const isInternalCall = request.headers.get('X-Internal-Call') === process.env.INTERNAL_API_SECRET;

    if (!isInternalCall || !internalUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { to, subject, body: emailBody, isHtml } = body;

    if (!to) {
      return NextResponse.json({ error: 'to is required' }, { status: 400 });
    }

    if (!subject || !emailBody) {
      return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });
    }

    // Get the verified domain dynamically
    const domain = await getVerifiedDomain();
    const fromAddress = `Tulzo <noreply@${domain}>`;

    // Send via Resend
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject: subject,
      ...(isHtml ? { html: emailBody } : { text: emailBody }),
    });

    if (error) {
      console.error('Resend API error:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to send email',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: data?.id,
      to: to,
      from: fromAddress,
    });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

