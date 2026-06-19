"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getTierColor,
  getTierLabel,
  formatPackage,
  type CutoffWithBranch,
  type PlacementData,
  type StudentFeedback,
} from "@/lib/filtering-engine";
import {
  Info,
  TrendingUp,
  MessageSquare,
  Home,
  Globe,
  Award,
  DollarSign,
  Star,
} from "lucide-react";

// ============================================================================
// Interfaces
// ============================================================================

interface CollegeResult {
  collegeId: number;
  collegeName: string;
  collegeCode: string;
  city: string;
  university: string;
  fees: number;
  hostelFees: number;
  hostelAvailable: boolean;
  tier: "dream" | "target" | "safe";
  lastCutoff: number;
  applicablePercentile: number;
  matchedSeatType: string;
  isHomeUniversity: boolean;
  /** ALL CAP rounds across 3 years — pivoted into matrix in the UI */
  historicalCutoffs: CutoffWithBranch[];
  score: number;
  placementScore: number;
  campusLifeScore: number;
  infrastructureScore: number;
  teachingScore: number;
  industryExposureScore: number;
  placementData: PlacementData | null;
  studentFeedback: StudentFeedback | null;
}

interface CollegeResultsProps {
  dream: CollegeResult[];
  target: CollegeResult[];
  safe: CollegeResult[];
  onCompare: (collegeIds: number[]) => void;
}

// ============================================================================
// CAP Round Matrix — Pivot Helper
// ============================================================================

/**
 * Given a flat list of historical cutoffs (all rounds, all years),
 * build a pivot structure:
 *   Map<year, Map<round, CutoffWithBranch>>
 *
 * This enables rendering a table like:
 *   Year | Round 1 | Round 2 | Round 3
 *   2025 | 98.24   | 97.90   | 97.55
 *   2024 | 97.80   | 97.10   | —
 */
function buildRoundMatrix(
  cutoffs: CutoffWithBranch[]
): { years: number[]; rounds: number[]; matrix: Map<number, Map<number, CutoffWithBranch>> } {
  const matrix = new Map<number, Map<number, CutoffWithBranch>>();

  for (const c of cutoffs) {
    if (!matrix.has(c.year)) matrix.set(c.year, new Map());
    // If multiple branches for same year+round, keep the one closest to the student
    // (first occurrence wins — cutoffs are already sorted year DESC, round ASC)
    if (!matrix.get(c.year)!.has(c.round)) {
      matrix.get(c.year)!.set(c.round, c);
    }
  }

  const years = [...matrix.keys()].sort((a, b) => b - a); // Descending
  const roundsSet = new Set<number>();
  for (const yearMap of matrix.values()) {
    for (const r of yearMap.keys()) roundsSet.add(r);
  }
  const rounds = [...roundsSet].sort(); // Ascending (1, 2, 3)

  return { years, rounds, matrix };
}

// ============================================================================
// Top-Level Results Component
// ============================================================================

