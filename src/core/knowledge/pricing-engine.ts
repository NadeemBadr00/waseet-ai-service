export interface PricingInputProject {
  projectId: string;
  category: string;
  budgetAmount: number;
  durationDays: number;
  currency: string;
  rating: number;
}

export interface StatisticalPricingResult {
  hasMarketData: boolean;
  sampleSize: number;
  currency: string;
  recommendedMinBudget: number | null;
  recommendedMaxBudget: number | null;
  medianBudget: number | null;
  suggestedDurationDays: number | null;
  estimationBasis: "STATISTICAL_MARKET_BENCHMARK" | "INSUFFICIENT_MARKET_DATA";
}

/**
 * Independent Statistical Pricing Engine.
 * Separates statistical budget calculation from pure semantic similarity,
 * preventing skewed estimates caused by superficial text matches.
 */
export class StatisticalPricingEngine {
  public static calculate(
    projects: PricingInputProject[],
    targetCurrency = "SAR",
    minSampleSize = 3
  ): StatisticalPricingResult {
    // Filter projects matching currency and valid budgets
    const validProjects = projects.filter(
      p => p.budgetAmount > 0 && (!targetCurrency || p.currency === targetCurrency)
    );

    if (validProjects.length < minSampleSize) {
      return {
        hasMarketData: false,
        sampleSize: validProjects.length,
        currency: targetCurrency,
        recommendedMinBudget: null,
        recommendedMaxBudget: null,
        medianBudget: null,
        suggestedDurationDays: null,
        estimationBasis: "INSUFFICIENT_MARKET_DATA",
      };
    }

    // Extract and sort budgets
    const budgets = validProjects.map(p => p.budgetAmount).sort((a, b) => a - b);

    // Calculate quartiles & filter outliers via IQR (Interquartile Range)
    const q1 = this.percentile(budgets, 0.25);
    const median = this.percentile(budgets, 0.50);
    const q3 = this.percentile(budgets, 0.75);
    const iqr = q3 - q1;

    const lowerBound = Math.max(0, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;

    // Filter outliers on paired project records so budget outliers do not skew duration estimates
    const inlierProjects = validProjects.filter(p => p.budgetAmount >= lowerBound && p.budgetAmount <= upperBound);
    const inlierBudgets = inlierProjects.map(p => p.budgetAmount).sort((a, b) => a - b);
    const rawDurations = (inlierProjects.length > 0 ? inlierProjects : validProjects)
      .map(p => p.durationDays)
      .filter(d => d > 0)
      .sort((a, b) => a - b);

    let inlierDurations = rawDurations;
    if (rawDurations.length >= 4) {
      const durQ1 = this.percentile(rawDurations, 0.25);
      const durQ3 = this.percentile(rawDurations, 0.75);
      const durIqr = durQ3 - durQ1;
      const durLower = Math.max(1, durQ1 - 1.5 * durIqr);
      const durUpper = durQ3 + 1.5 * durIqr;
      const filteredDurations = rawDurations.filter(d => d >= durLower && d <= durUpper);
      if (filteredDurations.length > 0) inlierDurations = filteredDurations;
    }

    const finalMin = inlierBudgets.length > 0 ? Math.round(this.percentile(inlierBudgets, 0.25)) : Math.round(q1);
    const finalMax = inlierBudgets.length > 0 ? Math.round(this.percentile(inlierBudgets, 0.75)) : Math.round(q3);
    const finalMedian = inlierBudgets.length > 0 ? Math.round(this.percentile(inlierBudgets, 0.50)) : Math.round(median);
    const finalDuration = inlierDurations.length > 0 ? Math.round(this.percentile(inlierDurations, 0.50)) : null;

    return {
      hasMarketData: true,
      sampleSize: inlierBudgets.length,
      currency: targetCurrency,
      recommendedMinBudget: finalMin,
      recommendedMaxBudget: finalMax,
      medianBudget: finalMedian,
      suggestedDurationDays: finalDuration,
      estimationBasis: "STATISTICAL_MARKET_BENCHMARK",
    };
  }

  private static percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;

    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sorted[lower]!;
    return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
  }
}
