# Help chat and Google Search

The Help assistant answers ordinary questions by default, using the selected
Nadeem (`skin: scout`) or Bebo (`skin: classic`) identity. Introductions, writing,
coding and planning do not require approved platform documents. Generated plans
and drafts remain advice; the assistant does not execute payments, approvals or
other platform actions.

## General answers and platform policies

`POST /v1/ai/help/chat` and `/v1/ai/help/stream` accept the same Help input and
return SSE events. An omitted `mode` normally selects `general`; an explicit
`mode: policy` on these routes first searches approved platform evidence.
`POST /v1/ai/help/general` supplies a general-mode preference, but the policy
guard still applies.

`src/features/help/help-mode.ts` normalizes Arabic spelling and diacritics, then
routes policy keywords to the approved-knowledge path. These include fees,
commissions, refunds, withdrawals, payments, guarantees, escrow, disputes and
permissions. For example, `من أنت؟` uses general knowledge, whereas
`ما رسوم المنصة؟` searches approved evidence even with `mode: general` or
`webSearch: true`. This is a conservative keyword rule, not a semantic guarantee;
use explicit policy mode for an ambiguous platform-policy question.
Clear general topics such as animated drawings, charts and quality assurance
stay on the general path unless the question mentions the platform or explicitly
requests policy mode.

Policy retrieval filters approved documents by tenant, actor, audience, ownership
and locale. Generated citations must name a retrieved document and quote its
literal content. Missing approved evidence uses the same validated model route
as general questions and returns a completed answer with `knowledgeFallback:
true`, empty policy citations and no stock knowledge-base error. The assistant
explains general concepts or practical steps and distinguishes any unverified
Waseet details; it must not invent a fee, guarantee, permission, account status
or completed action. History and page context remain available on a non-search
fallback, and the generated answer is saved to the owned conversation normally.
Provider errors and invalid output remain errors rather than fabricated
successful answers. Invented quotations fail validation. Public web sources
cannot authorize or replace Waseet's platform policies. See [semantic retrieval](semantic-retrieval.md)
for indexing and access rules.

## Optional internet search

`webSearch: true` requests native Gemini Grounding with Google Search on the
general path, including a knowledge fallback. It expresses user intent; it does
not grant server permission.
`GeminiGateway.generateGrounded()` accepts only `AI-21-HELP-GENERAL` with
`PERSONAL` classification. It sends `tools: [{ google_search: {} }]` to the native
Generate Content API. It does not expose an arbitrary function, fetch arbitrary
user URLs or enable search on the generic runtime gateway.

The Help search prompt contains the current question only. Conversation history
and `pageContext`, including project details, are excluded from that prompt.
The question still uses the private-data routing policy and cannot be sent to a
free project. The server-owned assistant instruction treats pages as untrusted
data, retains the selected identity and forbids invented platform rules or
completed actions.

The gateway rejects nonempty native history and JSON-output schemas on this
path. It permits one provider request without automatic retry, caps the deadline
and attempt timeout at 60 seconds, limits the question to 6,000 characters and
enforces the normal output ceiling of 8,192 tokens. Help currently requests
2,000 output tokens. Cancellation reaches the provider transport; it does not
turn an incomplete response into a completed answer.

Google may execute multiple search queries inside one provider request. The
accepted metadata ceiling of 20 queries is a response-validation limit, not a
provider-side search-query budget. Google Search billing is separate from the
application's daily provider-request budget. Consult the official documentation
before enabling the deployment.

## Evidence and Search Suggestions

`InferenceResponse.groundingMetadata` preserves up to 20 web sources, 20 queries,
100 supporting segments and 64,000 characters of Search Suggestions HTML.
Sources must have HTTP(S) domain URLs; executable schemes, credentials, IP
literals, local/reserved hostnames and nonstandard web ports are rejected.
The gateway validates source indexes and literal supporting text. It converts
the provider's Part-relative UTF-8 byte offsets to offsets in the concatenated
public answer, excluding thought parts. Unknown metadata fields are discarded.

No provider metadata means no invented citations. Help additionally requires
search queries, sources and Search Suggestions before completing a search
answer; otherwise it returns `AI_WEB_SEARCH_NO_EVIDENCE`. The public citation
list identifies its entries as web sources rather than approved policy records.

The `help:citations` SSE event carries citations and optional
`searchSuggestionsHtml`. The Angular client bounds that field again and renders
it with ordinary `[innerHTML]` binding and Angular's default sanitizer. It uses
neither a security-bypass API nor an iframe. Search Suggestions are provider
attribution, not instructions or executable application markup. Deployment
review must include their actual presentation and the Google usage requirements.

Search Suggestions HTML is memory-only. The frontend's
`src/app/core/help/assistant-history.ts` rebuilds stored/exported messages from
an allowlist and strips that HTML. TXT/share output uses message text. Local
history is per user, supports multiple conversations and retains up to 20
conversations with 100 completed messages each, at most 30,000 characters per
message. It migrates version 1 history and does not automatically delete old
local conversations after seven days. Remote conversation records remain
tenant/actor scoped, retain text history and use the existing 30-day expiry.

Help emits `help:answer_start`, validated answer chunks, citations and
`help:answer_complete`, or `help:error`. These chunks segment a validated complete
provider answer; they are not represented as native provider token streaming.

## Server configuration and capability reporting

Search is disabled unless the server explicitly has
`WASEET_AI_ENABLE_WEB_SEARCH=true`. It also requires the existing
`WASEET_AI_ALLOW_PAID=true` gate, a valid explicit
`WASEET_AI_PAID_DAILY_REQUEST_BUDGET` and an enabled, credentialed paid project
whose allowlist includes an approved TEXT model. Enabling the search flag does
not change the paid gate, budget, credentials or private-data classification.

The authenticated `GET /v1/ai/capabilities` response includes:

```json
{"webSearch":{"available":false,"provider":"google","reason":"SERVER_DISABLED"}}
```

When the flag is enabled but no eligible paid TEXT route is currently available,
the reason is `PRIVATE_ROUTE_UNAVAILABLE`. Availability also respects blocked
credentials and model cooldowns. An available capability has no `reason` field.
This reports local configuration and routing state, not live provider acceptance
or remaining remote quota; `inferenceVerified` remains `false`.

No deployment environment or credentials were changed by this implementation.
Transport and capability regressions use local provider fixtures and forbid
unmocked network calls. Their success proves the local contracts, not live search
results, billing eligibility or production Google availability.

The native tool and grounding fields follow
[Google's Grounding with Google Search documentation](https://ai.google.dev/gemini-api/docs/generate-content/google-search).
Byte offsets follow the [Segment API reference](https://ai.google.dev/api/generate-content#Segment).
Search Suggestions presentation must follow the applicable
[Gemini API terms](https://ai.google.dev/gemini-api/terms).
