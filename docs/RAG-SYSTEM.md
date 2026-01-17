# RAG (Retrieval Augmented Generation) System

This document describes the RAG system architecture in Tulzo, which allows users to create searchable knowledge bases that can be queried via API or integrated with AI chat.

## Overview

The RAG system supports two types of knowledge bases:

1. **Local RAGs** - Documents uploaded via CSV, stored in Upstash Vector for semantic search
2. **External RAGs** - Remote API endpoints that provide search functionality

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RAG System                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐ │
│  │  RAG Import  │────▶│   user_rags  │────▶│  Upstash Vector      │ │
│  │  (CSV/URL)   │     │   (Supabase) │     │  (Embeddings Store)  │ │
│  └──────────────┘     └──────────────┘     └──────────────────────┘ │
│                              │                        │              │
│                              ▼                        ▼              │
│                       ┌──────────────┐     ┌──────────────────────┐ │
│                       │ rag_documents│     │  /api/collection/    │ │
│                       │  (metadata)  │     │  {apiKey}/{ragName}  │ │
│                       └──────────────┘     └──────────────────────┘ │
│                                                       │              │
│  ┌──────────────┐                                     ▼              │
│  │ External RAG │─────────────────────────▶ ┌──────────────────────┐│
│  │  (URL type)  │                           │   RAG Explorer UI    ││
│  └──────────────┘                           │   (Search & Test)    ││
│         │                                   └──────────────────────┘│
│         ▼                                                            │
│  ┌──────────────┐                                                    │
│  │  RAG Proxy   │  (Handles CORS, auth, OAuth2 token refresh)       │
│  │  /api/ai/    │                                                    │
│  │  rags/proxy  │                                                    │
│  └──────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### `user_rags` Table

Main table storing RAG configurations:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | TEXT | Clerk user ID |
| `name` | VARCHAR(255) | Display name |
| `rag_name` | VARCHAR(100) | Normalized name for API endpoint |
| `description` | TEXT | User description |
| `source_url` | TEXT | Remote endpoint URL (for URL type) |
| `source_type` | VARCHAR(20) | `csv` or `url` |
| `auth_type` | VARCHAR(50) | `none`, `api_key`, `bearer`, `basic`, `oauth2`, `custom` |
| `auth_config` | JSONB | Authentication configuration |
| `custom_headers` | JSONB | Custom HTTP headers |
| `has_embeddings` | BOOLEAN | Whether source has pre-computed embeddings |
| `embedding_model` | VARCHAR(100) | Model used for embeddings |
| `embedding_dimensions` | INTEGER | Vector dimensions (384, 768, 1536, etc.) |
| `token_limit` | INTEGER | Max tokens to include in context |
| `chunk_size` | INTEGER | Size of text chunks |
| `chunk_overlap` | INTEGER | Overlap between chunks |
| `top_n` | INTEGER | Default number of results to return |
| `document_count` | INTEGER | Number of documents |
| `chunk_count` | INTEGER | Number of chunks in Upstash |
| `total_tokens` | INTEGER | Total tokens stored |

### `rag_documents` Table

Stores document metadata (actual vectors are in Upstash):

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `rag_id` | UUID | Foreign key to user_rags |
| `user_id` | TEXT | Clerk user ID |
| `title` | VARCHAR(500) | Document title |
| `content` | TEXT | Document content |
| `source_identifier` | TEXT | Original filename/URL/row ID |
| `chunk_index` | INTEGER | Chunk position |
| `token_count` | INTEGER | Tokens in this chunk |

## Vector Storage (Upstash)

Vectors are stored in Upstash Vector with metadata for isolation:

```typescript
interface VectorMetadata {
  api_key: string;      // User's API key (for isolation)
  rag_name: string;     // Normalized RAG name
  rag_id?: string;      // RAG UUID
  title?: string;       // Document title
  content: string;      // Text content
  chunk_index?: number; // Chunk position
  source?: string;      // Source identifier
}
```

**Key Design Decision**: All users share a single Upstash Vector index. Isolation is achieved via metadata filtering:
- Each vector has `api_key` = user's API key
- Each vector has `rag_name` = normalized collection name
- Queries filter by both fields

## API Endpoints

### Local RAG Search

**Endpoint**: `GET/POST /api/collection/{apiKey}/{ragName}`

Search a user's local RAG collection.

```bash
# GET request
curl "https://tulzo.com/api/collection/sk_abc123/my-knowledge-base?q=how+to+deploy"

# POST request
curl -X POST "https://tulzo.com/api/collection/sk_abc123/my-knowledge-base" \
  -H "Content-Type: application/json" \
  -d '{"query": "how to deploy", "top_k": 5}'
```

