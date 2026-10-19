# Semantic knowledge and project matching

The canonical backend-to-AI route for knowledge is `POST /v1/knowledge/search`.
It requires an expiring service token containing a server-authenticated actor and
`ai:generate`. Ingestion/approval still requires the privileged `data:write` scope.
The request audience cannot expand the actor's access. Search filters approved
documents by tenant, role, owner, locale and source version before embedding them.
Responses omit embeddings, private owner metadata and internal chunk records.

## Configuration

Both optional semantic features default to off. Enable deliberately in a configured
AI service environment after confirming the existing private-data routing:

```dotenv
WASEET_AI_KNOWLEDGE_SEMANTIC=true
WASEET_AI_KNOWLEDGE_EMBEDDING_MODEL=gemini-embedding-2
WASEET_AI_MATCHING_SEMANTIC=true
WASEET_AI_MATCHING_EMBEDDING_MODEL=gemini-embedding-2
```

User queries, provider skills and matching project descriptions remain `PERSONAL`.
They need an authorized paid project with `WASEET_AI_ALLOW_PAID=true` and an explicit
daily request budget. Enabling a semantic flag does not authorize paid routing or
relax the private-data policy. Free-only deployments fall back to lexical retrieval
without sending private queries to a free project. This task did not change any
deployment environment or provider credentials.

Knowledge uses 768-dimensional normalized vectors, overlapping source-offset
chunks, BM25 and reciprocal-rank fusion. Index records are durable and namespaced
by tenant. Their digest binds content, title, version, access fields and model;
changes/deletion invalidate vectors, and concurrent stale indexing cannot overwrite
new source facts. Existing approved documents migrate lazily: at most 16 uncached
documents per search, with a 20-second indexing deadline. Provider failures,
quota/auth failures and unavailable private routing preserve lexical access;
client cancellation remains cancellation.

Matching applies open-status, category, budget, duration, exclusions and required
skills before sending candidates to embeddings. It returns
`generationSource: SEMANTIC_EMBEDDING` and `retrievalSimilarity`, with
`aiMatchScore: null`. Similarity is retrieval evidence, not a probability of winning
or a quality grade. Fallback reports `matchingMode: lexical_fallback` and
`fallbackReason: SEMANTIC_UNAVAILABLE` rather than pretending to be semantic.

## Verification and deployment

The regression suite uses deterministic provider fixtures and forbids unmocked
network calls. Run it with the supported recent Node runtime:

```text
node --import tsx --test --test-concurrency=1 tests/**/*.test.ts
npm run build
```

Deploy the updated standalone service together with the updated Waseet backend
before expecting the browser's remote development environment to use these
contracts. The browser must not receive the bootstrap secret or service token.
Approved source ingestion and durable storage remain prerequisites for policy RAG;
an empty approved index is not replaced with fabricated policies.

For Embedding 2, document input uses `title: ... | text: ...`; query input uses
`task: search result | query: ...`, following the
[official Gemini embeddings documentation](https://ai.google.dev/gemini-api/docs/embeddings).

The local `MultiAgentsNext` capability registry/provider/checkpoint implementation
and `Desktop/AI_Docs` were reviewed as references. Their model-effort constraints
and bounded coordinator policies already matched Waseet's runtime; the Python
engine was not imported into this TypeScript service.
