# WaseetAI: verified technology notes

Research date: **2026-09-29**. These notes concern public documentation, not verified access to the owner's accounts. No real credentials were tested and no billable inference was performed. Recheck these sources when implementing or deploying; record the checked date and tested SDK versions.

## 1. Models and actual cost

The official catalog lists stable `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, and `gemini-3.5-flash-lite`. Keep four Waseet complexity aliases, but benchmark their routing rather than equating a version number with a quality score. A published model may still be unavailable to a particular project. [Official model catalog](https://ai.google.dev/gemini-api/docs/models)

Current standard USD prices per million tokens in the pricing page:

| Model | Input | Output, including thinking | Effective-date caveat |
|---|---:|---:|---|
| 3.8 / 3.7 / 3.6 Flash | 0.75 | 3.75 | Listed through 2026-12-31; 1.50 / 7.50 from 2027-01-01 |
| 3.5 Flash | 1.50 | 9.00 | Check again at deployment |
| 3.5 Flash-Lite | 0.30 | 2.50 | Check again at deployment |

Consequently, a fallback to 3.5 Flash is an availability/quality decision, not automatically a saving. Keep versioned, date-effective prices, separate modality/grounding/cache/batch costs, and avoid counting thinking tokens twice. These are reference prices, not a total project estimate or an account balance. [Official pricing](https://ai.google.dev/gemini-api/docs/pricing)

## 2. SDK, interactions and storage

Use the official TypeScript package `@google/genai`; pin a tested version and isolate it in a provider adapter. The older `@google/generativeai` package is not the maintained choice. [SDK documentation](https://ai.google.dev/gemini-api/docs/libraries)

Interactions is documented as GA since June 2026 and recommended for new projects; `generateContent` remains supported. Interactions defaults to `store=true`, with documented interaction retention of 55 days paid / one day free. Set `store=false` by default for Waseet stateless inference; this disables provider-side previous-interaction chaining and background execution. Keep bounded canonical conversation history in Waseet and orchestrate background work through its worker. This supports project failover while preserving the applicable data policy. Provider interaction/file/cache handles require project affinity. `store=false` does not itself remove all provider safety processing. [Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview)

## 3. Free-first routing and quota scope

Documented RPM, input TPM and RPD limits apply at project scope, with model distinctions; another key in the same project does not create capacity. RPD resets at midnight Pacific time. Billing account tier and shared caps also matter, including documented spend-rate windows. Discover each configured project's actual limits; do not invent numbers from a public example. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

A project pool can manage authorized capacity, load distribution and availability. It must respect applicable project and account limits. It must not create projects or rotate identities to evade documented restrictions: Google API Terms prohibit attempts to circumvent limitations. Do not promise that ten free projects provide approved or guaranteed tenfold capacity. [API Terms, section 2(d)](https://developers.google.com/terms)

The owner's preference is **eligible free projects first, paid fallback second**. Eligibility precedes cost preference. Unpaid terms prohibit submitting sensitive, confidential or personal information; unpaid content may be reviewed or used for improvement. Paid treatment depends on the actual project having active billing, not merely the owner having another paid project. The terms also require Paid Services for applications made available to EEA/UK/Swiss users. Paid content is not used to improve products, though safety processing may still occur. The implementation therefore restricts free routing to expressly eligible public/synthetic data and applies the geographic/product policy before routing. [Gemini API terms](https://ai.google.dev/gemini-api/terms)

## 4. Errors, credentials and billing

Classify structured provider errors. A temporary request-rate 429 differs from daily `quota_exceeded`; 402 payment exhaustion will not be fixed by retry. Authentication/permission failures need configuration repair. Bounded jittered retry can help transient failures, but safety/policy blocks must not be evaded by switching projects. [Error reference](https://ai.google.dev/gemini-api/docs/api-errors), [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

New AI Studio keys have used service-account-bound authorization keys since 2026-05-28. Current guidance rejects unrestricted standard keys while allowing explicitly restricted standard keys. Thus the blanket claim that every `AIza...` credential is unusable is too broad. Do not infer tier, validity or project identity from key prefixes. Store replacement credentials privately; the keys exposed in the old conversation must not be copied into this project. [Key documentation](https://ai.google.dev/gemini-api/docs/api-key)

A depleted prepaid billing account can affect all linked projects together. Billing reports and experimental spend controls may lag; trial credits and the old conversation's $300/$30 balances are not verified current budgets. Application reservations reduce overspending but cannot guarantee exact provider billing or stop unrelated Cloud resource charges. [Billing documentation](https://ai.google.dev/gemini-api/docs/billing)

## 5. Embeddings, voice and Google Cloud

The detailed embeddings guide lists stable `gemini-embedding-2` and `gemini-embedding-001`; the catalog contains a conflicting preview entry for Embedding 2. Resolve capability against current documentation and the actual project before enabling it. Start with 768 dimensions. Model spaces are incompatible: never mix versions in one search index, and re-embed on model changes. Embedding 2 and 001 have different normalization/task-input requirements. [Embeddings guide](https://ai.google.dev/gemini-api/docs/embeddings)

TTS is a separate capability. The catalog documents `gemini-3.8-flash-lite-tts` and `gemini-3.8-flash-tts`; the latter explicitly lists Egyptian and Standard Arabic. Verify voice, format and tier availability with a bounded authorized smoke test. The source requirement is text input plus synthesized response audio; it does not require speech recognition, video or lip sync. [TTS model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts)

Firestore vector search supports at most 2048 dimensions and needs a matching index. Tenant/visibility filters must be part of retrieval. [Vector search documentation](https://firebase.google.com/docs/firestore/vector-search)

Cloud Run supports a configurable request timeout up to 3600 seconds, but a timeout can close the connection while application work continues. Use explicit cancellation and a shorter application deadline. Cloud Tasks can invoke a private worker using OIDC; workers must handle retries and duplicate deliveries. [Cloud Run timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout), [Authenticated Cloud Tasks](https://docs.cloud.google.com/run/docs/triggering/using-tasks)

Firestore TTL deletion is asynchronous. Authorization, lease expiry and cache validity must check timestamps at read time. Transaction callbacks may rerun, so keep provider calls and task enqueue operations outside them. [TTL documentation](https://firebase.google.com/docs/firestore/ttl), [Transaction behavior](https://firebase.google.com/docs/firestore/transaction-data-contention)

## 6. Facts that remain account-specific

The owner/implementer must supply a verified project manifest, actual model access, free/paid status, billing-account groups, quotas, regions, available credits, site data contracts and approved Waseet policies. Unknown values stay unknown. Complete local implementation with mocks without claiming live integration, deployment or production approval.
