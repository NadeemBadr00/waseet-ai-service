import type { HelpChatInput } from './help.types.js';

/** Platform rules need approved evidence; ordinary questions can use model knowledge. */
export function resolveHelpMode(question: string, requested?: HelpChatInput['mode']): 'policy' | 'general' {
  const value = question.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا').trim();
  const platformContext = /وسيط|\b(?:waseet|waaseet|platform)\b|المنص[ةه]|حسابي|حسابنا|\bmy account\b/i.test(value);
  const generalTopic = /رسوم(?:ات)?\s+(?:ال)?(?:متحرك[ةه]|بياني[ةه])|ضمان\s+الجود[ةه]|\b(?:quality assurance|animation|animated cartoons|charts?|graphs?)\b/i.test(value);
  if (requested !== 'policy' && generalTopic && !platformContext) return 'general';
  const policy = /رسوم|عمول[ةه]|عمولات|سياس[ةه]|سياسات|ضمان|سحب|دفع|مدفوعات|استرداد|استرجاع|نزاع|صلاحيات|صلاحي[ةه]|افراج|تحكيم|\b(?:fees?|commissions?|refunds?|withdraw(?:al|als|ing)?|polic(?:y|ies)|escrow|disputes?|payments?|payouts?|permissions?)\b/i.test(value);
  return policy ? 'policy' : requested ?? 'general';
}
