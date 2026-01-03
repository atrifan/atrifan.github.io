import type { Metadata } from 'next';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CustomMCPServerDocsPage } from '@/src/views/CustomMCPServerDocsPage';
import { isFreePlan } from '@/src/config/billing.config';

export const metadata: Metadata = {
  title: 'Custom MCP Server - Tulzo',
  description: 'View the tools available in your custom MCP server.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Check if user has Pro or higher plan
 */
async function checkUserPlan(userId: string): Promise<string> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Check publicMetadata first
    if (user.publicMetadata?.plan) {
      return user.publicMetadata.plan as string;
    }

    // Check unsafeMetadata
    if (user.unsafeMetadata?.plan) {
      return user.unsafeMetadata.plan as string;
    }

    // Check organization memberships for plan
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    for (const membership of memberships.data) {
      const org = await client.organizations.getOrganization({ organizationId: membership.organization.id });
      if (org.publicMetadata?.plan) {
        return org.publicMetadata.plan as string;
      }
    }

    return 'free';
  } catch {
    return 'free';
  }
}

export default async function CustomMCPServerDocs({ params }: PageProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check if user is on free plan - redirect to dashboard
  const userPlan = await checkUserPlan(userId);
  if (isFreePlan(userPlan)) {
    redirect('/dashboard');
  }

  const { id } = await params;

  return <CustomMCPServerDocsPage serverId={id} />;
}

