import { z } from "zod";
import { generateValidated, scoreSchema, textSchema, textListSchema } from "../../core/security/model-output.js";
import type { ProposalSuggestInput, ProposalSuggestOutput, ProposalAuditInput } from "./proposal.types.js";

const structuredAuditItemSchema = z
  .object({
    title: textSchema,
    subtitle: textSchema,
    status: z.enum(["EXCELLENT", "GOOD", "WARNING"]),
    badge: textSchema,
  })
  .strict();

export class ProposalAuditService {
  public static async suggestProposal(input: ProposalSuggestInput): Promise<ProposalSuggestOutput> {
    const cleanLine = (s: string) =>
      s
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^\s*[-*•▸]\s+/gm, "")
        .replace(/`/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const targetDays = Math.max(1, Math.round(input.project?.deliveryDays ?? 7));
    const maxSteps = Math.min(4, targetDays);
    const stepSchema = z.object({ name: textSchema, desc: textSchema }).strict();

    const data = await generateValidated(
      {
        featureId: "AI-10-PROPOSAL-SUGGEST",
        modelTier: "MEDIUM",
        classification: "PERSONAL",
        prompt: JSON.stringify({ ...input, targetDeliveryDays: targetDays, maxMilestones: maxSteps }),
        systemInstruction: `You are an expert Arabic proposal assistant on Waseet AI. Using the supplied currentTitle, optional currentMessage, and project details (title, description, requirements, deliveryDays=${targetDays}), write a cohesive Arabic proposal where the proposal text (introParagraph, executionSteps, closingParagraph), deliverables (suggestedOutputs), and execution milestones (executionSteps, between ${Math.min(2, maxSteps)} and ${maxSteps} steps) are 100% aligned. Always populate introParagraph, executionSteps, closingParagraph, and suggestedOutputs. Plain Arabic text only, no Markdown symbols (** or #), no invented years of experience or fake stats.`,
      },
      z
        .object({
          suggestedTitle: textSchema,
          suggestedMessage: textSchema.optional(),
          introParagraph: textSchema.optional(),
          executionSteps: z.array(stepSchema).min(1).max(6).optional(),
          closingParagraph: textSchema.optional(),
          suggestedOutputs: textSchema.optional(),
          qualityScore: scoreSchema,
          qualityTag: z.enum(["Good", "Excellent", "Needs Improvement"]),
          suggestedAdvantages: textListSchema,
        })
        .strict()
    );

    const steps = (data.executionSteps ?? []).slice(0, maxSteps);
    const n = steps.length;
    const baseDays = n > 0 ? Math.floor(targetDays / n) : targetDays;
    let remDays = n > 0 ? targetDays - baseDays * n : 0;
    const basePct = n > 0 ? Math.floor(100 / n) : 100;
    let remPct = n > 0 ? 100 - basePct * n : 0;

    const suggestedMilestones = steps.map(st => {
      const d = baseDays + (remDays > 0 ? 1 : 0);
      if (remDays > 0) remDays--;
      const p = basePct + (remPct > 0 ? 5 : 0);
      if (remPct >= 5) remPct -= 5;
      return {
        name: cleanLine(st.name).replace(/^[1-9]\.\s*/, ""),
        desc: cleanLine(st.desc),
        days: Math.max(1, d),
        pct: p,
      };
    });

    const pctSum = suggestedMilestones.reduce((acc, m) => acc + m.pct, 0);
    if (suggestedMilestones.length > 0 && pctSum !== 100) {
      suggestedMilestones[0]!.pct += 100 - pctSum;
    }

    const stepsBlock = suggestedMilestones
      .map((m, idx) => `${idx + 1}. ${m.name} (${m.days} ${m.days === 1 ? "يوم" : "أيام"}): ${m.desc}`)
      .join("\n");

    const assembledMessage =
      n > 0 && data.introParagraph && data.closingParagraph
        ? `تحية طيبة وبعد،\n\n${cleanLine(data.introParagraph)}\n\nنقترح عليكم خطة عمل مقسمة على ${n} مراحل بإجمالي مدة تنفيذ (${targetDays} أيام) تغطي كافة الجوانب المطلوبة:\n\n${stepsBlock}\n\n${cleanLine(data.closingParagraph)}`
        : cleanLine(
            data.suggestedMessage ??
              data.introParagraph ??
              "أقترح تنفيذ المخرجات المطلوبة وفق النطاق المتفق عليه."
          );

    const min = input.project?.budgetMin ?? null;
    const max = input.project?.budgetMax ?? null;
    const suggestedTotalPrice =
      min !== null && max !== null ? Math.round((min + max) / 2) : (min ?? max ?? null);

