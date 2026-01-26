# Tulzo Project Context

## Project Overview
Tulzo is a **workflow automation platform** built with Next.js 14, Supabase, Clerk, and MCP (Model Context Protocol).

**Key Features:**
- AI-powered workflow automation with YAML definitions
- MCP server for external AI surfaces (ChatGPT, Claude Desktop, Cursor)
- AI chat with tool integration and RAG knowledge bases
- OAuth2 support for external integrations
- Free online tools (calculators, converters)

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Realtime)
- **Auth**: Clerk (with plan checking: `has({ plan: 'pro' })`)
- **UI**: Adobe React Spectrum
- **AI**: Vercel AI SDK, Mistral models

## Directory Structure
```
app/                    # Next.js App Router
├── api/               # API routes (ai/, mcp/, oauth/, webhooks/)
├── (auth)/           # Auth pages
├── automation/       # Automation builder
├── chat/             # AI chat
└── dashboard/        # Main dashboard

src/
├── config/           # Configuration (ai-tokens.config.ts is source of truth)
├── lib/automation/   # Workflow execution engine
├── views/            # Page components
└── types/            # TypeScript types
```

## Key Patterns

### Database Access
```typescript
// Always use service role for server-side
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
// Filter by user_id for RLS bypass
const { data } = await supabase.from('table').select('*').eq('user_id', userId);
```

### API Routes
```typescript
// Return JSON with error handling
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### OAuth Support
All tool types (MCP, REST, GraphQL, A2A, RAG) support OAuth2 with:
- Token storage in `oauth_tokens` table
- Refresh token handling
- External surface login via `/mcp/{serverName}/login`

## Workflow YAML Schema
```yaml
name: my-workflow
trigger:
  type: cron|webhook|manual|automation
steps:
  - id: step1
    tool: server.tool_name    # MCP tool call
    params: { key: "{{value}}" }
  - id: step2
    llm:
      model: mistral/ministral-3b
      prompt: "Process: {{step1.output}}"
```

## Important Files
- `src/config/ai-tokens.config.ts` - AI models & pricing (single source of truth)
- `src/lib/automation/executor.ts` - Core workflow executor
- `app/api/mcp/route.ts` - MCP server endpoint
- `CLAUDE.md` - Comprehensive project documentation

## Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run automation <yaml-file>  # Run automation locally
```

## Coding Standards
- Use explicit TypeScript types, avoid `any`
- Use async/await, not .then()
- Destructure props in components
- Follow existing patterns in codebase

