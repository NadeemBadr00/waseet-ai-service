import { FirestoreService } from "../../core/database/firestore.js";
import { normalizedTerms } from "../../core/knowledge/retrieval.js";
import type { MarketplaceRecommendationInput, MarketplaceRecommendationOutput } from "./matching.types.js";

export class MarketplaceService {
  public static async getRecommendations(input: MarketplaceRecommendationInput): Promise<MarketplaceRecommendationOutput> {
    const query = [...new Set(normalizedTerms(input.query))];
    const candidates = input.candidates ?? await FirestoreService.searchCatalog("services", service => service["isPublished"] === true);
    const ranked = candidates.filter(item => item.isPublished !== false && (!input.category || item.category === input.category)).map(item => {
      const terms = new Set(normalizedTerms(`${String(item.title ?? "")} ${String(item.description ?? "")} ${String(item.category ?? "")}`));
      return { item, score: query.filter(term => terms.has(term)).length };
    }).filter(item => item.score > 0).sort((first, second) => second.score - first.score);
    const ids = new Set<string>();
    return { items: ranked.slice(0, Math.min(50, input.limit)).filter(({ item }) => { const id = String(item.id ?? ""); if (!id || ids.has(id)) return false; ids.add(id); return true; }).map(({ item }) => ({ id: String(item.id), title: String(item.title), generationSource: "DETERMINISTIC" })) };
  }
}