    return {
      suggestedTitle: cleanLine(data.suggestedTitle),
      suggestedMessage: assembledMessage,
      ...(data.suggestedOutputs ? { suggestedOutputs: cleanLine(data.suggestedOutputs) } : {}),
      suggestedTotalPrice,
      ...(suggestedMilestones.length ? { suggestedMilestones } : {}),
      qualityScore: data.qualityScore,
      qualityTag: data.qualityTag,
      suggestedAdvantages: data.suggestedAdvantages.map(cleanLine),
      scoreBasis: "PROPOSAL_QUALITY",
      priceAudit: {
        recommendedMin: min,
        recommendedMax: max,
        priceTag: null,
        justification:
          min !== null || max !== null
            ? "حدود ميزانية المشروع المرسلة، وليست تقدير سعر سوقي أو ضمان ملاءمة."
            : "لم تُرسل ميزانية أو أدلة تسعير كافية.",
      },
    };
  }

  public static async *auditProposalStream(input: ProposalAuditInput) {
    yield {
      event: "ai_audit_progress",
      data: {
        stage: "validation",
        status: "IN_PROGRESS",
        progress: 20,
        message: "مراجعة المعلومات المتاحة...",
      },
    };

    const data = await generateValidated(
      {
        featureId: "AI-11-PROPOSAL-AUDIT",
        modelTier: "HEAVY",
        classification: "PERSONAL",
        prompt: JSON.stringify(input),
        systemInstruction:
          "Review this Arabic proposal using only supplied facts. IDs do not prove a profile, expertise, achievements, prices or requirements. Missing context must be stated explicitly. Do not invent acceptance odds or compatibility percentages. Return profileAuditItems[{title,subtitle,status(EXCELLENT|GOOD|WARNING),badge}] (or profileAudit:string[]), clientRequirementsFit, providerCapabilityFit, marketPriceAlignment, triPartyNote, and qualityScore (0..100 evaluating proposal text clarity and milestone structure only).",
      },
      z
        .object({
          profileAudit: z.array(z.union([textSchema, structuredAuditItemSchema])).min(1).max(8).optional(),
          profileAuditItems: z.array(structuredAuditItemSchema).min(1).max(6).optional(),
          triPartyComparison: z
            .object({
              clientRequirementsFit: textSchema,
              providerCapabilityFit: textSchema,
              marketPriceAlignment: textSchema,
            })
            .strict()
            .optional(),
          clientRequirementsFit: textSchema.optional(),
          providerCapabilityFit: textSchema.optional(),
          marketPriceAlignment: textSchema.optional(),
          triPartyNote: textSchema.optional(),
          qualityScore: scoreSchema.nullable().optional(),
        })
        .strict()
    );

    const clientRequirementsFit =
      data.clientRequirementsFit ??
      data.triPartyComparison?.clientRequirementsFit ??
      "يلزم نطاق مشروع موثق.";
    const providerCapabilityFit =
      data.providerCapabilityFit ??
      data.triPartyComparison?.providerCapabilityFit ??
      "يلزم ملف مهارات موثق.";
    const marketPriceAlignment =
      data.marketPriceAlignment ??
      data.triPartyComparison?.marketPriceAlignment ??
      "لا توجد أدلة تسعير سوقي.";

    const draftPrice = input.proposalDraft?.price ? `${input.proposalDraft.price} ر.س` : "غير محدد";
    const draftDuration = input.proposalDraft?.durationDays ? `${input.proposalDraft.durationDays} يوم` : "غير محدد";
    const draftMilestones = input.proposalDraft?.milestonesCount ? `${input.proposalDraft.milestonesCount} مراحل` : "غير محدد";

    yield {
      event: "ai_audit_result",
      data: {
        profileAudit: data.profileAuditItems ?? data.profileAudit ?? [],
        triPartyComparison: {
          clientRequirementsFit,
          providerCapabilityFit,
          marketPriceAlignment,
          client: {
            budget: input.projectContext?.budget ?? "حسب ميزانية الطلب",
            duration: input.projectContext?.duration ?? "حسب مدة الطلب",
            milestones: input.projectContext?.milestones ?? "حسب مراحل الطلب",
          },
          provider: {
            budget: draftPrice,
            duration: draftDuration,
            milestones: draftMilestones,
          },
          aiRecommendation: {
            budget: marketPriceAlignment,
            duration: clientRequirementsFit,
            milestones: providerCapabilityFit,
          },
        },
        triPartyNote: data.triPartyNote ?? clientRequirementsFit,
        finalMetrics: {
          overallScore: data.qualityScore ?? null,
          compatibilityScore: null,
        },
        acceptanceOdds: null,
        basis: "SUPPLIED_CONTEXT_REVIEW",
      },
    };
  }
}
