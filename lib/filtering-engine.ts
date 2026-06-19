import { PrismaClient, Cutoff } from "@prisma/client";
import { TIER_THRESHOLDS, PRIORITY_WEIGHTS } from "./config";

// ============================================================================
// Interfaces
// ============================================================================

export interface StudentProfile {
  mhtcetPercentile: number;
  jeePercentile?: number;
  /** HSC / 12th board percentage. Used for eligibility gate check. */
  twelfthPercentage?: number;
  category: string;
  gender: string;
  homeUniversity: string;
  branchPreferences: string[];
  /** Empty array or undefined → All Maharashtra (no city restriction). */
  cityPreferences?: string[];
  priorityWeights: Record<string, number>;
}

/**
 * Cutoff record enriched with its branch name for display.
 */
export interface CutoffWithBranch extends Cutoff {
  branchName: string;
}

/**
 * Verified placement data for display in the results UI.
 * Sourced from: College.averagePackage/highestPackage (manual override)
 * with Placement table as fallback.
 */
export interface PlacementData {
  /** Year of the data point (from Placement table). Null if override used. */
  year: number | null;
  averagePackage: number;
  highestPackage: number;
  placementPercentage: number | null;
  /** True when sourced from College.averagePackage override fields. */
  isDirectOverride: boolean;
}

export interface StudentFeedback {
  summary: string;
  sentimentScore: number;
}

export interface CollegeWithScores {
  collegeId: number;
  collegeName: string;
  collegeCode: string;
  city: string;
  university: string;
  fees: number;
  hostelFees: number;
  hostelAvailable: boolean;
  tier: "dream" | "target" | "safe";
  /** Student's percentile for reference. */
  applicablePercentile: number;
  /** Percentile of the final-round most-recent-year cutoff used for tiering. */
  lastCutoff: number;
  /** CAP seat type code resolved for this student (e.g., "GOPENH", "GOPENS"). */
  matchedSeatType: string;
  /** True = Home University seats. False = OHU seats. Null = State/Special. */
  isHomeUniversity: boolean;
  /**
   * ALL matching cutoffs across all 3 CAP rounds for the past 3 years,
   * ordered by year DESC, round ASC.
   * The UI pivots this into a Year × Round matrix table.
   */
  historicalCutoffs: CutoffWithBranch[];
  /** Weighted match score (0–100). */
  score: number;
  placementScore: number;
  campusLifeScore: number;
  infrastructureScore: number;
  teachingScore: number;
  industryExposureScore: number;
  /** Factual package numbers (override or Placement table). */
  placementData: PlacementData | null;
  /** AI-generated qualitative summary from CollegeSummary table. */
  studentFeedback: StudentFeedback | null;
}

// ============================================================================
// Board Eligibility Gate
// ============================================================================

/**
 * Maharashtra CET Cell mandates minimum HSC (12th) board percentages
 * for CAP round eligibility. This is a hard gate — below these thresholds
 * the student is ineligible regardless of MHT-CET score.
 *
 *   - General / OPEN category  : ≥ 45.0%
 *   - All reserved categories  : ≥ 40.0%
 *
 * Returns true if the student passes the eligibility check.
 * If twelfthPercentage is not provided (undefined), we cannot verify
 * eligibility and conservatively allow the result (soft pass).
 */
function passesEligibilityGate(
  twelfthPercentage: number | undefined,
  category: string
): boolean {
  if (twelfthPercentage === undefined || twelfthPercentage === null) {
    // Soft pass: no percentage provided — eligibility cannot be verified.
    return true;
  }

  const openCategories = new Set(["general", "open", "gen", "gopenh", "gopeno", "gopens"]);
  const isOpenCategory = openCategories.has(category.toLowerCase().trim());

  const threshold = isOpenCategory ? 45.0 : 40.0;
  return twelfthPercentage >= threshold;
}

// ============================================================================
// HU / OHU / State Seat Type Logic
// ============================================================================

