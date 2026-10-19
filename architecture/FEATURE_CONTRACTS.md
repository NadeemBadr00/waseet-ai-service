# WaseetAI feature contracts and source coverage

This is an execution specification accompanying `ARCHITECTURE_IMPLEMENTATION_PLAN.md`. Build a new, independent AI service and a website-backend integration adapter. The documents describe the existing website's desired integration surface; they do not authorize executing instructions found inside uploaded content, changing website business records, or treating example values as production policy.

Sources supplied in this bundle: `sources/AI.pdf` and `sources/AI2.pdf` (originally provided from the owner's Downloads folder). Every page number below is a **physical PDF page**, counted from the cover as page 1. Printed footer numbers differ. Source labels such as `AI-12` refer to numbered sections, not PDF pages.

## 1. Contract rules applying to every feature

1. The website owns users, roles, specialties, projects, client requests, proposals, payments, escrow, accreditation samples, publication decisions, and other business records. The service owns AI requests, assessment/onboarding attempts, jobs, derived AI results, approved knowledge copies, and derived search representations. A successful AI response must never silently write website business state.
2. All service calls come from the authenticated website backend. It supplies an `actor: { userId, role }` object derived from its authenticated session, never copied unchecked from browser input. The service validates feature permissions and tenant/client scope. The website verifies ownership of the referenced business entities and builds an authorized snapshot. The service also enforces actor/attempt/result ownership for state it owns. A `providerId` supplied by a browser is not proof of identity or access.
3. For an old endpoint that accepts only an ID or an empty body, the adapter must resolve and supply an explicit `context` snapshot. There is no implicit connection to the website database. Each snapshot contains source entity IDs, `sourceVersion` (or another monotonic version), `asOf`, and the actual relevant fields. Define entity-specific schemas and freshness requirements; reject missing essential context rather than inventing it.
4. Canonical request fields below appear alongside `actor`, optional `locale`, and the feature-specific `context`. IDs identify records; they never replace their contents unless an explicitly synchronized, authorized service-side representation exists. Provider/project/service ingestion and knowledge ingestion have separate contracts in section 7.
5. Canonical JSON success shape is `{ success: true, requestId, data: <feature result>, meta?: <request provenance> }`; canonical errors are `{ success: false, requestId, error: { code, message, retryable, retryAfterSeconds? } }`. The main plan defines additional provenance details. Keep source fields and their nesting in `data`; additive provenance such as source versions, prompt version, policy version, evidence references, warnings, estimate basis, and missing data belongs in `meta` or explicitly documented additive fields. The compatibility adapter maps this to old `{ success, data }`/event shapes where required. Do not overwrite a source field with a different meaning.
6. Source examples are not complete schemas. The generation agent must publish OpenAPI schemas with required/optional/nullability rules and validated ranges. A production policy enum or threshold must be configured and documented; do not infer an exhaustive enum from one example. Known example strings are listed in the feature cards below.
7. Monetary values require `currency`, supplied by the backend from the project's currency or an explicitly documented tenant setting. Do not guess currency from language, location, or a number. Use a documented decimal/minor-unit representation and rounding rule. The adapter converts the old numeric shape while preserving value and currency provenance.
8. LLM output is untrusted. Validate structured results before release, reject unknown entity IDs, check calculations independently, and record insufficient evidence. Dates, historical rates, fees, experience, credentials, ownership, and market statistics cannot be invented to satisfy a required field. Where a legacy non-null field cannot honestly be populated, use the documented unavailable response/adapter state; never substitute a fabricated number or misleading zero.
9. Streaming uses the canonical SSE events below. The website adapter exposes the legacy Socket.IO events; do not build a separate browser-to-AI credential path. Every event is correlated to a request/attempt and authorized recipient. Forward chunks only to that recipient. Disconnect/retry semantics must not repeat finalization, duplicate questions, or mix two requests.
10. Labels describing estimated quality or approval are advisory. Final publication, legal ownership, accreditation, delivery acceptance, hiring, refunds, and payment/escrow decisions remain with website policy and authorized reviewers.
11. Latest user preference is free eligible projects first, then paid. This annex does not redefine routing or privacy policy. The main plan controls which projects may receive each data class and capability. A free-first preference never makes all context eligible for the free pool.

### Canonical streaming vocabulary

An SSE event contains a JSON payload with `requestId`, `operationId`, a monotonic `sequence`, and feature fields. `generation.started`, `text.delta` (`chunk`), `generation.progress` (`stage`, `progress`, `message`), `generation.completed` (`data` where appropriate), and `generation.error` (`code`, `message`) are common events. Assessment events additionally use `question.streamed`, `assessment.ready`, and `assessment.evaluation.completed`. Treat `assessment.ready` as the successful terminal generation event, and `assessment.evaluation.completed` as a terminal evaluation event where that transport is used; do not also emit a second generic successful terminal event. These terminal events complete their operation, not the user's separate assessment-taking lifecycle. The adapter translates them to the exact legacy events in section 6. Progress is a completed processing stage, not a fabricated model percentage. Persist one terminal operation state and emit at most one terminal event per live connection; replay retains the same event ID for client deduplication. Delivery cannot be guaranteed after disconnect.

## 2. Complete source-to-service traceability

The table contains exactly **31 source-section rows**: 21 from AI.pdf and 10 from AI2.pdf. Repeated interfaces share a core implementation but retain independent compatibility coverage. Requirement IDs and acceptance IDs must appear in the delivered test/coverage report.

| Source ID / title | Physical pages | Legacy endpoint or events | Canonical service route(s) | Requirement / acceptance IDs |
|---|---:|---|---|---|
| AI-01 Project Description Generator | AI.pdf 5 | `ai:generate_description` -> `ai:description_chunk`, `ai:description_complete`, `ai:description_error` | `POST /v1/ai/project-description/stream` | REQ-A; AT-A1, AT-BRIDGE-01 |
| AI-02 Request Draft Suggestions | AI.pdf 5-6 | `POST /api/client/requests/ai-suggest` | `POST /v1/ai/request-draft` | REQ-B; AT-B1 |
| AI-03 Milestone Suggestions | AI.pdf 6-7 | `POST /api/ai-review/suggest-milestones` | `POST /v1/ai/milestones` | REQ-C; AT-C1 |
| AI-04 Project Plan Analysis | AI.pdf 7 | `POST /api/ai-review/analyze` | `POST /v1/ai/project-analysis` | REQ-D; AT-D1 |
| AI-05 Live Text Suggestion and Enhancement | AI.pdf 8 | `stream_ai_suggest_text`, `stream_ai_enhance_description` | `POST /v1/ai/text/suggest/stream`; `POST /v1/ai/text/enhance/stream` | REQ-E, REQ-F; AT-E1, AT-F1, AT-BRIDGE-02 |
| AI-06 Specialty Portfolio AI Review | AI.pdf 8-9 | `POST /api/provider/specialties/:id/ai-evaluate` | `POST /v1/ai/portfolio-review` | REQ-G; AT-G1 |
| AI-07 Accreditation AI Evaluation | AI.pdf 9 | `POST /api/provider/accreditation/submit` | `POST /v1/ai/accreditation-review` | REQ-H; AT-H1 |
| AI-08 Skill Assessment | AI.pdf 10-11 | `POST /api/assessments/generate`; `POST /api/assessments/:attemptId/submit`; `start_assessment`; `submit_answer` | `POST /v1/ai/assessments`; `POST /v1/ai/assessments/:attemptId/submit` | REQ-I, REQ-J; AT-I1, AT-J1, AT-BRIDGE-03 |
| AI-09 Onboarding Calibration Quiz | AI.pdf 11-12 | `setup_test:init`, `setup_test:answer`, `setup_test:result` | `POST /v1/ai/onboarding-quizzes`; `POST /v1/ai/onboarding-quizzes/:attemptId/answers`; `GET /v1/ai/onboarding-quizzes/:attemptId/status` | REQ-M; AT-M1, AT-BRIDGE-04 |
| AI-10 Proposal Suggestions | AI.pdf 12-13 | `POST /api/proposals/ai-suggest` | `POST /v1/ai/proposals/suggest` | REQ-N; AT-N1 |
| AI-11 Proposal AI Audit | AI.pdf 13 | `trigger_ai_audit` -> `ai_audit_result` | `POST /v1/ai/proposals/audit/stream` | REQ-O; AT-O1, AT-BRIDGE-05 |
| AI-12 Proposal Submission | AI.pdf 13-14 | `POST /api/projects/:id/proposals` | `POST /v1/ai/proposals/enrich` (AI enrichment only) | REQ-AC; AT-AC1 |
| AI-13 Provider Matching | AI.pdf 14-15 | `GET /api/provider/statistics` | `POST /v1/ai/matching/projects-for-provider` | REQ-P; AT-P1 |
| AI-14 Project Fit Analysis | AI.pdf 15 | `GET /api/assistant/analyze-project/:projectId` | `POST /v1/ai/project-fit` | REQ-Q; AT-Q1 |
| AI-15 Marketplace Recommendations | AI.pdf 15-16 | `POST /api/marketplace/ai-recommendations` | `POST /v1/ai/marketplace/recommendations` | REQ-R; AT-R1 |
| AI-16 Public Profile AI Performance Metrics | AI.pdf 16 | `GET /api/provider/profile/public/:providerId` | `POST /v1/ai/profile/performance-summary` | REQ-S; AT-S1 |
| AI-17 Bio and Skills Suggestions | AI.pdf 16-17 | `POST /api/provider/profile/suggest-bio`; `POST /api/provider/profile/suggest-skills` | `POST /v1/ai/profile/bio`; `POST /v1/ai/profile/skills` | REQ-T, REQ-U; AT-T1, AT-U1 |
| AI-18 Project Health Analysis | AI.pdf 17 | `POST /api/provider/projects/:id/health`; `POST /api/client/requests/:id/health` | `POST /v1/ai/project-health` | REQ-V; AT-V1 |
| AI-19 Delivery AI Review | AI.pdf 17-18 | `POST /api/client/requests/:id/stages/:stageId/ai-review` | `POST /v1/ai/delivery-review` with `view: "client"` | REQ-W; AT-W1 |
| AI-20 Dispute AI Summary | AI.pdf 18 | `POST /api/admin/disputes/:id/ai-summary` | `POST /v1/ai/disputes/summary` | REQ-X; AT-X1 |
| AI-21 Help Assistant Chat | AI.pdf 18-19 | `help:ask` -> `help:answer_start`, `help:answer_chunk`, `help:answer_complete`, `help:error` | `POST /v1/ai/help/stream` | REQ-Y; AT-Y1, AT-BRIDGE-06 |
| AI2-01 Bulk Business Model AI Re-Audit | AI2.pdf 4 | `POST /api/business-models/re-audit-all` | `POST /v1/ai/business-models/re-audit`; `GET /v1/jobs/:jobId` | REQ-AA; AT-AA1 |
| AI2-02 Business Model AI Audit | AI2.pdf 4-5 | Internal operation in review/bulk flow; no route specified | `POST /v1/ai/business-models/audit` | REQ-Z; AT-Z1 |
| AI2-03 Provider Delivery AI Review | AI2.pdf 5 | `POST /api/provider/projects/:id/stages/:stageId/ai-review` | `POST /v1/ai/delivery-review` with `view: "provider"` | REQ-W; AT-W2 |
| AI2-04 AI Avatar Assistant | AI2.pdf 6 | Namespace `/`: `ai_chat` -> `ai_chat_response` | `POST /v1/ai/avatar/chat` | REQ-AB; AT-AB1, AT-BRIDGE-07 |
| AI2-05 Assessment Status | AI2.pdf 6-7 | `GET /api/assessments/:attemptId/status` | `GET /v1/ai/assessments/:attemptId/status` | REQ-K; AT-K1 |
| AI2-06 Assessment Real-Time Question Streaming | AI2.pdf 7-8 | Namespace `/`: `start_assessment` -> `question_streamed`, `assessment_ready`, `assessment_error` | `POST /v1/ai/assessments/stream` | REQ-L, REQ-I; AT-L1, AT-BRIDGE-03 |
| AI2-07 Assessment Real-Time Evaluation | AI2.pdf 8-9 | Namespace `/`: `submit_answer` -> `evaluation_complete`, `assessment_error` | `POST /v1/ai/assessments/:attemptId/submit` | REQ-J; AT-J2, AT-BRIDGE-03 |
| AI2-08 Proposal AI Audit Progress | AI2.pdf 9-10 | Namespace `/`: `trigger_ai_audit` -> `ai_audit_progress`, `ai_audit_result` | `POST /v1/ai/proposals/audit/stream` | REQ-O; AT-O2, AT-BRIDGE-05 |
| AI2-09 AI Text Suggestion Stream | AI2.pdf 10 | Namespace `/`: `stream_ai_suggest_text` | `POST /v1/ai/text/suggest/stream` | REQ-E; AT-E1, AT-BRIDGE-02 |
| AI2-10 AI Description Enhancement Stream | AI2.pdf 10-11 | Namespace `/`: `stream_ai_enhance_description` | `POST /v1/ai/text/enhance/stream` | REQ-F; AT-F1, AT-BRIDGE-02 |

## 3. Authoring, evaluation, and proposal contracts

### REQ-A: Project description generation

- Route: `POST /v1/ai/project-description/stream`.
- Input: `title`, `category`; optional authorized context for language, scope, deliverables, constraints, and tone. Do not require hidden business data for a simple title/category request.
- Output: SSE text chunks and a stored successful or error terminal state, with at most one terminal event per live connection under the shared replay rules. Legacy chunk shape is `{ event: "ai:description_chunk", chunk }`; completion has `{ event: "ai:description_complete" }`; error has `{ event: "ai:description_error", message }`.
- Invariants: do not invent a client's deadlines, budget, legal commitments, or technologies as already agreed facts. Suggestions can be labeled as suggestions. Respect cancellation and configured output limits.
- `AT-A1`: title/category produce a coherent stream; cancellation and upstream failure close it cleanly without a second terminal success.

### REQ-B: Request draft suggestions

- Route: `POST /v1/ai/request-draft`.
- Input: `title`, `description`, `specialtyName`, `currency`; context includes allowed specialty/subspecialty taxonomy, known budget/duration constraints, and any factual candidate availability used for match estimation.
- Exact source result: `{ suggestedTitle, suggestedDescription, suggestedSubSpecialties: [], recommendedMinBudget, recommendedMaxBudget, suggestedDurationDays, complexityRating, personalizedNote, aiMatchScoreEstimate }`.
- `complexityRating: "Medium"` and `aiMatchScoreEstimate: 82` are examples. Define the rating vocabulary explicitly. `aiMatchScoreEstimate` needs an explained scoring/availability basis; no candidate data means unavailable/null with explicit reason, not an invented 82. The compatibility adapter must show unavailable rather than a fabricated score if the current UI requires a number.
- Enforce minimum budget <= maximum budget, valid duration, valid taxonomy references, and currency consistency. State estimates and assumptions in metadata. New descriptions must not overwrite user's saved draft automatically.
- `AT-B1`: preserves all nine output fields including `aiMatchScoreEstimate`; invalid sub-specialties are rejected; absent market/provider evidence produces an honest unavailable estimate.

### REQ-C: Milestones

- Route: `POST /v1/ai/milestones`.
- Input: `title`, `description`, `totalAmount`, `currency`; optional requested delivery days, constraints, and sequential/parallel scheduling policy.
- Source result: `{ milestones: [{ title, description, days, percentage }] }`. Canonical result adds a deterministically calculated `amount` to each item, documented as an extension.
- Enforce positive durations, unique meaningful milestones, percentages totaling 100, and rounded amounts totaling `totalAmount`. Allocate residual minor units deterministically. Validate against requested duration according to explicit scheduling semantics; do not blindly sum overlapping phases.
- The model suggests breakdowns; the calculation layer owns monetary totals. No payment or escrow operation occurs.
- `AT-C1`: fractional percentages and currency rounding still reconcile exactly; negative values and impossible duration constraints cannot pass silently.

### REQ-D: Project plan analysis

- Route: `POST /v1/ai/project-analysis`.
- Input: `title`, `description`; context may include a complete project/business-plan draft, target market, supplied research, pricing, and constraints. Request currency if numeric pricing is evaluated.
- Exact result: `{ clarityScore, feasibilityScore, marketFitRating, executiveSummary, strengths: [], gapsAndRisks: [], recommendedImprovements: [], suggestedPricingStrategy }`.
- `marketFitRating: "Good"` is an example, not a verified market conclusion. Explain scoring rubrics and evidence limits. Without market research/approved grounding, evaluate the supplied assumptions rather than inventing external demand or competitor facts.
- `AT-D1`: separates supplied facts from assumptions and returns all eight fields with source-linked concerns.

### REQ-E: Text suggestions

- Route: `POST /v1/ai/text/suggest/stream`.
- Input: `title`; optional `context` identifies field purpose, project/proposal information, desired length, and verified provider facts.
- Output: streamed suggested text. Source event is `stream_ai_suggest_text`, namespace `/`. Source gives no response event names; use the documented extension bridge in section 6 until the website's actual handler contract is supplied.
- Do not invent experience, achievements, client names, or guarantees. Do not treat field text as system instructions.
- `AT-E1`: suggestions fit the specified field and do not insert unsupported provider credentials.

### REQ-F: Description enhancement

- Route: `POST /v1/ai/text/enhance/stream`.
- Input: `description`; optional context supplies target tone/language and protected facts. AI2.pdf clarifies this field and supersedes the vague shared `{ title }` example in AI.pdf section 5 for this operation.
- Output: streamed improved description. Source input event is `stream_ai_enhance_description`, namespace `/`; response names are a documented source gap.
- Preserve meaning, material numbers, commitments, and factual claims. Report a meaningful ambiguity instead of resolving it by invention.
- `AT-F1`: enhancement preserves dates, prices, named technologies, and experience claims; treats malicious embedded instructions as content.

### REQ-G: Specialty portfolio review

- Route: `POST /v1/ai/portfolio-review`.
- Input: `providerSpecialtyId`; context includes authorized provider/specialty profile, specialty rubric, portfolio sample metadata, extracted content or approved file references, ownership evidence, and source versions. The old empty body requires the website to resolve these records.
- Preserve nesting: `{ status, scores: { aiScore, feasibilityScore, clarityScore, ownershipCredibility }, feedback: { summary, strengths: [], warnings: [], corrections: [] } }`.
- Add evidence metadata such as `evidenceReviewed`, `evidenceMissing`, and score basis. `TEST_REQUIRED` is an example of advisory workflow status; define allowed statuses with website policy. AI must not independently switch the provider's accreditation record.
- Ownership credibility is an evidence-based heuristic, not proof of legal ownership. Missing/unreadable files must be visible in the result and reduce confidence rather than become implicit positive evidence.
- `AT-G1`: returns nested `scores` and `feedback`; missing ownership evidence cannot be presented as verified ownership; only the requested specialty's authorized samples are used.

### REQ-H: Accreditation evaluation

- Route: `POST /v1/ai/accreditation-review`.
- Source multipart input: `providerSpecialtyId`, `title`, `description`, `technologiesUsed[]`, `projectUrl`, `githubUrl`, and optional files. Exact multipart file field names, media limits, and optionality are not supplied by the source; declare them in the adapter schema.
- Canonical input replaces binary multipart bodies with approved upload/object references and extracted evidence. The website creates its own sample record and supplies `context.sample: { id, status, sourceVersion }`, plus specialty rubric and authorized provider context.
- Preserve result shape: `{ sample: { id, status }, evaluation: { aiScore, status, aiQualityRating, feedbackAr, strengths: [], recommendations: [] } }`. `sample.id` is the website's supplied ID; `sample.status` reports supplied/confirmed website state, not a state invented by this service. `evaluation.status` is an advisory assessment. If website policy subsequently changes sample status, the website returns its confirmed state to its own client.
- `AI_VERIFIED` and `Excellent` are source examples, not auto-approval authorization. Evidence metadata is additive. Do not execute downloaded repository code; fetch only authorized, bounded evidence and record inaccessible links.
- `AT-H1`: source multipart adapter resolves files and sample ID; preserves `sample`/`evaluation` nesting; a high score alone does not persist sample approval or prove ownership.

### REQ-N: Proposal suggestions

- Route: `POST /v1/ai/proposals/suggest`.
- Input: `projectId`, `currentTitle`, `currentMessage`, `currency`; context includes authorized project requirements/budget, provider profile, evidence-backed advantages, and pricing assumptions. The source's project ID alone is insufficient for an independent service.
- Exact result: `{ suggestedTitle, suggestedMessage, qualityScore, qualityTag, priceAudit: { recommendedMin, recommendedMax, priceTag, justification }, suggestedAdvantages: [] }`.
- `Good` and `Suitable` are examples. Define rubric/rating vocabularies. Price range must reconcile and be presented as an estimate with assumptions. Advantages must be grounded in provided experience/evidence.
- `AT-N1`: retains all nested `priceAudit` fields, uses project context, and never claims unsupported achievements or price certainty.

### REQ-O: Proposal audit and progress

- Route: `POST /v1/ai/proposals/audit/stream`.
- Input: `providerId`, `projectId`; context explicitly contains provider profile/evidence, client request/project requirements, and current proposal if available. The source asks for a three-way comparison but the legacy request carries only two IDs: this is a context gap to resolve in the website adapter.
- Exact final data: `{ profileAudit: [], triPartyComparison, finalMetrics: { compatibilityScore }, acceptanceOdds }`. Do not flatten `finalMetrics.compatibilityScore`.
- Add `estimateType`, `componentScores`/factors, missing context, and source versions. `acceptanceOdds` is explicitly a heuristic score unless a separately validated, calibrated predictive model exists. Missing evidence can require a null/unavailable estimate and a documented legacy UI adaptation. Do not falsely present a heuristic as a statistical probability.
- Compatibility comes from the documented scoring rubric/engine; AI explains the factors. Progress events correspond to actual stages: validation, authorized context preparation, analysis request, response validation, completion. Stage percentages are a UI convention, not measurement of internal model progress.
- `AT-O1`: all final source fields and nesting preserved; scores have basis and proposal context is checked.
- `AT-O2`: progress is monotonic and stage-derived; failure never emits a fake 100% success or an unrelated request's final result.

### REQ-AC: Final proposal enrichment (required addition to the earlier A-AB list)

- Route: `POST /v1/ai/proposals/enrich`.
- Legacy website route remains `POST /api/projects/:id/proposals`. Website handles provider authorization, business validation, terms/escrow acknowledgments, proposal ID allocation/persistence, and idempotency of submission. This service receives the authorized final proposal snapshot to generate AI fields.
- Source submission fields: `title`, `message`, `totalPrice`, `deliveryDays`, `milestones: [{ stepOrder, title, description, days, percentage, amount }]`, `agreedToTerms`, `agreedToEscrow`. Canonical context includes website `proposalId`, `projectId`, provider/project snapshots, `currency`, source versions, and this exact final submitted content. Agreement flags are evidence of website workflow, not commands to transfer money or accept terms on a user's behalf.
- Preserve legacy result: `{ id, aiMatchScore, aiQualityTag, aiPriceTag, aiFeedback: { summary } }`, where `id` is the supplied website proposal ID. The website combines the AI result with its business submission response.
- Reuse common matching/quality/pricing rubrics, but evaluate the final content, not a stale earlier draft. Store `proposalVersion`/content hash with derived results. Validate amounts, delivery schedule, and milestone consistency independently.
- Define website behavior if AI is unavailable: submission can use a documented pending/unavailable AI state according to website policy, without duplicating the proposal or fabricating AI scores. The source does not decide whether AI is a blocking condition; record the chosen integration behavior explicitly.
- `AT-AC1`: final proposal changes invalidate stale suggestions; all four AI result fields and ID remain present when successful; retry does not create a proposal, acknowledge escrow, or submit twice.

## 4. Assessment and onboarding contracts

### Shared assessment state and policy

Use one assessment-attempt lifecycle across REST and streaming generation/submission. Persist the actor, specialty, source profile version, question set/version, secret answer key, generation state, readiness time, expiry, finalized result, and policy version. Exact number of questions, duration, passing threshold, attempts allowed, retry interval, and late-submission policy are product settings to be defined; the examples of 20 questions and 15 minutes do not establish universal policy.

Canonical states must be documented. At minimum distinguish generating, ready/in progress, completed, expired, and failed. Source status strings `IN_PROGRESS` and `COMPLETED` must be mapped explicitly. A status endpoint returns `score: null` and `isPassed: null` until finalized; zero is not a placeholder for ungraded work. If expiry is finalized by policy, explain the result and state consistently. Generate and fully validate the complete immutable question set and private answer key, then persist them before exposing any question. Start the attempt's timer atomically on the **first public exposure** of questions, whether the transport is REST or streaming, and preserve that start/expiry across reconnects. Generation time does not consume the answer window. This safe preparation/exposure sequence is an explicit adaptation of the PDF's generation-stream wording.

Store `correctAnswer`, explanations that reveal it, rubrics, and private evaluation metadata server-side. Exclude them from question lists, streams, status, errors, normal logs, and public cache entries. No after-submission answer-key release is required by these PDFs; any review/release feature needs explicit product policy. Multiple-choice scoring is deterministic against the stored key; AI generates optional qualitative feedback only after the numeric grade is fixed.

### REQ-I: Assessment generation

- Route: `POST /v1/ai/assessments`.
- Input: `providerSpecialtyId`; context includes authorized specialty, level/target competencies, verified profile information needed for tailoring, rubric, and configured assessment policy.
- Exact result: `{ attemptId, questions: [{ id, textAr, options: [{ id, text }] }], timeLimitMinutes, generationSource }`.
- Question IDs and option IDs must be unique within their scope; keys reference actual options; each question must have a valid, independently checked correct answer. Invalid or ambiguous questions must be repaired/replaced before delivery. The entire immutable set and private key must be validated and persisted before the REST response exposes questions. The first exposure atomically establishes the shared start/expiry timestamps. The Arabic `textAr` field remains supported regardless of the surrounding service language.
- `generationSource: "GEMINI"` is the documented source value. Define how cached/prebuilt fallback sources are represented; do not label an unrelated origin GEMINI. An existing concurrent generation returns `GENERATION_IN_PROGRESS` with stable attempt association where possible.
- `AT-I1`: REST and socket starts cannot create duplicate attempts for the same idempotent operation; complete result matches the private key; no answer or revealing explanation is exposed.

### REQ-J: Assessment submission/evaluation

- Route: `POST /v1/ai/assessments/:attemptId/submit`.
- Input: `submittedAnswers` mapping question ID strings to option IDs. Socket payload also contains `attemptId`. Despite its name, the legacy `submit_answer` event submits the full answer map, not one question at a time.
- Exact result: `{ attemptId, score, isPassed, status, feedbackAr, strengths: [], weaknesses: [], completedAt }` with finalized state `COMPLETED` when successfully completed. Add recommended learning areas only as a documented extension.
- Validate actor ownership, state, deadlines, unknown question IDs, unknown options, and missing-answer policy. Finalize transactionally once. For a repeated identical request, canonical idempotency may return the existing result; a distinct second finalization request returns `ALREADY_FINALIZED`. Document compatibility behavior and never rescore because of a feedback-generation failure.
- Preserve error codes `AUTH_REQUIRED`, `INVALID_REQUEST`, `RATE_LIMITED`, `NOT_FOUND`, `ALREADY_FINALIZED`, `SUBMISSION_FAILED`; generation can additionally use `GENERATION_IN_PROGRESS`. Do not leak attempt existence across actors.
- `AT-J1`: concurrent submissions finalize once, and stored numeric score is unaffected by unavailable Gemini feedback.
- `AT-J2`: Socket.IO `evaluation_complete` has the exact result fields; unauthorized, expired, or invalid submissions return `assessment_error` without key leakage.

### REQ-K: Assessment status

- Route: `GET /v1/ai/assessments/:attemptId/status`.
- Actor context for bodyless GETs uses authenticated backend headers `X-Waseet-Actor-Id` and `X-Waseet-Actor-Role` as defined by the main plan; do not require an HTTP GET body. The main OpenAPI must document that transport consistently.
- Exact source result: `{ attemptId, status, score, isPassed }`. Before finalization the latter two fields are null. Add progress, ready/expiry timestamps, or recoverable error state only as documented metadata/extensions.
- This reads authorized persisted state and does not call a model.
- `AT-K1`: generating/in-progress attempts expose null grade fields; finalized results agree with submission; polling never consumes model requests or reveals another user's attempt.

### REQ-L: Assessment question streaming

- Route: `POST /v1/ai/assessments/stream`.
- Same input, authorization, policy, key isolation, and idempotent creation as REQ-I. Use the same generator, not a separate question-generation code path with different rules. Send truthful preparation-stage progress while generating/validating/persisting. Only after the complete immutable question set and private answer key are safely persisted may the service stream validated public questions. This deliberately adapts the source wording to prevent exposure of an ultimately invalid test; do not simulate token streaming with sleeps or fabricated progress.
- `question.streamed` data becomes legacy `question_streamed`: `{ attemptId, question: { id, textAr, options: [{ id, text }] } }`.
- `assessment.ready` becomes `{ attemptId, totalQuestions, timeLimitMinutes, generationSource }`. Emit only after the prepared public set has been delivered for the attempt. Atomically start the deadline at first public question exposure, preserve it on reconnect, and return the same persisted set on recovery. An upstream generation/validation failure occurs before any question exposure; a later transport failure does not replace the prepared test or reset the clock.
- Errors map to `assessment_error` `{ code, message }`. Persist sufficient state to support reconnection/status recovery without leaking the secret key or duplicating question IDs.
- `AT-L1`: streaming and REST expose equivalent safe public question shapes only after full validation/persistence; upstream preparation failure exposes no question; a transport failure never replaces the test or restarts the user's clock; no fake streaming delays/progress are present.

### REQ-M: Onboarding calibration quiz lifecycle

- Routes: `POST /v1/ai/onboarding-quizzes` to initialize; `POST /v1/ai/onboarding-quizzes/:attemptId/answers` to submit one answer; `GET /v1/ai/onboarding-quizzes/:attemptId/status` to recover state/result.
- Init input: authorized actor plus provider onboarding/specialty context and configured calibration policy. Canonical init output includes `attemptId`, status, public first question (or public question list according to the declared presentation policy), total questions, and timing/expiry information if configured. This is an explicit extension because the source does not provide an init response schema.
- Answer input retains `{ questionId, answerIndex }`. Define canonical indexing as zero-based and implement an explicit adapter conversion if the website uses one-based indexing; this is a documented new contract choice, not a source fact. Each request is correlated to an attempt owned by the actor. The adapter holds that correlation because the old answer event omits `attemptId`.
- The source final result is `{ score, total, correct, message }`, emitted inside `{ event: "setup_test:result", ...result }`. Here `correct` and `total` are counts. The numerical meaning/scale of `score` must be stated; default contract decision is raw correct-count unless the adopted calibration rubric explicitly declares another scale. The source's 8/10 example is not a passing threshold.
- Persist answer sequence/state; handle repeated answer delivery idempotently; define whether changing an answer is allowed before finalization; reject foreign question IDs and out-of-range indexes. Score deterministically with private answer keys. Do not leak the key in intermediate feedback.
- Adapter extension events `setup_test:ready`, `setup_test:question`, and `setup_test:error` are proposed names for missing source events. Record them as extensions and confirm against actual website handlers during integration; existing source events `setup_test:init`, `setup_test:answer`, `setup_test:result` remain exact.
- `AT-M1`: init/answer/reconnect/finalize works as one authorized session; index conversion is verified; duplicate answers cannot increase the score; final count/total/score semantics agree.

## 5. Matching, profiles, project review, assistance, and bulk contracts

### REQ-P: Provider matching

- Route: `POST /v1/ai/matching/projects-for-provider`.
- Input: provider ID, ranking limit and approved filters; context includes authorized structured provider profile, verified skills/history, availability and preferences. Candidate projects must come from authorized synchronized open-project representations with IDs, versions, publication/open state, specialties, scope, budget/currency, and timing.
- Preserve result: `{ aiMatchingProjects: [{ projectId, aiMatchScore, matchReasons: [], generationSource }], summary: { aiRating } }`. Add component scores and provenance per match; do not silently drop the summary.
- Ranking combines documented deterministic filters/weights with semantic similarity; LLM text explains the rank. Closed/private/unauthorized projects cannot appear. Every returned ID must be an eligible existing candidate, and the full catalog must not be sent in one prompt.
- `aiRating: 4.6` is a source example. It needs a distinct defined rating scale and source; it is not automatically a match percentage. When no provider rating history exists, return unavailable with sample-size metadata, not an invented 4.6. `generationSource` must identify the origin truthfully according to the shared schema.
- `AT-P1`: eligible candidates only, stable scoring components, no hallucinated IDs, and explicit handling of no history/no matching candidates/stale index.

### REQ-Q: Project fit analysis

- Route: `POST /v1/ai/project-fit`.
- Input: `projectId`, `currency`; context includes the authorized requesting provider's profile and a current project snapshot. Source GET implies provider identity from the website session; the adapter must supply it.
- Exact result: `{ matchPercent, matchSummary, winningStrategy: [], suggestedBidPrice, priceRationale, riskAssessment }`; add deterministic `componentScores`, estimate assumptions, evidence, and source versions.
- Reuse matching scoring definitions so the same facts cannot create contradictory compatibility numbers across endpoints without a documented reason. A suggested price is an estimate, not a guarantee of winning or market value.
- `AT-Q1`: score reconciles to published components, provider identity is authorized, and pricing/risk language acknowledges missing facts.

### REQ-R: Marketplace recommendations

- Route: `POST /v1/ai/marketplace/recommendations`.
- Input: `query`, `limit`, optional `category`, approved filters. Source description mentions category while its sample request omits it; canonical optional category is a deliberate gap resolution.
- Exact result: `{ items: [{ id, title, generationSource }] }`, with additive ranking reason/score metadata if useful. IDs and titles must come from authorized published service records, not generated fictitious services.
- Retrieve a bounded candidate set from synchronized catalog embeddings and apply business filters before any small-set reranking. Validate configured limit, category taxonomy, visibility, and withdrawn records.
- `AT-R1`: closed/unpublished services never appear; category filtering and limits work; empty catalog returns an honest empty result rather than recommendations created by the model.

### REQ-S: Public profile performance metrics

- Route: `POST /v1/ai/profile/performance-summary`.
- Input: `providerId`; context contains authorized, minimized history or verifiable backend aggregates with raw numerators/denominators, window boundaries, rating scales, as-of time, and metric policy version.
- Preserve **all eight** result fields: `{ executionQuality, onTimeDelivery, communication, clientSatisfaction, onTimeCompletionRate, repeatClientRate, highRatingServicesRate, conflictFreeDeliveryRate }`.
- Define a metric registry for each field: meaning, source records, exclusions, calculation/normalization, observation window, minimum sample rule, and no-data behavior. Source does not define the difference between `onTimeDelivery` and `onTimeCompletionRate`; do not merge them or double-label one number without an explicit documented policy decision.
- Historical rates are deterministic. Qualitative dimensions such as communication/execution quality may use a reviewed rubric over actual evidence, but must not become arbitrary LLM percentages. Expose score basis/sample sizes/confidence. No-data uses null/unavailable plus reason; zero denotes a measured zero. The website decides how to render unavailable public metrics.
- Public results exclude private messages, dispute evidence, financial details, and internal reviewer notes. Optional narrative may explain grounded aggregates.
- `AT-S1`: all eight fields survive adapter round-trip; known fixture counts yield correct rates; no-history profile has no fabricated score; public output contains no private evidence.

### REQ-T: Biography suggestions

- Route: `POST /v1/ai/profile/bio`.
- Input: authorized provider context, including current bio, specialties, verified experience, portfolio facts, language, and length/tone preferences. Source does not specify a body; the adapter resolves profile data.
- Exact result: `{ suggestedBio }`.
- No invented years of experience, qualifications, previous employers, client names, accomplishments, or certifications. The website/user chooses whether to save it.
- `AT-T1`: every factual claim is supported by input; missing experience is not filled with plausible invented details.

### REQ-U: Skill suggestions

- Route: `POST /v1/ai/profile/skills`.
- Input: authorized provider profile and portfolio evidence, existing skills, allowed taxonomy, and specialty context.
- Source result: `{ suggestedSkills: [] }`; canonical additive `evidenceForSkill` or metadata maps each suggested skill to evidence and verification state.
- A recommendation is not proof of competence or automatic certification. Deduplicate, honor taxonomy, and distinguish learning suggestions from evidence-backed skill candidates.
- `AT-U1`: unsupported skills are not advertised as verified; duplicates/unknown taxonomy entries are handled consistently.

### REQ-V: Project health

- Route: `POST /v1/ai/project-health` with input `view: "provider" | "client"`, project/request references, and authorized context.
- Context: correct mapping between client request and active provider project; agreed schedule, milestones, status/history, approved changes, due dates/timezone, delivery records, bounded communication summary, payment state if relevant, and current as-of timestamp. Filter context by view/permission.
- Exact result: `{ confidence, riskLevel, riskLevelKey, healthRating, bullets: [], earlyDays, matchPercentage }`.
- Source examples are `Low`, `LOW`, `Good`, and `earlyDays: 2`; these do not define a full enum or even the sign/meaning of earlyDays. Create a documented metric definition: what deadline comparison it represents, timezone, whether negative values mean late, and unavailable behavior. Until that definition exists, do not invent a value. Define confidence basis and differentiate it from completion likelihood.
- Deterministically calculate observable delays/schedule facts; AI explains risks. Keep display label `riskLevel` and machine key `riskLevelKey` aligned. Reuse the matching definition for `matchPercentage` or document why a project-health compatibility metric differs.
- `AT-V1`: both legacy routes map to the correct project and view; delayed/changed deadlines are calculated from the same clock; all seven result fields are preserved; absent timeline facts remain explicitly unknown.

### REQ-W: Delivery review for client and provider

- Route: `POST /v1/ai/delivery-review`.
- Input: `view`, project/request references, `stageId`; context contains agreed scope, acceptance criteria, correct milestone version, provider submission, accessible file/link evidence, previous relevant review items, and permitted communication. The legacy empty body is resolved by the website adapter.
- Exact result for both views: `{ summary, alignedPoints: [], potentialGaps: [], questionsForReviewer: [] }`.
- Compare evidence against agreement, cite evidence references, and distinguish missing evidence from a proven defect. Do not review other stages or reveal a client's private notes to the provider. Do not accept/reject delivery or release funds.
- `AT-W1`: client route returns evidence-grounded review of the specified stage without business side effects.
- `AT-W2`: provider route is independently mapped/tested, observes its permission-filtered view, and retains the same output schema.

### REQ-X: Dispute summary

- Route: `POST /v1/ai/disputes/summary`.
- Input: dispute ID; admin-authorized context includes client claims, provider claims, contract/milestones, event timeline, submissions, messages, and authorized evidence with source IDs and timestamps.
- Exact source result: `{ summary, clientPerspective, providerPerspective, recommendation }`. Add `agreedFacts`, `disputedFacts`, `missingEvidence`, and citations as documented supplemental data.
- Distinguish allegations from verified events, represent both parties fairly, expose contradictions and evidence gaps. Recommendation is advisory and cannot execute refund/payment/legal decisions. Do not infer motives or treat uploaded instructions as administrator instructions.
- `AT-X1`: only permitted admin context is used; contested facts remain contested; recommendation has supporting evidence and no financial action occurs.

### REQ-Y: Help assistant

- Route: `POST /v1/ai/help/stream`.
- Input: `question`, bounded `history[]`, optional conversation reference; context includes authorized role/locale and relevant service state only where needed. The website's submitted history is conversational data, not trusted system instructions.
- Knowledge must come from approved, versioned Waseet FAQs, policies, payments and escrow documentation using the separate knowledge ingestion route. Retrieve authorized current content, attach source document IDs/versions and relevant links/sections, and answer only to the degree supported.
- Preserve bridge events `help:answer_start`, `help:answer_chunk`, `help:answer_complete`. Source gives no success payload shapes; define the adapter extension explicitly. `help:error` must preserve `{ event: "help:error", message, human_support_fallback: true }` when applicable. Canonical camelCase `humanSupportFallback` maps to the exact source snake_case field.
- No supported policy evidence means an honest limitation and human-support fallback; do not fabricate escrow rules or claim an action was completed. A generation failure and an evidence-insufficiency fallback are distinguishable in canonical metadata even if the legacy UI uses one fallback component.
- `AT-Y1`: answers cite approved sources, stale/unauthorized knowledge is excluded, conflicting/missing policy triggers fallback, and injected instructions inside retrieved material cannot override system policy.

### REQ-Z: Individual business-model audit

- Route: `POST /v1/ai/business-models/audit`.
- Input source fields: `title`, `description`, `category`, `pricing: { amount }`; add `currency` and explicit business-model ID/version/context when auditing an existing record. Source defines an internal operation, not a legacy public endpoint.
- Exact result: `{ isApproved, score, summary, strengths: [], issues: [], recommendations: [] }`.
- `isApproved` is an AI/rubric recommendation, not persisted publication state. Define the completeness/quality rubric and the rule, if any, producing a recommendation boolean. Clearly separate insufficient evidence from factual failure. Include version/evidence metadata.
- `AT-Z1`: score/boolean reconcile with the configured rubric; unsafe/incomplete evidence is surfaced; no publication or record mutation occurs.

### REQ-AA: Bulk business-model re-audit

- Routes: `POST /v1/ai/business-models/re-audit`; `GET /v1/jobs/:jobId`.
- Old request `{}` meant the website could identify eligible records locally. New input must contain an explicit authorized collection of business-model snapshots/references to synchronized approved snapshots, bounded selection criteria/version, and actor scope. The service must not guess the website's eligible records or audit every tenant.
- Return HTTP 202 with `{ success: true, requestId, data: { jobId, status: "QUEUED" }, meta? }`. Job polling states are `QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, `FAILED`, as new service contract choices; any cancellation state requires a documented extension.
- Job result identifies each item/version and includes its audit outcome or failure; counts reconcile to the input snapshot, and retries do not double-count. Use the same core evaluator as REQ-Z. `processed` is a count, not a hard-coded source sample value of zero.
- The old final shape is `{ success: true, data: { processed, results: [{ id, status }] } }`, with example domain status `PUBLISHED`. **Do not set `PUBLISHED` because AI succeeded.** Canonical per-item outcomes carry AI evaluation/job state; website may return its actual domain status only after applying its own publication workflow. Job success means analysis completed, not that website publication completed.
- This is an explicit contract migration: update the website to accept 202/job polling (and optionally a documented completion notification). The adapter may render the old final shape after completion and confirmed website decisions, but must not hold an unbounded HTTP request or claim synchronous compatibility. Publish the migration in the integration README.
- `AT-AA1`: partial failures, retries, counts, scope isolation, and job polling work; 202 migration is tested; no model result prematurely becomes `PUBLISHED`.

### REQ-AB: Text-to-speech avatar assistant

- Route: `POST /v1/ai/avatar/chat`.
- Source input `{ message }`; canonical input may additionally include a bounded conversation reference, locale, approved voice configuration, and authorized relevant provider/project/help context. The source requires text input, a generated text answer, and synthesized speech output. It does not require microphone input, speech recognition, avatar video, or lip synchronization.
- Canonical result: `{ text, audio: { url, mimeType, expiresAt } }` on full success, with short-lived authorized audio access and bounded text/audio duration. Any partial text-only result must be explicitly identified with audio status/error; do not call it full voice success. Text-to-speech capability is required even though optional audio opt-out may be a documented extension.
- Legacy `ai_chat_response` shape is exactly `{ text, audio: "base64-audio-data" }`. Provide a **bounded** backend adapter that retrieves only the service's authorized temporary audio object and encodes it into this shape when old-client compatibility is needed. Declare maximum duration/bytes, supported MIME/codec, expiry behavior, and update path to URL consumption. Never create unbounded base64 payloads or store them in Firestore.
- Source failure shape `{ error: "..." }` does not specify a distinct event name. Explicit adapter decision: emit failure on `ai_chat_response` with that shape until actual website handlers provide another required mapping; label this as a resolved source gap.
- Apply the same grounded help policy when answering questions about Waseet rules. Successful text and TTS must correspond; voice synthesis cannot change the answer's meaning.
- `AT-AB1`: text and audible speech both generated; URL access expires; bounded legacy conversion produces the exact two-field success shape; TTS failure is explicit and does not masquerade as successful audio.

## 6. Socket.IO compatibility adapter obligations

Keep Socket.IO at the website backend and call the AI service using its server credentials and signed/authenticated actor context. Events in AI2 explicitly use namespace `/`; maintain that namespace unless an actual website integration requires a documented migration. A new request must carry or receive correlation information internally even where old payloads omit it. The adapter must be runnable, documented, and exercised against a mock browser client; a sentence asking the website developer to implement conversion is not sufficient delivery.

| Acceptance ID | Browser input | Service operation/event | Exact browser output or documented extension |
|---|---|---|---|
| AT-BRIDGE-01 | `ai:generate_description` `{title,category}` | REQ-A `text.delta`, complete/error | `ai:description_chunk` `{event,chunk}`; `ai:description_complete` `{event}`; `ai:description_error` `{event,message}` |
| AT-BRIDGE-02 | `stream_ai_suggest_text` `{title}` / `stream_ai_enhance_description` `{description}` | REQ-E/F text SSE | Source has no response names. Proposed extension families `ai_text:chunk`, `ai_text:complete`, `ai_text:error` with `{requestId,operation,...}`. Mark as new and reconcile with actual website handlers; do not claim these names appear in the PDFs. |
| AT-BRIDGE-03 | `start_assessment` `{providerSpecialtyId}` | REQ-L and shared I lifecycle | `question_streamed` `{attemptId,question}`; `assessment_ready` `{attemptId,totalQuestions,timeLimitMinutes,generationSource}`; `assessment_error` `{code,message}` |
| AT-BRIDGE-03 | `submit_answer` `{attemptId,submittedAnswers}` | REQ-J JSON result | `evaluation_complete` with full final result; failures `assessment_error` `{code,message}` |
| AT-BRIDGE-04 | `setup_test:init`; `setup_test:answer` `{questionId,answerIndex}` | REQ-M session/answer operations | Exact final `setup_test:result` `{event,score,total,correct,message}`. Proposed missing-source extensions `setup_test:ready`, `setup_test:question`, `setup_test:error`; bind attempt privately to authorized session. |
| AT-BRIDGE-05 | `trigger_ai_audit` `{providerId,projectId}` | REQ-O stage progress/final | `ai_audit_progress` `{event,progress,message}`; `ai_audit_result` `{event,profileAudit,triPartyComparison,finalMetrics:{compatibilityScore},acceptanceOdds}`. Source audit error event absent: document an `ai_audit_error` extension or actual website-required equivalent. |
| AT-BRIDGE-06 | `help:ask` `{question,history}` | REQ-Y start/chunk/complete/error | Exact names `help:answer_start`, `help:answer_chunk`, `help:answer_complete`, `help:error`; last preserves `{event,message,human_support_fallback}`. Define omitted success payload shapes in OpenAPI/adapter docs and include source IDs in completion metadata. |
| AT-BRIDGE-07 | `ai_chat` `{message}` | REQ-AB JSON + bounded audio conversion | `ai_chat_response` `{text,audio:<base64>}`; chosen same-event error `{error}` is a documented source-gap resolution. |

For every bridge test, verify actor isolation, two simultaneous requests, disconnect, failure before first chunk, failure after a partial stream, single terminal state/per-connection terminal event plus replay deduplication, exact casing/nesting, and no credential/answer-key leakage. A stream must not append a new full answer after partial output from a failed upstream attempt; follow the main plan's restart/failure policy explicitly.

## 7. Data contracts that make the AI features possible

These are supporting integration requirements, not additional user-facing website features. They must have schemas, API examples, and fixtures. Their service paths are new and do not claim to exist in either PDF.

### DATA-01: Matching/catalog ingestion

- `POST /v1/data/providers/upsert`
- `POST /v1/data/projects/upsert`
- `POST /v1/data/services/upsert`
- `POST /v1/data/providers/delete`, `POST /v1/data/projects/delete`, `POST /v1/data/services/delete`

Upserts accept authenticated client scope, authorized source entity ID, source version/as-of time, typed minimized content, visibility/eligibility state, taxonomy references, and relevant matching attributes. Project snapshots distinguish open client requests from active awarded projects; services distinguish draft, published, withdrawn, and deleted states according to website definitions. Provider data carries verification state, not just free text claiming skills.

These routes maintain derived representations; they do not create website users/projects/services. Reject stale out-of-order changes, make exact retries idempotent, record source hashes, and recompute embeddings only for semantically relevant changes. Keep embedding model/version/dimensions with records and rebuild indexes under a documented migration when they change. Delete/deactivate must remove records from eligible search immediately and purge derived embeddings/caches under retention policy. Define reconciliation so missed sync events do not keep withdrawn content searchable.

`AT-DATA1`: repeated, out-of-order, deleted, hidden, and cross-tenant records behave correctly; returned recommendation IDs trace to currently eligible source versions; no search request triggers whole-catalog re-embedding.

### DATA-02: Approved knowledge ingestion

- `POST /v1/knowledge/documents/upsert`
- `POST /v1/knowledge/documents/delete`
- `GET /v1/knowledge/documents/:documentId/status`

Input includes document ID/version, title, source URL/reference, locale, policy effective date if applicable, approval/publication state, allowed audience, and approved text or authorized file reference. Chunk with section/page provenance; preserve version and source hashes; keep stale versions unavailable to current policy answers unless explicitly requested and authorized. Knowledge ingestion must not share a permissive catalog-upload route or allow ordinary users to publish platform policy. Scope every retrieval to tenant/audience/current state.

Report ingestion status, extraction errors, indexed version, and retrievable chunks. Empty or unapproved knowledge means the help feature can demonstrate fixtures but cannot be certified as production-grounded. Have a website/operator-owned process for supplying and approving actual Waseet policies.

`AT-DATA2`: approved current policy can be cited; drafts, deleted versions, cross-tenant content and unauthorized-audience chunks cannot be retrieved; exact re-ingestion does not duplicate chunks.

### DATA-03: Evidence and context snapshots

Publish typed context schemas for provider profile, specialty, project/request, proposal, milestone/stage, delivery, accreditation sample, business model, dispute, history aggregate, and evidence reference. Every evidence reference includes entity ownership/scope, source version/hash, media metadata, and the permitted retrieval mechanism. Access failures become explicit evidence gaps. File byte access, extraction, OCR, size/count limits, retention and deletion follow the main plan's upload/evidence pipeline.

Required relationship validation includes project-to-client-request mapping, milestone-to-project, submission-to-stage, specialty-to-provider, sample-to-specialty, proposal-to-provider/project, and dispute-to-contract. A valid UUID does not establish any relationship.

`AT-DATA3`: mismatched relationships are rejected; bodyless legacy endpoints work only after authorized snapshot resolution; missing essential context produces a useful error, not a hallucinated completed analysis.

## 8. Source gaps and decisions register

The build can proceed with fixtures and clearly labeled contract decisions. Production readiness cannot be claimed by silently inventing the missing inputs below. Maintain this register in the delivered repository and resolve it against actual website integration/policy, with the decision owner and validation evidence.

| Decision ID | Gap or ambiguity | Required handling |
|---|---|---|
| DEC-01 | PDFs show example values rather than complete enums | Publish explicit allowed rating/status vocabularies; separate source examples from adopted policy. |
| DEC-02 | Currency absent throughout monetary examples | Require backend currency or documented tenant setting; define minor units and rounding. |
| DEC-03 | Bodyless/ID-only endpoints assume a shared application database | Use typed authorized snapshots or explicit synchronized representations; no implicit DB access. |
| DEC-04 | `aiMatchScoreEstimate` has no source availability context | Define data/scoring basis and unavailable behavior; preserve the field without making up a value. |
| DEC-05 | `acceptanceOdds` is shown as a number without calibration | Label heuristic and expose factors; claim predictive probability only after separate calibration evidence. |
| DEC-06 | `aiRating`, `confidence`, `earlyDays` scales/meaning unspecified | Define each metric independently, with no-data behavior; do not infer from example values. |
| DEC-07 | Eight performance metrics lack formulas; two timeliness names may overlap | Publish metric registry, denominators/windows, data sources, and independent meanings. |
| DEC-08 | Portfolio/accreditation/business audits expose approval-like statuses | Treat model result as advisory; website confirms actual workflow state and publication. |
| DEC-09 | Assessment count, thresholds, timing and retakes unspecified | Adopt explicit versioned product policy, test defaults as fixtures, avoid presenting examples as policy. |
| DEC-10 | Onboarding init response, session ID and intermediate events omitted | Use declared lifecycle/adapter extensions; specify index/score meaning and verify website handlers. |
| DEC-11 | Suggest/enhance stream output event names omitted | Provide documented extension names and configurable/verified adapter mapping. |
| DEC-12 | Help success payloads and audit failure event omitted | Specify explicit bridge shapes/extensions and test the actual consuming frontend. |
| DEC-13 | Avatar codec, payload bounds and error event omitted | Define codec/bounds; signed URL canonical, bounded base64 compatibility; document error mapping. |
| DEC-14 | Bulk source is synchronous; example already says PUBLISHED | Migrate to 202 jobs; expose actual AI outcomes; website publication happens separately. |
| DEC-15 | Accreditation file field names and media policy absent | Define adapter multipart/upload references and bounded ingestion contract. |
| DEC-16 | Marketplace description mentions category but sample omits it | Add optional canonical category with declared taxonomy and strict candidate filtering. |
| DEC-17 | Proposal audit input lacks proposal content | Resolve current proposal snapshot if available; report unavailable third context explicitly. |
| DEC-18 | Final proposal enrichment omitted from earlier A-AB outline | Implement REQ-AC separately and define pending/unavailable behavior without duplicate business submission. |
| DEC-19 | Actual help policies, scoring rubrics and synchronized catalog not supplied | Deliver fixture-backed integration and list exact production data prerequisites; never certify invented policy/data. |
| DEC-20 | New fields and nullability may exceed old UI assumptions | Version canonical contracts, publish adapter mapping and necessary frontend changes; do not promise unsupported drop-in compatibility. |

## 9. Completion evidence

Deliver an OpenAPI specification for every canonical JSON/SSE route, typed request/result/context schemas, a runnable website adapter example, stream event documentation, examples using synthetic data, and a coverage report that marks every one of the 31 source rows against the requirement/acceptance IDs above. Include both client and provider delivery paths, both text streams, REST and socket assessment paths, all eight profile metrics, final proposal enrichment, and bulk migration.

The report must distinguish: implemented and locally tested; integration-tested with the actual website; unavailable because a production policy/data/credential is missing; and explicitly changed contract with migration instructions. Do not label fixture-only behavior as a live integration, generic endpoint scaffolding as an implemented feature, or a model's nonempty response as evidence of correctness.
