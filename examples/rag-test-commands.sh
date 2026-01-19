#!/bin/bash
# RAG Collection API Test Commands
#
# Replace YOUR_API_KEY with your actual API key
# Replace YOUR_RAG_NAME with your rag_name (e.g., "knowledge-base")

API_KEY="YOUR_API_KEY"
RAG_NAME="knowledge-base"
BASE_URL="http://localhost:3000"

# GET request
curl "${BASE_URL}/api/collection/${API_KEY}/${RAG_NAME}?q=how+to+get+started+with+RAG"

# POST request with top_k
curl -X POST "${BASE_URL}/api/collection/${API_KEY}/${RAG_NAME}" \
  -H "Content-Type: application/json" \
  -d '{"query": "vector search semantic similarity", "top_k": 3}'

# Example response:
# {
#   "success": true,
#   "collection": "knowledge-base",
#   "query": "how to get started with RAG",
#   "results": [
#     {
#       "id": "knowledge-base_sk_abc123_doc-001",
#       "score": 0.92,
#       "title": null,
#       "content": "Getting Started with RAG Systems...",
#       "source": null
#     }
#   ],
#   "count": 1
# }

# CSV Import: Only id and content columns are required
# - id: unique document identifier
# - content: the text to embed and search

