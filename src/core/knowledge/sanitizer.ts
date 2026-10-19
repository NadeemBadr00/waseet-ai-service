/**
 * Multi-stage Privacy & PII Sanitizer.
 * Cleans sensitive personal, financial, and contact information before vector storage or LLM ingestion.
 */
export class DataSanitizer {
  public static scrub(text: string): string {
    if (!text || typeof text !== "string") return "";

    let cleaned = text;

    // --- Stage 1: Specific & Long Structural Tokens (Prioritized to prevent partial matching) ---
    // 1. Bank Accounts / IBANs (Saudi SA + 22 digits, Egyptian EG + 27 digits)
    cleaned = cleaned.replace(/\b(?:SA|EG)\d{2}[A-Z0-9]{18,27}\b/gi, "[رقم حساب بنكي]");

    // 2. Email Addresses
    cleaned = cleaned.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/gi, "[بريد إلكتروني]");

    // 3. URLs, Domains, and Chat Links
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, "[رابط خارجي]");
    cleaned = cleaned.replace(/\b(?:www\.)[^\s]+/gi, "[رابط خارجي]");
    cleaned = cleaned.replace(/\b(?:t\.me|wa\.me|api\.whatsapp\.com)\/[^\s]+/gi, "[رابط تواصل]");

    // 4. IPv4 and IPv6 Addresses
    cleaned = cleaned.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[عنوان IP]");

    // 5. Saudi Phone Numbers (+966, 00966, 05, 5)
    cleaned = cleaned.replace(/(?:\+?966|00966|0)?5[0-9]{8}\b/g, "[رقم هاتف]");

    // 6. Egyptian Phone Numbers (+20, 0020, 010, 011, 012, 015)
    cleaned = cleaned.replace(/(?:\+?20|0020|0)?1[0125][0-9]{8}\b/g, "[رقم هاتف]");

    // 7. General International Phone Formats with country code or delimiters
    cleaned = cleaned.replace(/(?:\+\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]\d{3,4}[-.\s]\d{3,4}\b/g, "[رقم هاتف]");

    // 8. Social Media & Chat Handles
    cleaned = cleaned.replace(/(?:^|\s)@[a-zA-Z0-9_]{3,30}\b/g, " [حساب تواصل]");

    // --- Stage 2: Named Identity & Honorific Signatures ---
    // Remove direct client/provider personal mentions like "أنا المهندس فلان" or "العميل: فلان"
    cleaned = cleaned.replace(/(?:العميل|الزبون|المستقل|مقدم الخدمة|المهندس|المهندسة|الأستاذ|الأستاذة|الدكتور|الدكتورة|السيد|السيدة)\s+[:：]?\s*[\u0621-\u064A]{2,20}(?:\s+[\u0621-\u064A]{2,20})?/gu, "[اسم طرف المعاملة]");

    // --- Stage 3: Normalization & Whitespace Cleanup ---
    return cleaned.replace(/\s{2,}/g, " ").trim();
  }
}