export function CollegeResults({ dream, target, safe, onCompare }: CollegeResultsProps) {
  const [selectedForComparison, setSelectedForComparison] = useState<number[]>([]);

  const toggleSelection = (collegeId: number) => {
    setSelectedForComparison((prev) =>
      prev.includes(collegeId)
        ? prev.filter((id) => id !== collegeId)
        : prev.length < 3
        ? [...prev, collegeId]
        : prev
    );
  };

  const renderTierSection = (
    title: string,
    tier: "dream" | "target" | "safe",
    colleges: CollegeResult[]
  ) => {
    if (colleges.length === 0) return null;
    return (
      <div key={tier} className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">{title}</h2>
          <Badge variant="outline">{colleges.length} colleges</Badge>
        </div>
        <div className="grid gap-4">
          {colleges.map((college) => (
            <CollegeCard
              key={college.collegeId}
              college={college}
              isSelected={selectedForComparison.includes(college.collegeId)}
              onSelect={() => toggleSelection(college.collegeId)}
            />
          ))}
        </div>
      </div>
    );
  };

  const totalColleges = dream.length + target.length + safe.length;

  return (
    <div className="space-y-8">
      {/* Summary bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-1">Results Summary</h3>
        <p className="text-blue-800">
          Found <span className="font-bold">{totalColleges}</span> colleges matching your
          profile: <span className="font-bold">{dream.length}</span> Dream,{" "}
          <span className="font-bold">{target.length}</span> Target, and{" "}
          <span className="font-bold">{safe.length}</span> Safe options.
        </p>
      </div>

      {/* Comparison bar */}
      {selectedForComparison.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex justify-between items-center">
          <p className="text-amber-800">
            <span className="font-bold">{selectedForComparison.length}</span> college
            {selectedForComparison.length !== 1 ? "s" : ""} selected for comparison (max 3)
          </p>
          <Button onClick={() => onCompare(selectedForComparison)}>
            Compare Selected
          </Button>
        </div>
      )}

      {renderTierSection("🎯 Dream Colleges", "dream", dream)}
      {renderTierSection("⭐ Target Colleges", "target", target)}
      {renderTierSection("✓ Safe Colleges", "safe", safe)}

      {totalColleges === 0 && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <p className="text-muted-foreground text-base">
              No colleges found matching your criteria.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Try selecting more branches, enabling "All Maharashtra", or adjusting
              your MHT-CET percentile range.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// College Card
// ============================================================================

interface CollegeCardProps {
  college: CollegeResult;
  isSelected: boolean;
  onSelect: () => void;
}

function CollegeCard({ college, isSelected, onSelect }: CollegeCardProps) {
  const [showFullSummary, setShowFullSummary] = useState(false);

  // Pre-compute the round matrix so JSX stays clean
  const { years, rounds, matrix } = useMemo(
    () => buildRoundMatrix(college.historicalCutoffs),
    [college.historicalCutoffs]
  );

  const sentimentMeta = getSentimentMeta(college.studentFeedback?.sentimentScore);
  const hasMatrix = years.length > 0 && rounds.length > 0;

  return (
    <Card
      className={`transition-all ${
        isSelected
          ? "ring-2 ring-blue-500 bg-blue-50/40"
          : "hover:shadow-lg hover:-translate-y-0.5"
      }`}
    >
      {/* ------------------------------------------------------------------ */}
      {/*  HEADER                                                             */}
      {/* ------------------------------------------------------------------ */}
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            {/* Name + badges row */}
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <CardTitle className="text-lg leading-tight">
                {college.collegeName}
              </CardTitle>

              {/* Tier badge */}
              <Badge
                style={{ backgroundColor: getTierColor(college.tier), color: "white" }}
              >
                {getTierLabel(college.tier)}
              </Badge>

              {/* HU / OHU badge */}
              <Badge
                variant="outline"
                className="text-xs shrink-0"
                title={
                  college.isHomeUniversity
                    ? "Eligible for Home University (HU) reserved seats"
                    : "Competing on Outside Home University (OHU) open seats"
                }
              >
                {college.isHomeUniversity ? (
                  <><Home className="w-3 h-3 mr-1 inline" />HU</>
                ) : (
                  <><Globe className="w-3 h-3 mr-1 inline" />OHU</>
                )}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground truncate">
              Code: {college.collegeCode} · {college.city} · {college.university}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seat type:{" "}
              <span className="font-mono text-foreground/70">
                {college.matchedSeatType}
              </span>
            </p>
          </div>

          {/* Match score pill */}
          <div className="text-center shrink-0">
            <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex flex-col items-center justify-center shadow">
              <span className="text-lg font-bold leading-none">
                {college.score.toFixed(0)}
              </span>
              <span className="text-[9px] leading-none opacity-80 mt-0.5">SCORE</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">

        {/* ================================================================ */}
        {/* SECTION 1 — CAP Round Cutoff Matrix                              */}
        {/* ================================================================ */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            CAP Round Cutoff History (Your Category)
          </h4>

          {hasMatrix ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-16">
                      Year
                    </th>
                    {rounds.map((r) => (
                      <th
                        key={r}
                        className="text-right px-3 py-2 font-semibold text-muted-foreground"
                      >
                        Round {r}
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground">
                      Rank (R{Math.max(...rounds)})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((year, yi) => {
                    const yearMap = matrix.get(year)!;
                    const isLatestYear = yi === 0;
                    // Use the final round's cutoff for the gap calculation
                    const finalRound = Math.max(...rounds.filter((r) => yearMap.has(r)));
                    const finalCutoff = yearMap.get(finalRound);
                    const gap = finalCutoff
                      ? college.applicablePercentile - finalCutoff.percentile
                      : null;

                    return (
                      <tr
                        key={year}
                        className={`border-t border-border/40 ${
                          isLatestYear ? "bg-blue-50/50 font-medium" : ""
                        }`}
                      >
                        {/* Year cell */}
                        <td className="px-3 py-2 text-left">
                          <span>{year}</span>
                          {isLatestYear && (
                            <span className="ml-1 text-[9px] uppercase tracking-wide text-blue-600 font-bold">
                              Latest
                            </span>
                          )}
                        </td>

                        {/* Per-round percentile cells */}
                        {rounds.map((r) => {
                          const cutoff = yearMap.get(r);
                          const isLatestCell =
                            isLatestYear && r === Math.max(...rounds);

                          return (
                            <td
                              key={r}
                              className={`px-3 py-2 text-right tabular-nums ${
                                !cutoff ? "text-muted-foreground" : ""
                              }`}
                            >
                              {cutoff ? (
                                <span>
                                  {cutoff.percentile.toFixed(2)}
                                  {isLatestCell && gap !== null && (
                                    <span
                                      className={`ml-1 text-[10px] font-semibold ${
                                        gap >= 0
                                          ? "text-green-600"
                                          : "text-orange-500"
                                      }`}
                                    >
                                      ({gap >= 0 ? "+" : ""}
                                      {gap.toFixed(2)})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Rank cell — last round of this year */}
                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                          {finalCutoff?.cutoffRank != null
                            ? finalCutoff.cutoffRank.toLocaleString("en-IN")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic px-1">
              No CAP cutoff data available for your category and seat type.
            </p>
          )}
        </div>

        {/* ================================================================ */}
        {/* SECTION 2 — Factual Placement Blocks                             */}
        {/* ================================================================ */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-green-600" />
            Placement Data
            {college.placementData && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {college.placementData.isDirectOverride
                  ? "(verified — institution data)"
                  : `(${college.placementData.year} academic year)`}
              </span>
            )}
          </h4>

          {college.placementData ? (
            <div className="grid grid-cols-3 gap-2">
              {/* Average Package */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <DollarSign className="w-4 h-4 text-green-600 mx-auto mb-1 opacity-70" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  Avg Package
                </p>
                <p className="font-bold text-green-700 text-sm leading-tight">
                  {formatPackage(college.placementData.averagePackage)}
                </p>
              </div>

              {/* Highest Package */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <Star className="w-4 h-4 text-emerald-600 mx-auto mb-1 opacity-70" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  Highest
                </p>
                <p className="font-bold text-emerald-700 text-sm leading-tight">
                  {formatPackage(college.placementData.highestPackage)}
                </p>
              </div>

              {/* Placement % */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <Award className="w-4 h-4 text-blue-600 mx-auto mb-1 opacity-70" />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                  Placed %
                </p>
                <p className="font-bold text-blue-700 text-sm leading-tight">
                  {college.placementData.placementPercentage != null
                    ? `${college.placementData.placementPercentage.toFixed(0)}%`
                    : "—"}
                </p>
              </div>
            </div>
          ) : (
            <ScoreBar label="Placement Score (normalized)" value={college.placementScore} />
          )}
        </div>

        {/* ================================================================ */}
        {/* SECTION 3 — Qualitative Scores                                   */}
        {/* ================================================================ */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <ScoreBar label="Campus Life" value={college.campusLifeScore} />
          <ScoreBar label="Infrastructure" value={college.infrastructureScore} />
          <ScoreBar label="Teaching Quality" value={college.teachingScore} />
          <ScoreBar label="Industry Exposure" value={college.industryExposureScore} />
        </div>

        {/* ================================================================ */}
        {/* SECTION 4 — Fees                                                 */}
        {/* ================================================================ */}
        <div className="grid grid-cols-2 gap-4 text-sm border-t border-border/40 pt-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Annual Fees
            </p>
            <p className="font-semibold text-foreground">
              ₹{college.fees.toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
              Hostel Fees
            </p>
            <p className="font-semibold text-foreground">
              {college.hostelAvailable
                ? `₹${college.hostelFees.toLocaleString("en-IN")}`
                : "Not Available"}
            </p>
          </div>
        </div>

        {/* ================================================================ */}
        {/* SECTION 5 — Student Sentiment & Insights Panel                   */}
        {/* ================================================================ */}
        {college.studentFeedback && (
          <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-3">
            {/* Panel header */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-purple-500" />
                Student Sentiment &amp; Insights
              </h4>
              {/* Contextual status indicator badge */}
              <Badge
                variant={sentimentMeta.badgeVariant}
                className={sentimentMeta.badgeClass}
              >
                {sentimentMeta.label}
              </Badge>
            </div>

            {/* Qualitative summary text */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {showFullSummary
                ? college.studentFeedback.summary
                : truncate(college.studentFeedback.summary, 200)}
            </p>
            {college.studentFeedback.summary.length > 200 && (
              <button
                type="button"
                onClick={() => setShowFullSummary((v) => !v)}
                className="text-xs text-blue-600 hover:underline focus:outline-none"
              >
                {showFullSummary ? "Show less ↑" : "Read more ↓"}
              </button>
            )}

            {/* Sentiment score bar with raw value */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Sentiment score</span>
                <span className={`font-semibold ${sentimentMeta.textColor}`}>
                  {Math.round(college.studentFeedback.sentimentScore * 100)}% positive
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${sentimentMeta.barColor}`}
                  style={{
                    width: `${college.studentFeedback.sentimentScore * 100}%`,
                  }}
                />
              </div>
              {/* Contextual status indicator text */}
              <p className="text-[10px] text-muted-foreground">
                {sentimentMeta.description}
              </p>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* ACTIONS                                                           */}
        {/* ================================================================ */}
        <div className="flex gap-2 pt-1 border-t border-border/40">
          <Button
            id={`compare-btn-${college.collegeId}`}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={onSelect}
            className="flex-1"
          >
            {isSelected ? "✓ Selected for Comparison" : "Select for Comparison"}
          </Button>
          <Link href={`/college/${college.collegeId}`}>
            <Button
              id={`details-btn-${college.collegeId}`}
              variant="outline"
              size="sm"
            >
              <Info className="w-4 h-4 mr-1" />
              Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Sentiment Status Indicator
// ============================================================================

interface SentimentMeta {
  label: string;
  description: string;
  textColor: string;
  barColor: string;
  badgeVariant: "default" | "destructive" | "outline" | "secondary";
  badgeClass: string;
}

function getSentimentMeta(score?: number): SentimentMeta {
  if (score === undefined || score === null) {
    return {
      label: "No Data",
      description: "No student reviews have been collected for this college yet.",
      textColor: "text-muted-foreground",
      barColor: "bg-gray-300",
      badgeVariant: "outline",
      badgeClass: "",
    };
  }
  if (score > 0.6) {
    return {
      label: "Positive ✨",
      description: "Students are broadly satisfied with their experience here.",
      textColor: "text-green-600",
      barColor: "bg-green-500",
      badgeVariant: "default",
      badgeClass: "bg-green-600 hover:bg-green-700 text-white border-0",
    };
  }
  if (score < 0.4) {
    return {
      label: "Critical ⚠️",
      description: "Students have raised significant concerns. Review carefully before applying.",
      textColor: "text-red-600",
      barColor: "bg-red-500",
      badgeVariant: "destructive",
      badgeClass: "",
    };
  }
  return {
    label: "Neutral 🔄",
    description: "Mixed opinions — some strong points, some noted concerns.",
    textColor: "text-yellow-600",
    barColor: "bg-yellow-400",
    badgeVariant: "secondary",
    badgeClass: "",
  };
}

// ============================================================================
// Score Bar
// ============================================================================

interface ScoreBarProps {
  label: string;
  value: number;
}

function ScoreBar({ label, value }: ScoreBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-400";

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs font-medium text-foreground/80">{label}</p>
        <p className="text-xs font-semibold tabular-nums">{value.toFixed(0)}/100</p>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Utility
// ============================================================================

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}