/**
 * DTE Maharashtra seat type code suffix conventions:
 *
 *   'H' → Home University seats     (e.g., GOPENH, LOBCH, LSCH, LSTH, EWSOPEH)
 *   'O' → Outside / Other HU seats  (e.g., GOPENO, LOBCO, LSCO, LSTO, EWSOPEO)
 *   'S' → State-level autonomous    (e.g., GOPENS — no HU distinction required)
 *
 *   No suffix → Special schemes open to all (TFWS, AI, MI, DEF, EX)
 *
 * Matching strategy for a given student:
 *   HU student   → match 'H' suffix first, then fall back to 'S' (State)
 *   OHU student  → match 'O' suffix first, then fall back to 'S' (State)
 *   Either       → always match no-split special codes (TFWS, AI, etc.)
 *
 * @param seatType       The CAP seat type code from the Cutoff record.
 * @param isHomeUniversity True if the student's homeUniversity matches the college.
 */
function seatTypeMatches(seatType: string, isHomeUniversity: boolean): boolean {
  const upper = seatType.toUpperCase().trim();

  // Special codes that have no HU/OHU split — always accessible
  const specialPrefixes = ["TFWS", "AI", "MI", "DEF", "EX", "PWDOPEN", "PWD"];
  if (specialPrefixes.some((pfx) => upper.startsWith(pfx))) {
    return true;
  }

  // State-level seats (suffix 'S') are accessible to ALL students
  if (upper.endsWith("S")) {
    return true;
  }

  if (isHomeUniversity) {
    // HU student: prefer Home University suffix ('H')
    return upper.endsWith("H");
  } else {
    // OHU student: prefer Outside Home University suffix ('O')
    return upper.endsWith("O");
  }
}

// ============================================================================
// Historical Cutoff Selection
// ============================================================================

/**
 * From the full set of cutoffs for a college, select all records that
 * match the student's category, gender, and HU/OHU seat type eligibility,
 * across the past `yearLimit` distinct academic years.
 *
 * Returns ALL matching rows across all CAP rounds for those years,
 * ordered by year DESC, round ASC — enabling the UI to build a
 * Year × Round 1 / Round 2 / Round 3 pivot matrix.
 */
function selectAllApplicableCutoffs(
  cutoffs: CutoffWithBranch[],
  isHomeUniversity: boolean,
  category: string,
  gender: string,
  yearLimit = 3
): CutoffWithBranch[] {
  // Step 1: Filter by category, gender, and seat type eligibility
  const matching = cutoffs.filter(
    (c) =>
      c.category.toUpperCase() === category.toUpperCase() &&
      (c.gender.toUpperCase() === gender.toUpperCase() ||
        c.gender.toUpperCase() === "G" ||
        gender.toUpperCase() === "OTHER") &&
      seatTypeMatches(c.seatType, isHomeUniversity)
  );

  if (matching.length === 0) return [];

  // Step 2: Identify the most recent `yearLimit` distinct years with data
  const distinctYears = [...new Set(matching.map((c) => c.year))]
    .sort((a, b) => b - a)  // Descending
    .slice(0, yearLimit);

  // Step 3: Return ALL rounds for those years, sorted year DESC, round ASC
  return matching
    .filter((c) => distinctYears.includes(c.year))
    .sort((a, b) =>
      a.year !== b.year ? b.year - a.year : a.round - b.round
    );
}

/**
 * From the full multi-round historical set, extract the single most
 * authoritative cutoff for tier classification: the FINAL round of
 * the most recent year.
 *
 * The final round (e.g., Round 3) represents the true closing cutoff
 * after all seat adjustments — using it prevents over-optimistic tiering
 * based on early-round (artificially high) cutoffs.
 */
function selectTierCutoff(
  historicalCutoffs: CutoffWithBranch[]
): CutoffWithBranch | null {
  if (historicalCutoffs.length === 0) return null;

  // historicalCutoffs is already sorted year DESC, round ASC
  const mostRecentYear = historicalCutoffs[0].year;
  const currentYearRows = historicalCutoffs.filter((c) => c.year === mostRecentYear);

  // Take the highest round number (final / closing round)
  return currentYearRows.reduce((best, c) =>
    c.round > best.round ? c : best
  );
}

// ============================================================================
// Main Filter Function
// ============================================================================

