const normalize = (text: string) => text.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const replies = {
  intro: {
    egyptian: 'أنا بيبو، بجاوب أسئلتك وبتحرّك بأوامرك.',
    saudi: 'أنا بيبو، أجاوب أسئلتك وأتحرك بأوامرك.',
    gulf: 'أنا بيبو، أجاوب أسئلتك وأتحرك بأوامرك.',
    msa: 'أنا بيبو، أجيب عن أسئلتك وأنفّذ أوامر الحركة.',
    english: 'I’m Bebo, your little helper for questions and animations.',
  },
  hello: {
    egyptian: 'أهلًا بيك! أنا بيبو، أساعدك في إيه؟',
    saudi: 'يا هلا! أنا بيبو، وش تحتاج؟',
    gulf: 'هلا والله! أنا بيبو، شلون أساعدك؟',
    msa: 'مرحبًا! أنا بيبو، كيف أساعدك؟',
    english: 'Hi! I’m Bebo. How can I help?',
  },
  thanks: {
    egyptian: 'العفو! أنا معاك.',
    saudi: 'العفو! حاضر لك.',
    gulf: 'العفو! حاضرين لك.',
    msa: 'على الرحب والسعة!',
    english: 'You’re welcome!',
  },
};

// Exact short requests only: a greeting inside a real question must still reach the model.
const phrases = {
  intro: ['عرفني بنفسك', 'عرفني بنفسك باختصار', 'عرّفني بنفسك', 'انت مين', 'انت مين يا بيبو', 'مين انت', 'who are you', 'introduce yourself', 'من انت'],
  hello: ['اهلا', 'اهلا بيبو', 'مرحبا', 'ازيك', 'ازيك يا بيبو', 'هلا', 'هلا والله', 'hello', 'hi', 'hi bebo', 'hey'],
  thanks: ['شكرا', 'شكرا ليك', 'تسلم', 'مشكور', 'thank you', 'thanks'],
};

export function quickReply(message: string, dialect: string): string | undefined {
  const input = normalize(message);
  for (const [kind, examples] of Object.entries(phrases)) {
    if (examples.some(example => normalize(example) === input)) {
      const translated = replies[kind as keyof typeof replies];
      return translated[dialect as keyof typeof translated] || translated.egyptian;
    }
  }
  return undefined;
}

export function conciseReply(text: string): string {
  const value = String(text || '').replace(/[*#`]/g, '').replace(/\s+/g, ' ').trim();
  const firstSentence = value.match(/^.*?[.!?؟](?=\s|$)/u)?.[0] || value;
  if (firstSentence.length <= 120 && firstSentence.split(/\s+/).length <= 16) return firstSentence;
  let shortened = firstSentence.split(/\s+/).slice(0, 16).join(' ');
  if (shortened.length > 119) shortened = shortened.slice(0, 119).replace(/\s+\S*$/, '');
  return shortened.replace(/[،,;؛:.\s]+$/, '') + '…';
}
