import { z } from "zod";
import { generateValidated, featureError, scoreSchema, textSchema, textListSchema } from "../../core/security/model-output.js";
import type { ProposalSuggestInput, ProposalSuggestOutput, ProposalAuditInput } from "./proposal.types.js";
export class ProposalAuditService {
  public static async suggestProposal(input: ProposalSuggestInput): Promise<ProposalSuggestOutput> {
    const rawTitle = (input.currentTitle ?? "").trim();
    const rawMessage = (input.currentMessage ?? "").trim();
    if (!rawTitle && !rawMessage) {
      throw featureError("AI_NOT_ENOUGH_DATA", "يرجى كتابة مسودة مبدئية لعنوان وتفاصيل العرض أولاً ليقوم الذكاء الاصطناعي بتحسين صياغتها.", 422);
    }
    const cleanLine = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*•▸]\s+/gm, "").replace(/`/g, "").replace(/[ \t]+/g, " ").trim();
    const cleanMultiline = (s: string) => s.split(/\r?\n/).map(cleanLine).join("\n").replace(/\n{3,}/g, "\n\n").trim();

    const data = await generateValidated({
      featureId: "AI-10-PROPOSAL-SUGGEST",
      modelTier: "MEDIUM",
      preferredModel: "gemini-2.5-flash",
      effort: "low",
      attemptTimeoutMs: 20000,
      maxAttempts: 4,
      classification: "PERSONAL",
      prompt: JSON.stringify({
        currentTitle: rawTitle,
        currentMessage: rawMessage,
        project: input.project
          ? {
              title: input.project.title,
              description: input.project.description,
              requirements: input.project.requirements,
              deliveryDays: input.project.deliveryDays,
            }
          : undefined,
      }),
      systemInstruction: [
        "أنت محرر لغوي ومهني متخصص في تحسين صياغة عروض المستقلين على منصة وسيط باللغة العربية الفصحى الواضحة.",
        "مهمتك حصراً هي إعادة صياغة وتحسين النص الذي كتبه مقدم الخدمة بنفسه (currentTitle وcurrentMessage) ليظهر بأسلوب احترافي مقنع ومنظم ومرتبط بمتطلبات المشروع، دون كتابة عرض وهمي نيابةً عنه.",
        "قواعد صارمة:",
        "1. حافظ على الأفكار والالتزامات والمنهجية التي ذكرها مقدم الخدمة في currentTitle وcurrentMessage، ولا تخترع سنوات خبرة أو إحصائيات أو مشاريع سابقة أو تقنيات أو مراحل دفع مالية لم يذكرها.",
        "2. لا تقسّم العرض إلى مراحل مالية أو جدول دفعات مصطنع، ولا تفرض تسعيراً من عندك.",
        "3. اكتب نصاً عربياً صافياً بدون أي رموز Markdown (لا تستخدم ** أو # أو `).",
        "4. أرجع suggestedTitle (تحسين عنوان العرض)، وsuggestedMessage (الصياغة المحسنة لرسالة العرض)، وqualityScore (0-100)، وqualityTag ('Good' أو 'Excellent' أو 'Needs Improvement')، وsuggestedAdvantages (نقاط قوة مستخلصة من نص العرض نفسه فقط).",
      ].join("\n"),
    }, z.object({
      suggestedTitle: textSchema,
      suggestedMessage: textSchema,
      qualityScore: scoreSchema,
      qualityTag: z.enum(["Good", "Excellent", "Needs Improvement"]).catch("Good"),
      suggestedAdvantages: textListSchema.default([]),
    }));

    const min = input.project?.budgetMin ?? null;
    const max = input.project?.budgetMax ?? null;
    return {
      suggestedTitle: cleanLine(data.suggestedTitle),
      suggestedMessage: cleanMultiline(data.suggestedMessage),
      suggestedTotalPrice: null,
      qualityScore: data.qualityScore,
      qualityTag: data.qualityTag,
      suggestedAdvantages: data.suggestedAdvantages.map(cleanLine).filter(Boolean),
      scoreBasis: "PROPOSAL_QUALITY",
      priceAudit: {
        recommendedMin: min,
        recommendedMax: max,
        priceTag: null,
        justification: min !== null || max !== null
          ? "حدود ميزانية المشروع المرسلة، وليست تقدير سعر سوقي أو ضمان ملاءمة."
          : "لم تُرسل ميزانية أو أدلة تسعير كافية.",
      },
    };
  }
  public static async *auditProposalStream(input: ProposalAuditInput) {
    yield { event: "ai_audit_progress", data: { stage: "validation", progress: 20, message: "مراجعة المعلومات المتاحة..." } };
    const data = await generateValidated({ featureId: "AI-11-PROPOSAL-AUDIT", modelTier: "HEAVY", classification: "PERSONAL", prompt: JSON.stringify(input), systemInstruction: "Review this Arabic proposal using only supplied facts. IDs do not prove a profile, expertise, achievements, prices or requirements. Missing context must be stated explicitly. Do not invent acceptance odds or compatibility percentages. Return profileAudit:string[],triPartyComparison:{clientRequirementsFit,providerCapabilityFit,marketPriceAlignment} strings explaining supported or unknown evidence." }, z.object({ profileAudit: textListSchema, triPartyComparison: z.object({ clientRequirementsFit: textSchema, providerCapabilityFit: textSchema, marketPriceAlignment: textSchema }).strict() }).strict());
    yield { event: "ai_audit_result", data: { ...data, finalMetrics: { compatibilityScore: null }, acceptanceOdds: null, basis: "SUPPLIED_CONTEXT_REVIEW" } };
  }
}