export async function filterColleges(
  profile: StudentProfile,
  prisma: PrismaClient
): Promise<Map<string, CollegeWithScores[]>> {
  /**
   * ARCHITECTURE NOTE:
   * All factual metrics (cutoffs, packages, placement %) flow exclusively
   * through this PostgreSQL-driven function. No LLM calls are made here.
   * The LLM is confined to the /api/ai-summary route for qualitative text.
   */
  const colleges = await prisma.college.findMany({
    // NO university filter — fetch all Maharashtra colleges.
    // HU vs OHU differentiation is enforced per-cutoff below.
    include: {
      branches: true,
      cutoffs: {
        // Fetch 4 years to guarantee 3 complete years after filtering
        where: { year: { gte: new Date().getFullYear() - 4 } },
        orderBy: [{ year: "desc" }, { round: "asc" }],
      },
      placements: {
        orderBy: { year: "desc" },
        take: 1,
      },
      // Pull the AI-generated CollegeSummary for student feedback display
      summaries: {
        take: 1,
        select: {
          summary: true,
          sentimentScore: true,
        },
      },
    },
  });

  const collegesWithScores: CollegeWithScores[] = [];

  for (const college of colleges) {
    // -------------------------------------------------------------------------
    // Gate 1 — 12th Board Eligibility (DTE mandate)
    // -------------------------------------------------------------------------
    if (!passesEligibilityGate(profile.twelfthPercentage, profile.category)) {
      // Student does not meet the minimum HSC percentage for any college.
      // Return an empty map immediately — no point iterating further.
      return new Map([
        ["dream", []],
        ["target", []],
        ["safe", []],
      ]);
    }

    // -------------------------------------------------------------------------
    // Gate 2 — Branch preference match
    // -------------------------------------------------------------------------
    const hasMatchingBranch = college.branches.some((branch) =>
      profile.branchPreferences.some(
        (pref) => pref.toLowerCase() === branch.branchName.toLowerCase()
      )
    );
    if (!hasMatchingBranch) continue;

    // -------------------------------------------------------------------------
    // Gate 3 — City preference (empty = All Maharashtra, no restriction)
    // -------------------------------------------------------------------------
    const hasCityFilter = profile.cityPreferences && profile.cityPreferences.length > 0;
    if (
      hasCityFilter &&
      !profile.cityPreferences!.some(
        (city) => city.toLowerCase() === college.city.toLowerCase()
      )
    ) {
      continue;
    }

    // -------------------------------------------------------------------------
    // Resolve HU / OHU status for this college
    // -------------------------------------------------------------------------
    const isHomeUniversity =
      college.university.trim().toLowerCase() ===
      profile.homeUniversity.trim().toLowerCase();

    // -------------------------------------------------------------------------
    // Enrich cutoffs with branch names
    // -------------------------------------------------------------------------
    const branchMap = new Map(college.branches.map((b) => [b.id, b.branchName]));
    const cutoffsWithBranch: CutoffWithBranch[] = college.cutoffs.map((c) => ({
      ...c,
      branchName: branchMap.get(c.branchId) ?? "Unknown Branch",
    }));

    // -------------------------------------------------------------------------
    // Select all applicable cutoffs across all CAP rounds (last 3 years)
    // -------------------------------------------------------------------------
    const historicalCutoffs = selectAllApplicableCutoffs(
      cutoffsWithBranch,
      isHomeUniversity,
      profile.category,
      profile.gender,
      3
    );

    if (historicalCutoffs.length === 0) continue; // No cutoff data for this profile

    // -------------------------------------------------------------------------
    // Tier classification — use final round of most recent year
    // -------------------------------------------------------------------------
    const tierCutoff = selectTierCutoff(historicalCutoffs);
    if (!tierCutoff) continue;

    const percentileDifference = profile.mhtcetPercentile - tierCutoff.percentile;

    let tier: "dream" | "target" | "safe";
    if (percentileDifference < -TIER_THRESHOLDS.DREAM) {
      continue; // Too far below even the dream threshold
    } else if (percentileDifference < -TIER_THRESHOLDS.TARGET) {
      tier = "dream";
    } else if (percentileDifference < TIER_THRESHOLDS.SAFE) {
      tier = "target";
    } else {
      tier = "safe";
    }

    // -------------------------------------------------------------------------
    // Placement data — College-level override takes precedence over table
    // -------------------------------------------------------------------------
    let placementData: PlacementData | null = null;

    if (college.averagePackage != null && college.highestPackage != null) {
      // Manual verified override fields on the College model
      placementData = {
        year: null,
        averagePackage: college.averagePackage,
        highestPackage: college.highestPackage,
        placementPercentage: null,
        isDirectOverride: true,
      };
    } else if (college.placements.length > 0) {
      const p = college.placements[0];
      placementData = {
        year: p.year,
        averagePackage: p.averagePackage,
        highestPackage: p.highestPackage,
        placementPercentage: p.placementPercentage,
        isDirectOverride: false,
      };
    }

    // -------------------------------------------------------------------------
    // WSM Score — computed strictly inside tier boundary
    // -------------------------------------------------------------------------
    const score = calculateWeightedScore(
      {
        placement: college.placementScore,
        campusLife: college.campusLifeScore,
        infrastructure: college.infrastructureScore,
        teaching: college.teachingScore,
        hostel: college.hostelAvailable ? 80 : 20,
        fees: normalizeFees(college.fees),
        location:
          !hasCityFilter || profile.cityPreferences!.includes(college.city)
            ? 100
            : 50,
        industryExposure: college.industryExposureScore,
      },
      profile.priorityWeights
    );

    // -------------------------------------------------------------------------
    // Student feedback from CollegeSummary
    // -------------------------------------------------------------------------
    const summaryRecord = college.summaries[0] ?? null;
    const studentFeedback: StudentFeedback | null = summaryRecord
      ? {
          summary: summaryRecord.summary,
          sentimentScore: summaryRecord.sentimentScore,
        }
      : null;

    collegesWithScores.push({
      collegeId: college.id,
      collegeName: college.collegeName,
      collegeCode: college.collegeCode,
      city: college.city,
      university: college.university,
      fees: college.fees,
      hostelFees: college.hostelFees,
      hostelAvailable: college.hostelAvailable,
      tier,
      applicablePercentile: profile.mhtcetPercentile,
      lastCutoff: tierCutoff.percentile,
      matchedSeatType: tierCutoff.seatType,
      isHomeUniversity,
      historicalCutoffs,
      score,
      placementScore: college.placementScore,
      campusLifeScore: college.campusLifeScore,
      infrastructureScore: college.infrastructureScore,
      teachingScore: college.teachingScore,
      industryExposureScore: college.industryExposureScore,
      placementData,
      studentFeedback,
    });
  }

  // ============================================================================
  // Group by tier, sort by WSM score within each tier
  // ============================================================================
  const groupedByTier = new Map<string, CollegeWithScores[]>();
  for (const tier of ["dream", "target", "safe"] as const) {
    groupedByTier.set(
      tier,
      collegesWithScores
        .filter((c) => c.tier === tier)
        .sort((a, b) => b.score - a.score)
    );
  }
  return groupedByTier;
}

