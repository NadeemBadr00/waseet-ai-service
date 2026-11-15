import { FirestoreService } from "../../core/database/firestore.js";
import { normalizedTerms } from "../../core/knowledge/retrieval.js";
import type { MarketplaceRecommendationInput, MarketplaceRecommendationOutput } from "./matching.types.js";

export class MarketplaceService {
  public static async getRecommendations(input: MarketplaceRecommendationInput): Promise<MarketplaceRecommendationOutput> {
    const query = [...new Set(normalizedTerms(input.query ?? ""))];
    const candidates = input.candidates ?? await FirestoreService.searchCatalog("services", service => service["isPublished"] === true);
    const ranked = candidates
      .filter(item => item.isPublished !== false && (!input.category || item.category === input.category))
      .map(item => {
        const terms = new Set(normalizedTerms(`${String(item.title ?? "")} ${String(item.description ?? "")} ${String(item.category ?? "")} ${String((item as Record<string, unknown>).subSpecialty ?? "")} ${String((item as Record<string, unknown>).categoryLabel ?? "")}`));
        const termMatches = query.filter(term => terms.has(term)).length;
        const subSpecialtyBonus = input.subSpecialty && (item as Record<string, unknown>).subSpecialty === input.subSpecialty ? 2 : 0;
        const score = query.length > 0 ? termMatches + subSpecialtyBonus : 1 + subSpecialtyBonus;
        // a measured overlap only: no floor, no ceiling, no constant. Nothing to measure (no query) = null, never an invented percentage.
        const matchScore = query.length > 0 ? Math.round((termMatches / query.length) * 100) : null;
        const reason = termMatches > 0
          ? "تطابق مباشر مع كلمات البحث والتخصص المطلوب"
          : "خدمة مرشحة ضمن التصنيف المختار";
        return { item, score, matchScore, reason };
      })
      .filter(entry => (query.length > 0 ? entry.score > 0 : true))
      .sort((first, second) => second.score - first.score);

    const ids = new Set<string>();
    const selected = ranked
      .slice(0, Math.min(50, input.limit))
      .filter(({ item }) => {
        const id = String(item.id ?? "");
        if (!id || ids.has(id)) return false;
        ids.add(id);
        return true;
      });

    const items = selected.map(({ item, matchScore, reason }) => ({
      id: String(item.id),
      title: String(item.title),
      generationSource: "DETERMINISTIC",
      matchScore,
      scoreBasis: matchScore === null ? ("NONE" as const) : ("QUERY_TERM_OVERLAP" as const),
      reason,
    }));

    const recommendations = selected.map(({ item, matchScore, reason }) => ({
      id: String(item.id),
      title: String(item.title),
      matchScore,
      scoreBasis: matchScore === null ? ("NONE" as const) : ("QUERY_TERM_OVERLAP" as const),
      reason,
      generationSource: "DETERMINISTIC",
    }));

    return {
      items,
      recommendations,
      bannerInsight: items.length > 0
        ? `تم ترشيح ${items.length} خدمات مطابقة لمعايير البحث والتصنيف.`
        : "لا توجد خدمات مطابقة لعبارة البحث الحالية.",
      smartSearchTags: query.slice(0, 5),
    };
  }
}
