import { PrismaClient } from "@prisma/client";
import { TIER_THRESHOLDS, PRIORITY_WEIGHTS } from "./config";

interface StudentProfile {
  mhtcetPercentile: number;
  jeePercentile?: number;
  category: string;
  gender: string;
  homeUniversity: string;
  branchPreferences: string[];
  cityPreferences?: string[];
  priorityWeights: Record<string, number>;
}

interface CollegeWithScores {
  collegeId: number;
  collegeName: string;
  collegeCode: string;
  city: string;
  university: string;
  fees: number;
  hostelFees: number;
  tier: "dream" | "target" | "safe";
  applicablePercentile: number;
  lastCutoff: number;
  score: number;
  placementScore: number;
  campusLifeScore: number;
  infrastructureScore: number;
  teachingScore: number;
}

export async function filterColleges(
  profile: StudentProfile,
  prisma: PrismaClient
): Promise<Map<string, CollegeWithScores[]>> {
  // Fetch all colleges
  const colleges = await prisma.college.findMany({
    where: {
      university: profile.homeUniversity,
    },
    include: {
      branches: true,
      cutoffs: {
        where: {
          category: profile.category,
          gender: profile.gender,
        },
        orderBy: {
          year: "desc",
        },
      },
      placements: {
        orderBy: {
          year: "desc",
        },
        take: 1,
      },
    },
  });

  const collegesWithScores: CollegeWithScores[] = [];

  for (const college of colleges) {
    // Check if college has applicable branches
    const applicableBranches = college.branches.filter((branch) =>
      profile.branchPreferences.some(
        (pref) =>
          pref.toLowerCase() === branch.branchName.toLowerCase()
      )
    );

    if (applicableBranches.length === 0) {
      continue;
    }

    // Check if city preference is met (if specified)
    if (
      profile.cityPreferences &&
      profile.cityPreferences.length > 0 &&
      !profile.cityPreferences.some(
        (city) => city.toLowerCase() === college.city.toLowerCase()
      )
    ) {
      continue;
    }

    // Get applicable cutoff for this college
    const applicableCutoff = college.cutoffs[0];
    if (!applicableCutoff) {
      continue;
    }

    // Determine tier
    const percentileDifference =
      profile.mhtcetPercentile - applicableCutoff.percentile;
    let tier: "dream" | "target" | "safe";

    if (percentileDifference < -TIER_THRESHOLDS.DREAM) {
      continue; // Below dream tier, skip
    } else if (percentileDifference < -TIER_THRESHOLDS.TARGET) {
      tier = "dream";
    } else if (percentileDifference < -TIER_THRESHOLDS.SAFE) {
      tier = "target";
    } else {
      tier = "safe";
    }

    // Calculate weighted score
    const score = calculateWeightedScore(
      {
        placement: college.placementScore,
        campusLife: college.campusLifeScore,
        infrastructure: college.infrastructureScore,
        teaching: college.teachingScore,
        hostel: college.hostelAvailable ? 80 : 20,
        fees: normalizeFees(college.fees),
        location: profile.cityPreferences?.includes(college.city) ? 100 : 50,
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
      tier,
      applicablePercentile: profile.mhtcetPercentile,
      lastCutoff: applicableCutoff.percentile,
      score,
      placementScore: college.placementScore,
      campusLifeScore: college.campusLifeScore,
      infrastructureScore: college.infrastructureScore,
      teachingScore: college.teachingScore,
    });
  }

  // Group by tier and sort by score within each tier
  const groupedByTier = new Map<string, CollegeWithScores[]>();
  const tiers = ["dream", "target", "safe"];

  for (const tier of tiers) {
    const tierColleges = collegesWithScores
      .filter((c) => c.tier === tier)
      .sort((a, b) => b.score - a.score);
    groupedByTier.set(tier, tierColleges);
  }

  return groupedByTier;
}

function calculateWeightedScore(
  metrics: Record<string, number>,
  weights: Record<string, number>
): number {
  let totalScore = 0;
  let totalWeight = 0;

  for (const [metric, value] of Object.entries(metrics)) {
    const weight = weights[metric] || 1;
    totalScore += value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

function normalizeFees(fees: number): number {
  // Higher fees = lower score
  // Normalize to 0-100 scale
  const maxFees = 500000; // 5 lakhs
  return Math.max(0, 100 - (fees / maxFees) * 100);
}

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
