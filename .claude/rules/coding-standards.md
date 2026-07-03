---
description: TypeScript conventions, file organization, and error handling
appliesTo: ["**"]
alwaysApply: true
---

# Coding Standards

## TypeScript

- Explicit types; avoid `any`. Use union literals for status/plan (`'free' | 'pro' | 'plus'`).
- `async/await`, not `.then()` chains (except fire-and-forget best-effort logging).
- Destructure props.

## File organization

- **API routes**: one route per file, export named handlers (`GET`, `POST`, `PATCH`, ...).
- **Views**: large page components in `src/views/`, imported by thin `app/` pages.
- **Shared logic**: `src/lib/` (reuse services like `supabase-services.ts`, `marketplace-service.ts`,
  `admin.ts` — don't re-implement auth/DB access inline).
- **Config**: `src/config/` (models/pricing, tool definitions, billing).

## Error handling

```ts
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
throw new OAuthRequiredError(serverId, serverName); // custom errors for specific handling
```

## Database access

Always use the service-role client server-side and filter by `user_id`. Prefer the typed `supabase`
client in `src/lib/supabase.ts`; untyped `createClient` is acceptable for tables/views not yet in the
`Database` type (ratings, installs, rating-stats view).
