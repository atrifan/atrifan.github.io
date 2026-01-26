# Tulzo - GitHub Copilot Instructions

## Project Context
Tulzo is a workflow automation platform with MCP (Model Context Protocol) integration, AI chat, and external surface support for ChatGPT/Claude Desktop.

## Tech Stack
- Next.js 14 (App Router)
- Supabase (PostgreSQL + Realtime)
- Clerk authentication
- Adobe React Spectrum UI
- Vercel AI SDK

## Key Patterns

### Imports
```typescript
import { AI_MODELS } from '@/src/config/ai-tokens.config';
import { WorkflowDefinition } from '@/src/lib/automation/types';
```

### API Routes
```typescript
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ...
}
```

### Database Access
```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const { data } = await supabase.from('automations').select('*').eq('user_id', userId);
```

### Workflow YAML Steps
- `tool: connector.tool_name` - MCP tool call
- `llm: { model, prompt }` - AI call
- `code: expression` - JavaScript
- `if: condition` - Conditional
- `notify: { channels, message }` - Notification

## Directory Structure
- `app/api/` - API routes
- `src/views/` - Page components
- `src/lib/automation/` - Workflow engine
- `src/config/` - Configuration files
- `src/types/` - TypeScript types

## Testing
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run automation <yaml-file>  # Run automation locally
```

## Reference Files
- `CLAUDE.md` - Full project documentation
- `rules/augment-guidelines.txt` - YAML workflow schema

