import { PrismaClient, Cutoff } from "@prisma/client";
import { TIER_THRESHOLDS, PRIORITY_WEIGHTS } from "./config";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface StudentProfile {
  mhtcetPercentile: number;
  jeePercentile?: number;
  twelfthPercentage?: number;
  category: string;
  gender: string;
  homeUniversity: string;
  branchPreferences: string[];
  /** When empty or undefined, ALL Maharashtra cities are considered. */
  cityPreferences?: string[];
  priorityWeights: Record<string, number>;
}

/**
 * A Cutoff record enriched with its associated branch name for display.
 */
export interface CutoffWithBranch extends Cutoff {
  branchName: string;
}

/**
 * Latest placement data for a college (most recent year available).
 */
export interface PlacementData {
  year: number;
  averagePackage: number;
  highestPackage: number;
  placementPercentage: number;
}

export interface CollegeWithScores {
  collegeId: number;
  collegeName: string;
  collegeCode: string;
  city: string;
  university: string;
  fees: number;
  hostelFees: number;
  tier: "dream" | "target" | "safe";
  applicablePercentile: number;
  /** Most-recent matched cutoff percentile (convenience field for quick display). */
  lastCutoff: number;
  /** The resolved seat-type code that was matched (e.g., "GOPENH", "LOBCO"). */
  matchedSeatType: string;
  /** Whether this college was matched via Home University (HU) or Outside HU seats. */
  isHomeUniversity: boolean;
  /** Historical cutoffs for the past 3 years for the matched seatType/category. */
  historicalCutoffs: CutoffWithBranch[];
  score: number;
  placementScore: number;
  campusLifeScore: number;
  infrastructureScore: number;
  teachingScore: number;
  industryExposureScore: number;
  hostelAvailable: boolean;
  /** Exact placement numbers from the Placement table (latest year). */
  placementData: PlacementData | null;
}

// ---------------------------------------------------------------------------
// HU / OHU Seat Type Logic
// ---------------------------------------------------------------------------

/**
 * DTE Maharashtra CAP seat type codes follow a suffix convention:
 *
 *   - Codes ending in 'H' → Home University (HU) seats.
 *     e.g., GOPENH, LOBCH, LSCH, LSTH, EWSOPEH
 *
 *   - Codes ending in 'O' → Outside / Other Home University (OHU) seats.
 *     e.g., LOPENO, LOBCO, LSCO, LSTO, EWSOPEO
 *
 *   - Some codes (TFWS, AI) have no HU/OHU split — they are open to all.
 *
 * This function returns a filter predicate for a Cutoff's seatType.
 */
function seatTypeMatchesHU(seatType: string, isHomeUniversity: boolean): boolean {
  const upper = seatType.toUpperCase().trim();

  // Special codes with no HU/OHU distinction — always match regardless of HU status
  const noSplitCodes = ["TFWS", "AI", "MI", "DEF", "EX"];
  if (noSplitCodes.some((code) => upper.startsWith(code))) {
    return true;
  }

  if (isHomeUniversity) {
    // Home University student: match HU seats (end with 'H') OR open-to-all codes
    return upper.endsWith("H");
  } else {
    // Outside HU student: match OHU seats (end with 'O')
    return upper.endsWith("O");
  }
}

/**
 * Given all cutoffs for a college (filtered by category & gender), select the
 * ones that apply to the student based on their HU status, then return the
 * most recent `limit` distinct years' data.
 */
