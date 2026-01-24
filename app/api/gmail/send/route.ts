import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

/**
 * POST /api/gmail/send
 * 
 * Send an email using the user's Gmail account via Google OAuth.
 * Requires the user to have logged in with Google and granted Gmail permissions.
 * 
 * Body:
 * - to: string (recipient email, or "me" to send to self)
 * - subject: string
 * - body: string (plain text or HTML)
 * - isHtml?: boolean
 * - cc?: string (comma-separated)
 * - bcc?: string (comma-separated)
 */
export async function POST(request: NextRequest) {
  try {
    // Check for internal call or regular auth
    const internalUserId = request.headers.get('X-User-Id');
    const isInternalCall = request.headers.get('X-Internal-Call') === process.env.INTERNAL_API_SECRET;
    
    let userId: string | null = null;
    
    if (isInternalCall && internalUserId) {
      userId = internalUserId;
    } else {
      const authResult = await auth();
      userId = authResult.userId;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { to, subject, body: emailBody, isHtml, cc, bcc } = body;

    if (!subject || !emailBody) {
      return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });
    }

    // Get Google OAuth token from Clerk
    const clerk = await clerkClient();
    let accessToken: string | null = null;
    let userEmail: string | null = null;

    try {
      // Get the user's Google OAuth access token
      const tokens = await clerk.users.getUserOauthAccessToken(userId, 'oauth_google');
      
      if (!tokens.data || tokens.data.length === 0) {
        return NextResponse.json({ 
          error: 'Gmail not connected. Please sign in with Google and grant Gmail permissions.',
          code: 'GMAIL_NOT_CONNECTED'
        }, { status: 403 });
      }

      accessToken = tokens.data[0].token;

      // Get user's email from Clerk
      const user = await clerk.users.getUser(userId);
      userEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress 
        || user.emailAddresses[0]?.emailAddress;

    } catch (error) {
      console.error('Failed to get Google OAuth token:', error);
      return NextResponse.json({ 
        error: 'Failed to access Gmail. Please reconnect your Google account with Gmail permissions.',
        code: 'OAUTH_ERROR'
      }, { status: 403 });
    }

    if (!accessToken) {
      return NextResponse.json({ 
        error: 'No Gmail access token available',
        code: 'NO_TOKEN'
      }, { status: 403 });
    }

    // Determine recipient
    const recipient = (!to || to === 'me') ? userEmail : to;
    
    if (!recipient) {
      return NextResponse.json({ error: 'Could not determine recipient email' }, { status: 400 });
    }

    // Build email in RFC 2822 format
    const emailLines = [
      `From: ${userEmail}`,
      `To: ${recipient}`,
      `Subject: ${subject}`,
    ];

    if (cc) emailLines.push(`Cc: ${cc}`);
    if (bcc) emailLines.push(`Bcc: ${bcc}`);
    
    emailLines.push(`Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`);
    emailLines.push('');
    emailLines.push(emailBody);

    const rawEmail = emailLines.join('\r\n');
    
    // Base64url encode the email
    const encodedEmail = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    if (!gmailResponse.ok) {
      const errorData = await gmailResponse.json().catch(() => ({}));
      console.error('Gmail API error:', errorData);
      
      if (gmailResponse.status === 401) {
        return NextResponse.json({ 
          error: 'Gmail token expired. Please sign in again.',
          code: 'TOKEN_EXPIRED'
        }, { status: 401 });
      }
      
      if (gmailResponse.status === 403) {
        return NextResponse.json({ 
          error: 'Gmail permission denied. Please grant Gmail send permissions in your Google account.',
          code: 'PERMISSION_DENIED'
        }, { status: 403 });
      }

      return NextResponse.json({ 
        error: errorData.error?.message || 'Failed to send email via Gmail',
        code: 'GMAIL_ERROR'
      }, { status: 500 });
    }

    const result = await gmailResponse.json();

    return NextResponse.json({
      success: true,
      messageId: result.id,
      threadId: result.threadId,
      to: recipient,
    });
  } catch (error) {
    console.error('Gmail send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