**Response**:
```json
{
  "success": true,
  "collection": "my-knowledge-base",
  "query": "how to deploy",
  "results": [
    {
      "id": "rag-123-0",
      "score": 0.89,
      "title": "Deployment Guide",
      "content": "To deploy your application...",
      "source": "docs.csv"
    }
  ],
  "count": 1
}
```

### RAG Management APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/rags` | GET | List user's RAGs |
| `/api/ai/rags` | POST | Create new RAG |
| `/api/ai/rags/[id]` | PUT | Update RAG |
| `/api/ai/rags/[id]` | DELETE | Delete RAG |
| `/api/ai/rags/documents` | GET | List documents in RAG |
| `/api/ai/rags/documents` | POST | Add documents |
| `/api/ai/rags/documents/upload` | POST | Upload CSV file |
| `/api/ai/rags/active` | POST | Activate RAG for chat |
| `/api/ai/rags/proxy` | POST | Proxy requests to external RAGs |

### Website Search

**Endpoint**: `GET/POST /api/search`

Searches the website's own knowledge base (api_key="tulzo").

```bash
curl "https://tulzo.com/api/search?q=pricing"
```

## Core Library: `src/lib/upstash-vector.ts`

The Upstash Vector integration library provides these functions:

| Function | Description |
|----------|-------------|
| `upsertVectors()` | Insert/update vectors with metadata |
| `queryCollection()` | Search specific RAG by api_key + rag_name |
| `queryByApiKey()` | Search all RAGs for a user |
| `queryWebsite()` | Search website vectors (api_key="tulzo") |
| `deleteCollection()` | Delete all vectors in a RAG |
| `isUpstashConfigured()` | Check if Upstash is configured |

### Environment Variables

```env
VECTOR_STORAGE_UPSTASH_VECTOR_REST_URL=https://xxx.upstash.io
VECTOR_STORAGE_UPSTASH_VECTOR_REST_TOKEN=xxx
```

## RAG Types

### 1. Local RAGs (CSV Import)

**Flow**:
1. User uploads CSV file via RAG Import wizard
2. System parses CSV, extracts content/title columns
3. Documents stored in `rag_documents` table
4. Vectors upserted to Upstash with user's api_key + rag_name
5. Upstash generates embeddings automatically (hybrid search mode)

**Key Files**:
- `src/views/RAGImportPage.tsx` - Import wizard UI
- `app/api/ai/rags/documents/upload/route.ts` - CSV upload handler
- `app/api/collection/[apiKey]/[ragName]/route.ts` - Search endpoint

### 2. External RAGs (URL Import)

**Flow**:
1. User configures remote endpoint URL
2. User sets up authentication (API key, Bearer, OAuth2, etc.)
3. User maps field names (query, top_n, results)
4. Queries are proxied through `/api/ai/rags/proxy`

**Key Files**:
- `src/views/RAGImportPage.tsx` - URL configuration UI
- `app/api/ai/rags/proxy/route.ts` - Proxy handler with auth

**Proxy Features**:
- CORS bypass for browser requests
- Multiple auth types (API key, Bearer, Basic, OAuth2)
- OAuth2 token refresh
- Custom headers support
- Embedding generation (optional)

## RAG Explorer

The RAG Explorer (`src/views/RAGExplorerPage.tsx`) provides:
- Interactive search interface
- Query history with sessions
- Token/cost tracking
- Result visualization

## Integration with AI Chat

RAGs can be activated for AI chat context:

1. User activates RAG via `/api/ai/rags/active`
2. Chat system queries active RAGs before AI call
3. Retrieved context is injected into system prompt
4. AI generates response with RAG context

## Security Model

1. **API Key Isolation**: Each user's vectors are tagged with their API key
2. **Query Filtering**: All queries filter by api_key to prevent cross-user access
3. **Ownership Validation**: API validates RAG ownership before operations
4. **OAuth2 Support**: Secure token storage and refresh for external RAGs

## File Structure

```
app/api/
├── ai/rags/
│   ├── route.ts              # CRUD for RAGs
│   ├── active/route.ts       # Activate RAG for chat
│   ├── documents/
│   │   ├── route.ts          # Document CRUD
│   │   └── upload/route.ts   # CSV upload
│   └── proxy/route.ts        # External RAG proxy
├── collection/
│   └── [apiKey]/[ragName]/route.ts  # Public search API
└── search/route.ts           # Website search

src/
├── lib/
│   └── upstash-vector.ts     # Upstash Vector client
└── views/
    ├── RAGImportPage.tsx     # Import wizard
    └── RAGExplorerPage.tsx   # Search interface

supabase/migrations/
├── 20250113_rag_tables.sql   # Base schema
└── 20250115_add_rag_top_n.sql # Additional columns
```