function selectApplicableCutoffs(
  cutoffs: CutoffWithBranch[],
  isHomeUniversity: boolean,
  category: string,
  gender: string,
  limit = 3
): CutoffWithBranch[] {
  // Filter by category and gender
  const matching = cutoffs.filter(
    (c) =>
      c.category.toUpperCase() === category.toUpperCase() &&
      (c.gender.toUpperCase() === gender.toUpperCase() ||
        c.gender.toUpperCase() === "G" || // G = General (gender-agnostic)
        gender.toUpperCase() === "OTHER") &&
      seatTypeMatchesHU(c.seatType, isHomeUniversity)
  );

  // Sort descending by year, then by round (take the final round of each year)
  matching.sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.round - a.round
  );

  // Take the most recent record per year (final round = most authoritative cutoff)
  const seen = new Set<number>();
  const result: CutoffWithBranch[] = [];
  for (const c of matching) {
    if (!seen.has(c.year)) {
      seen.add(c.year);
      result.push(c);
      if (result.length >= limit) break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main Filter Function
// ---------------------------------------------------------------------------

export async function filterColleges(
  profile: StudentProfile,
  prisma: PrismaClient
): Promise<Map<string, CollegeWithScores[]>> {
  // -------------------------------------------------------------------------
  // FIXED: Remove the `university: profile.homeUniversity` filter.
  // Previously this prevented students from seeing colleges outside their
  // university — but CAP admissions cover ALL Maharashtra colleges.
  // HU vs OHU differentiation now happens at the seat-type level below.
  // -------------------------------------------------------------------------
  const colleges = await prisma.college.findMany({
    include: {
      branches: true,
      cutoffs: {
        // Fetch all cutoffs for the past 4 years (we'll filter programmatically)
        where: {
          year: { gte: new Date().getFullYear() - 4 },
        },
        orderBy: [{ year: "desc" }, { round: "desc" }],
      },
      placements: {
        orderBy: { year: "desc" },
        take: 1, // Only need the latest year for display
      },
    },
  });

  const collegesWithScores: CollegeWithScores[] = [];

  for (const college of colleges) {
    // -----------------------------------------------------------------------
    // 1. Branch filter — must have at least one preferred branch
    // -----------------------------------------------------------------------
    const applicableBranches = college.branches.filter((branch) =>
      profile.branchPreferences.some(
        (pref) => pref.toLowerCase() === branch.branchName.toLowerCase()
      )
    );

    if (applicableBranches.length === 0) {
      continue;
    }

    // -----------------------------------------------------------------------
    // 2. City filter — skip only if cityPreferences is non-empty AND no match.
    //    An empty cityPreferences means "All Maharashtra" (no restriction).
    // -----------------------------------------------------------------------
    const hasCityFilter =
      profile.cityPreferences && profile.cityPreferences.length > 0;

    if (
      hasCityFilter &&
      !profile.cityPreferences!.some(
        (city) => city.toLowerCase() === college.city.toLowerCase()
      )
    ) {
      continue;
    }

    // -----------------------------------------------------------------------
    // 3. HU / OHU determination
    //    If the student's homeUniversity matches this college's university,
    //    they are eligible for Home University (HU) seats.
    //    Otherwise they compete on Outside Home University (OHU) seats.
    // -----------------------------------------------------------------------
    const isHomeUniversity =
      college.university.trim().toLowerCase() ===
      profile.homeUniversity.trim().toLowerCase();

    // -----------------------------------------------------------------------
    // 4. Attach branch names to cutoffs for display
    // -----------------------------------------------------------------------
    const branchMap = new Map(college.branches.map((b) => [b.id, b.branchName]));
    const cutoffsWithBranch: CutoffWithBranch[] = college.cutoffs.map((c) => ({
      ...c,
      branchName: branchMap.get(c.branchId) ?? "Unknown Branch",
    }));

    // -----------------------------------------------------------------------
    // 5. Select applicable historical cutoffs (up to 3 most recent years)
    // -----------------------------------------------------------------------
    const historicalCutoffs = selectApplicableCutoffs(
      cutoffsWithBranch,
      isHomeUniversity,
      profile.category,
      profile.gender,
      3
    );

    if (historicalCutoffs.length === 0) {
      // No cutoff data for this category/seatType combination — skip
      continue;
    }

    // The primary (most recent) cutoff drives the tier classification
    const primaryCutoff = historicalCutoffs[0];

    // -----------------------------------------------------------------------
    // 6. Tier classification based on percentile gap
    // -----------------------------------------------------------------------
    const percentileDifference =
      profile.mhtcetPercentile - primaryCutoff.percentile;

    let tier: "dream" | "target" | "safe";

    if (percentileDifference < -TIER_THRESHOLDS.DREAM) {
      continue; // Student is too far below even the dream threshold — skip
    } else if (percentileDifference < -TIER_THRESHOLDS.TARGET) {
      tier = "dream";
    } else if (percentileDifference < TIER_THRESHOLDS.SAFE) {
      tier = "target";
    } else {
      tier = "safe";
    }

    // -----------------------------------------------------------------------
    // 7. Weighted match score
    // -----------------------------------------------------------------------
    const placement = college.placements[0] ?? null;
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
      lastCutoff: primaryCutoff.percentile,
      matchedSeatType: primaryCutoff.seatType,
      isHomeUniversity,
      historicalCutoffs,
      score,
      placementScore: college.placementScore,
      campusLifeScore: college.campusLifeScore,
      infrastructureScore: college.infrastructureScore,
      teachingScore: college.teachingScore,
      industryExposureScore: college.industryExposureScore,
      placementData: placement
        ? {
            year: placement.year,
            averagePackage: placement.averagePackage,
            highestPackage: placement.highestPackage,
            placementPercentage: placement.placementPercentage,
          }
        : null,
    });
  }

  // -------------------------------------------------------------------------
  // 8. Group by tier and sort by score within each tier
  // -------------------------------------------------------------------------
  const groupedByTier = new Map<string, CollegeWithScores[]>();

  for (const tier of ["dream", "target", "safe"] as const) {
    const tierColleges = collegesWithScores
      .filter((c) => c.tier === tier)
      .sort((a, b) => b.score - a.score);
    groupedByTier.set(tier, tierColleges);
  }

  return groupedByTier;
}

// ---------------------------------------------------------------------------
// Scoring Helpers
// ---------------------------------------------------------------------------

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
  // Higher fees = lower desirability score. Normalized to 0-100.
  const maxFees = 500_000; // ₹5,00,000 per year as reference ceiling
  return Math.max(0, Math.round(100 - (fees / maxFees) * 100));
}

// ---------------------------------------------------------------------------
// Display Helpers (used by the results UI)
// ---------------------------------------------------------------------------

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

export function formatPackage(amount: number): string {
  if (amount >= 10_00_000) {
    return `₹${(amount / 10_00_000).toFixed(1)} LPA`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}