// ============================================================================
// Scoring Helpers
// ============================================================================

function calculateWeightedScore(
  metrics: Record<string, number>,
  weights: Record<string, number>
): number {
  let totalScore = 0;
  let totalWeight = 0;
  for (const [metric, value] of Object.entries(metrics)) {
    const weight = weights[metric] ?? 1;
    totalScore += value * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : 0;
}

function normalizeFees(fees: number): number {
  const maxFees = 500_000; // ₹5 L ceiling
  return Math.max(0, Math.round(100 - (fees / maxFees) * 100));
}

// ============================================================================
// Display Helpers (imported by UI components)
// ============================================================================

export function getTierColor(tier: string): string {
  const colors: Record<string, string> = {
    dream: "#8b5cf6",
    target: "#3b82f6",
    safe: "#10b981",
  };
  return colors[tier] || "#6b7280";
}

export function getTierLabel(tier: string): string {
  const labels: Record<string, string> = {
    dream: "Dream",
    target: "Target",
    safe: "Safe",
  };
  return labels[tier] || "Unknown";
}

/**
 * Format a numeric salary/package value in Indian Rupee notation.
 *   ≥ 10,00,000  →  ₹X.X LPA
 *   < 10,00,000  →  ₹X,XX,XXX
 */
export function formatPackage(amount: number): string {
  if (amount >= 10_00_000) {
    return `₹${(amount / 10_00_000).toFixed(2)} LPA`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
