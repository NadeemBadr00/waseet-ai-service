import type { InferenceRequest } from "../../src/router/types.js";
export async function domainModel(req: InferenceRequest): Promise<string> {
  const input = (() => { try { return JSON.parse(req.prompt); } catch { return {}; } })();
  const id = req.featureId;
  if (id.includes("PROJECT-DESCRIPTION") || id.includes("TEXT-SUGGEST-STREAM") || id.includes("DESC-ENHANCE")) return "مسودة وصف تحافظ على الحقائق الواردة وتتطلب مراجعة المستخدم.";
  if (id.includes("REQUEST-DRAFT")) return JSON.stringify({ suggestedTitle: "طلب واضح", suggestedDescription: "وصف يحدد المخرجات المطلوبة للمراجعة.", suggestedSubSpecialties: ["تصميم"], suggestedDurationDays: 14, complexityRating: "Medium", personalizedNote: "حدد معايير القبول." });
  if (id.includes("TITLE-CHECK")) return JSON.stringify({ isMeaningful: input.title !== "asdf", isAligned: input.title !== "asdf", reasonAr: "مراجعة معنى العنوان." });
  if (id.includes("MILESTONE")) return JSON.stringify({ milestones: [{ title: "تحليل", description: "توثيق المتطلبات", days: 2, percentage: 33 }, { title: "تنفيذ", description: "تنفيذ النطاق", days: 5, percentage: 33 }, { title: "تسليم", description: "مراجعة معايير القبول", days: 3, percentage: 34 }] });
  if (id.includes("PROJECT-ANALYSIS")) return JSON.stringify({ clarityScore: 75, executiveSummary: "مراجعة النص المرسل.", strengths: ["تحديد عنوان"], gapsAndRisks: ["معايير القبول غير واضحة"], recommendedImprovements: ["حدد المخرجات"], suggestedPricingStrategy: "اطلب عروضًا وفق النطاق المتفق عليه." });
  if (id.includes("ASSESSMENT-GENERATE")) return JSON.stringify({ questions: Array.from({length: input.questionCount}, (_, index) => ({ id: input.startIndex + index, textAr: "سؤال تخصص " + input.specialtyName + " رقم " + (input.startIndex + index) + " عن الممارسة المناسبة؟", topic: input.specialtyName, options: ["a","b","c","d"].map(letter => ({ id: letter, text: "اختيار " + letter })), correctOptionId: "a" })) });
  if (id.includes("PROPOSAL-SUGGEST")) return JSON.stringify({ suggestedTitle: "عرض محدد", suggestedMessage: "أقترح تنفيذ المخرجات بعد تأكيد النطاق.", qualityScore: 75, qualityTag: "Good", suggestedAdvantages: ["تأكيد معايير القبول"] });
  if (id.includes("PROPOSAL-AUDIT")) return JSON.stringify({ profileAudit: ["لم يرسل ملف مستقل موثق."], triPartyComparison: { clientRequirementsFit: "يلزم نطاق مشروع موثق.", providerCapabilityFit: "يلزم ملف مهارات موثق.", marketPriceAlignment: "لا توجد أدلة تسعير سوقي." } });
  if (id.includes("PROPOSAL-ENRICHMENT")) return JSON.stringify({ qualityScore: 70, aiQualityTag: "Strong", aiFeedback: { summary: "مراجعة وضوح نص العرض." } });
  if (id.includes("PROJECT-FIT")) return JSON.stringify({ matchSummary: "مراجعة النطاق المرسل فقط.", winningStrategy: ["توثيق معايير القبول"], riskAssessment: "يلزم تأكيد المدة." });
  if (id.includes("BIO-SUGGEST")) return JSON.stringify({ suggestedBio: "متخصص في " + (input.specialties?.join("، ") || input.jobTitle || "مجالي المهني") + (input.yearsOfExperience ? " بخبرة " + input.yearsOfExperience + " سنوات." : ".") });
  if (id.includes("SKILLS-SUGGEST")) return JSON.stringify({ suggestedSkills: ["TypeScript", "اختبار البرمجيات"] });
  if (id.includes("PORTFOLIO-REVIEW")) return JSON.stringify({ summary: "مراجعة وصف " + input.samples.map((sample: any) => sample.title).join("، "), strengths: [], warnings: ["المحتوى غير المختبر لا يثبت جودة التشغيل."], corrections: ["أضف أدلة موثقة."] });
  if (id.includes("ACCREDITATION-REVIEW")) return JSON.stringify({ feedbackAr: "مراجعة قراءة جزئية تحتاج اعتمادًا بشريًا.", findings: input.evidence.filter((item: any) => item.excerpt).slice(0,1).map((item: any) => ({ source: item.source, quote: item.excerpt.slice(0, 20), observation: "ورد النص المقتبس." })), recommendations: ["مراجعة بشرية"] });
  if (id.includes("PROJECT-HEALTH")) return JSON.stringify({ riskLevel: "Low", healthRating: "Good", bullets: ["تقييم البيانات المرسلة فقط."] });
  if (id.includes("DELIVERY")) return JSON.stringify({ summary: "مراجعة استشارية للنص، لا تثبت تشغيلًا.", met: input.criteria.filter((item: string) => input.note.includes(item)).map((requirement: string) => ({ requirement, evidence: requirement, source: "delivery-note" })), potentialGaps: [], questionsForReviewer: ["هل راجع صاحب الصلاحية المحتوى؟"] });
  if (id.includes("DISPUTE")) return JSON.stringify({ summary: "أقوال الطرفين تحتاج مراجعة الأدلة.", clientPerspective: input.clientClaim, providerPerspective: input.providerClaim, recommendation: "اجمع الاتفاق والأدلة للمراجع البشري." });
  if (id.includes("BUSINESS-MODEL")) return JSON.stringify({ score: 65, summary: "مراجعة اكتمال النص فقط.", strengths: ["عرض واضح"], issues: ["التسعير يحتاج أدلة"], recommendations: ["توثيق المخرجات"] });
  if (id.includes("HELP-GENERAL")) return JSON.stringify({ answer: "يمكننا صياغة مسودة تحدد النطاق والمخرجات المقترحة للمراجعة." });
  if (id.includes("HELP-ASSISTANT")) { const doc = input.documents[0]; return JSON.stringify({ answer: doc.content.slice(0, 100), citations: [{ documentId: doc.documentId, quote: doc.content.slice(0, 100) }] }); }
  if (id.includes("AVATAR")) return "مساعدة عامة.";
  throw new Error("UNMOCKED_FEATURE: " + id);
}
