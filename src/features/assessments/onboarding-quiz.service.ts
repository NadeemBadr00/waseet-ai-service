import { randomUUID } from "node:crypto";
import { DurableStore } from "../../core/database/durable-store.js";
import { getTenantContext } from "../../core/auth/tenant-context.js";
import { featureError } from "../../core/security/model-output.js";
export interface OnboardingAnswerInput { questionId: string; answerIndex: number }
interface Attempt { attemptId: string; userId: string; answers: Record<string, number>; status: "IN_PROGRESS" | "COMPLETED"; expiresAt: string; result?: OnboardingQuizResult }
export interface OnboardingQuizResult { score: number | null; total: number; correct: number | null; message: string; status: "IN_PROGRESS" | "COMPLETED"; answeredCount: number }
const questions = [
  {
    id: "q_onboard_1",
    textAr: "ما الإجراء الأساسي لحماية حسابك على المنصة؟",
    options: [
      "اعتماد كلمة مرور قوية وفريدة وعدم مشاركتها",
      "مشاركة بيانات الدخول مع الزملاء لتسريع العمل",
      "استخدام كلمة مرور موحدة وسهلة التذكر دائماً",
    ],
  },
  {
    id: "q_onboard_2",
    textAr: "كيف توثق معيار قبول التسليم قبل بدء التنفيذ؟",
    options: [
      "الاكتفاء بوصف عام شفهي وتأجيل التفاصيل لاحقاً",
      "تحديد مخرجات واضحة ومحددة قابلة للفحص والمراجعة",
      "البدء بالتنفيذ فوراً دون الحاجة لتوثيق المعايير",
    ],
  },
  {
    id: "q_onboard_3",
    textAr: "ما التعامل المهني الأنسب عند حدوث خلاف حول التسليم؟",
    options: [
      "تجميع الاتفاق والأدلة الموثقة وطلب مراجعة مختصة",
      "حذف سجل المحادثات والملفات لإغلاق النقاش سريعاً",
      "نشر تفاصيل المعاملة وبيانات الطرف الآخر علنياً",
    ],
  },
  {
    id: "q_onboard_4",
    textAr: "ما الوسيلة الصحيحة لتوثيق الاتفاقات والتعديلات؟",
    options: [
      "الاعتماد على المكالمات الشفهية الخارجية غير المسجلة",
      "استخدام رسائل مؤقتة تختفي تلقائياً بعد قراءتها",
      "توثيق جميع البنود في سجل مكتوب قابل للمراجعة",
    ],
  },
  {
    id: "q_onboard_5",
    textAr: "كيف تُقسّم مراحل المشروع المالي والتنفيذي بوضوح؟",
    options: [
      "ربط كل مرحلة بمخرجات محددة ومعايير قبول واضحة",
      "تقسيم الدفعات بنسب عشوائية دون تحديد أي مخرجات",
      "دمج جميع المتطلبات دون جدول زمني أو نطاق متفق",
    ],
  },
];
const correctKey: Record<string, number> = { q_onboard_1: 0, q_onboard_2: 1, q_onboard_3: 0, q_onboard_4: 2, q_onboard_5: 0 };
export class OnboardingQuizService {
  private static owned(id: string, userId?: string): Attempt {
    const owner = userId ?? getTenantContext()?.actor.userId;
    if (!owner || owner === "service-reader") throw featureError("ACTOR_REQUIRED", "A real user is required.", 403);
    const attempt = DurableStore.get<Attempt>("onboarding", id);
    if (!attempt || attempt.userId !== owner) throw featureError("NOT_FOUND", "Quiz not found.", 404);
    if (attempt.status !== "COMPLETED" && Date.parse(attempt.expiresAt) <= Date.now()) throw featureError("QUIZ_EXPIRED", "Quiz has expired.", 410);
    return attempt;
  }
  public static async initQuiz(userId: string) {
    const actor = getTenantContext()?.actor;
    if (!userId || userId === "system-user" || userId === "service-reader" || actor && actor.userId !== userId) throw featureError("ACTOR_REQUIRED", "A matching real user is required.", 403);
    const attemptId = "onboard-" + randomUUID(), expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    DurableStore.put<Attempt>("onboarding", attemptId, { attemptId, userId, answers: {}, status: "IN_PROGRESS", expiresAt });
    return { attemptId, totalQuestions: questions.length, questions, expiresAt, basis: "GENERAL_SAFETY_GUIDANCE_NOT_PLATFORM_POLICY" };
  }
  public static async recordAnswer(attemptId: string, input: OnboardingAnswerInput, userId?: string) {
    return DurableStore.transaction(() => {
      const attempt = this.owned(attemptId, userId), question = questions.find(item => item.id === input.questionId);
      if (!question || !Number.isInteger(input.answerIndex) || input.answerIndex < 0 || input.answerIndex >= question.options.length) throw featureError("INVALID_ANSWER", "Unknown question or answer index.", 400);
      if (attempt.status === "COMPLETED") {
        if (attempt.answers[input.questionId] !== input.answerIndex) throw featureError("QUIZ_FINALIZED", "Quiz is finalized.", 409);
      } else { attempt.answers[input.questionId] = input.answerIndex; DurableStore.put("onboarding", attemptId, attempt); }
      const answeredCount = Object.keys(attempt.answers).length;
      return { recorded: true, answeredCount, isCompleted: answeredCount === questions.length };
    });
  }
  public static async getResult(attemptId: string, userId?: string): Promise<OnboardingQuizResult> {
    return DurableStore.transaction(() => {
      const attempt = this.owned(attemptId, userId); if (attempt.result) return attempt.result;
      const answeredCount = Object.keys(attempt.answers).length;
      if (answeredCount < questions.length) return { score: null, correct: null, total: questions.length, answeredCount, status: "IN_PROGRESS", message: "أكمل الأسئلة قبل حساب النتيجة." };
      const correct = Object.entries(attempt.answers).filter(([id, index]) => correctKey[id] === index).length;
      const result: OnboardingQuizResult = { score: Math.round(correct / questions.length * 100), total: questions.length, correct, answeredCount, status: "COMPLETED", message: correct >= 4 ? "أكملت اختبار الإعداد بنجاح." : "راجع إرشادات الأمان وتوثيق العمل." };
      attempt.status = "COMPLETED"; attempt.result = result; DurableStore.put("onboarding", attemptId, attempt); return result;
    });
  }
}
