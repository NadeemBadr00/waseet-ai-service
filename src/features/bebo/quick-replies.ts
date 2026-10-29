const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const replies = {
  intro: {
    egyptian: "أنا بيبو (نديم)، المساعد الذكي في وسيط، بجاوب أسئلتك وبتحرّك بأوامرك.",
    saudi: "أنا بيبو (نديم)، المساعد الذكي في وسيط، أجاوب أسئلتك وأتحرك بأوامرك.",
    gulf: "أنا بيبو (نديم)، المساعد الذكي في وسيط، أجاوب أسئلتك وأتحرك بأوامرك.",
    msa: "أنا بيبو (نديم)، المساعد الذكي في وسيط، أجيب عن أسئلتك وأنفّذ أوامرك.",
    english: "I’m Bebo (Nadeem), your smart Waseet helper for questions and animations.",
  },
  hello: {
    egyptian: "أهلًا بيك! أنا بيبو، أساعدك في إيه؟",
    saudi: "يا هلا! أنا بيبو، وش تحتاج؟",
    gulf: "هلا والله! أنا بيبو، شلون أساعدك؟",
    msa: "مرحبًا! أنا بيبو، كيف أساعدك؟",
    english: "Hi! I’m Bebo. How can I help?",
  },
  thanks: {
    egyptian: "العفو! أنا معاك.",
    saudi: "العفو! حاضر لك.",
    gulf: "العفو! حاضرين لك.",
    msa: "على الرحب والسعة!",
    english: "You’re welcome!",
  },
};

const phrases = {
  intro: [
    "عرفني بنفسك",
    "عرفني بنفسك باختصار",
    "عرّفني بنفسك",
    "انت مين",
    "انت مين يا بيبو",
    "انت مين يا نديم",
    "مين انت",
    "اسمك اي",
    "اسمك ايه",
    "ما اسمك",
    "ايش اسمك",
    "وش اسمك",
    "شو اسمك",
    "شنو اسمك",
    "اهلا اسمك اي",
    "اهلا اسمك ايه",
    "مرحبا اسمك اي",
    "مرحبا اسمك ايه",
    "ازيك اسمك اي",
    "ازيك اسمك ايه",
    "هاي اسمك اي",
    "هاي اسمك ايه",
    "who are you",
    "what is your name",
    "whats your name",
    "introduce yourself",
    "من انت",
  ],
  hello: [
    "اهلا",
    "اهلا بيبو",
    "اهلا نديم",
    "اهلا بك",
    "اهلا بيك",
    "مرحبا",
    "السلام عليكم",
    "سلام عليكم",
    "ازيك",
    "ازيك يا بيبو",
    "ازيك يا نديم",
    "هلا",
    "هلا والله",
    "hello",
    "hi",
    "hi bebo",
    "hey",
  ],
  thanks: ["شكرا", "شكرا ليك", "تسلم", "مشكور", "thank you", "thanks"],
};

export function quickReply(message: string, dialect: string): string | undefined {
  const input = normalize(message);
  for (const [kind, examples] of Object.entries(phrases)) {
    if (examples.some(example => normalize(example) === input)) {
      const translated = replies[kind as keyof typeof replies];
      return translated[dialect as keyof typeof translated] || translated.egyptian;
    }
  }
  if (/^(?:اهلا|مرحبا|ازيك|هلا|هاي|السلام عليكم|سلام عليكم)?\s*(?:اسمك\s*(?:اي|ايه|ايش|شنو)|ما\s*اسمك|وش\s*اسمك|شو\s*اسمك|انت\s*مين|مين\s*انت)$/i.test(input)) {
    const translated = replies.intro;
    return translated[dialect as keyof typeof translated] || translated.egyptian;
  }
  return undefined;
}

export function conciseReply(text: string): string {
  const value = String(text || "").replace(/[*#`]/g, "").replace(/\s+/g, " ").trim();
  const firstSentence = value.match(/^.*?[.!?؟](?=\s|$)/u)?.[0] || value;
  if (firstSentence.length <= 120 && firstSentence.split(/\s+/).length <= 16) return firstSentence;
  let shortened = firstSentence.split(/\s+/).slice(0, 16).join(" ");
  if (shortened.length > 119) shortened = shortened.slice(0, 119).replace(/\s+\S*$/, "");
  return shortened.replace(/[،,;؛:.\s]+$/, "") + "…";
}
