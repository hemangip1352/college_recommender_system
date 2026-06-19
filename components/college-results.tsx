"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getTierColor,
  getTierLabel,
  formatPackage,
  type CutoffWithBranch,
  type PlacementData,
} from "@/lib/filtering-engine";
import {
  ExternalLink,
  Info,
  TrendingUp,
  MessageSquare,
  Home,
  Globe,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface StudentFeedback {
  summary: string;
  sentimentScore: number; // 0–1: > 0.6 positive, < 0.4 negative, else neutral
}

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
  historicalCutoffs: CutoffWithBranch[];
  score: number;
  placementScore: number;
  campusLifeScore: number;
  infrastructureScore: number;
  teachingScore: number;
  industryExposureScore: number;
  placementData: PlacementData | null;
  studentFeedback?: StudentFeedback;
}

interface CollegeResultsProps {
  dream: CollegeResult[];
  target: CollegeResult[];
  safe: CollegeResult[];
  onCompare: (collegeIds: number[]) => void;
}

// ---------------------------------------------------------------------------
// Top-level Results Component
// ---------------------------------------------------------------------------

export function CollegeResults({
  dream,
  target,
  safe,
  onCompare,
}: CollegeResultsProps) {
  const [selectedForComparison, setSelectedForComparison] = useState<number[]>(
    []
  );

  const toggleSelection = (collegeId: number) => {
    if (selectedForComparison.includes(collegeId)) {
      setSelectedForComparison(
        selectedForComparison.filter((id) => id !== collegeId)
      );
    } else if (selectedForComparison.length < 3) {
      setSelectedForComparison([...selectedForComparison, collegeId]);
    }
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
        <h3 className="font-semibold text-blue-900 mb-1">Summary</h3>
        <p className="text-blue-800">
          Found <span className="font-bold">{totalColleges}</span> colleges
          matching your profile:{" "}
          <span className="font-bold">{dream.length}</span> Dream,{" "}
          <span className="font-bold">{target.length}</span> Target, and{" "}
          <span className="font-bold">{safe.length}</span> Safe options.
        </p>
      </div>

      {/* Comparison action bar */}
      {selectedForComparison.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex justify-between items-center">
          <p className="text-amber-800">
            <span className="font-bold">{selectedForComparison.length}</span>{" "}
            college
            {selectedForComparison.length !== 1 ? "s" : ""} selected for
            comparison (max 3)
          </p>
          <Button
            onClick={() => onCompare(selectedForComparison)}
            variant="default"
          >
            Compare Selected
          </Button>
        </div>
      )}

      {renderTierSection("🎯 Dream Colleges", "dream", dream)}
      {renderTierSection("⭐ Target Colleges", "target", target)}
      {renderTierSection("✓ Safe Colleges", "safe", safe)}

      {totalColleges === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              No colleges found matching your criteria. Try adjusting your
              preferences or selecting more branches.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// College Card
// ---------------------------------------------------------------------------

interface CollegeCardProps {
  college: CollegeResult;
  isSelected: boolean;
  onSelect: () => void;
}

function CollegeCard({ college, isSelected, onSelect }: CollegeCardProps) {
  const [showFullSummary, setShowFullSummary] = useState(false);

  const sentimentBadge = getSentimentBadge(
    college.studentFeedback?.sentimentScore
  );

  return (
    <Card
      className={`transition-all ${
        isSelected
          ? "ring-2 ring-blue-500 bg-blue-50"
          : "hover:shadow-lg hover:-translate-y-0.5"
      }`}
    >
      <CardHeader>
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            {/* College name + tier badge */}
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <CardTitle className="text-lg">{college.collegeName}</CardTitle>
              <Badge
                style={{
                  backgroundColor: getTierColor(college.tier),
                  color: "white",
                }}
              >
                {getTierLabel(college.tier)}
              </Badge>
              {/* HU / OHU badge */}
              <Badge
                variant="outline"
                className="text-xs"
                title={
                  college.isHomeUniversity
                    ? "You are eligible for Home University seats at this college"
                    : "You compete on Outside Home University (OHU) seats at this college"
                }
              >
                {college.isHomeUniversity ? (
                  <><Home className="w-3 h-3 mr-1" />HU Seats</>
                ) : (
                  <><Globe className="w-3 h-3 mr-1" />OHU Seats</>
                )}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Code: {college.collegeCode} | {college.city} |{" "}
              {college.university}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seat type: <span className="font-mono">{college.matchedSeatType}</span>
            </p>
          </div>

          {/* Match score */}
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-blue-600">
              {college.score.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">Match Score</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ----------------------------------------------------------------
            Section 1 — Cutoff History Table (3 years)
        ---------------------------------------------------------------- */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Cutoff History (Your Category)
          </h4>

          {college.historicalCutoffs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted text-muted-foreground text-xs">
                    <th className="text-left px-3 py-2 font-medium rounded-tl-md">
                      Year
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Branch</th>
                    <th className="text-right px-3 py-2 font-medium">
                      Percentile
                    </th>
                    <th className="text-right px-3 py-2 font-medium rounded-tr-md">
                      Rank
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {college.historicalCutoffs.map((cutoff, idx) => {
                    const isCurrentYear = idx === 0;
                    const gap =
                      college.applicablePercentile - cutoff.percentile;
                    const gapColor =
                      gap >= 0 ? "text-green-600" : "text-orange-600";

                    return (
                      <tr
                        key={`${cutoff.year}-${cutoff.round}-${cutoff.id}`}
                        className={`border-t border-border/50 ${
                          isCurrentYear ? "bg-blue-50/50 font-medium" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          {cutoff.year}
                          {isCurrentYear && (
                            <span className="ml-1 text-[10px] text-blue-600 font-semibold">
                              LATEST
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {cutoff.branchName}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span>{cutoff.percentile.toFixed(2)}</span>
                          {isCurrentYear && (
                            <span className={`ml-2 text-xs ${gapColor}`}>
                              ({gap >= 0 ? "+" : ""}{gap.toFixed(2)})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {cutoff.cutoffRank != null
                            ? cutoff.cutoffRank.toLocaleString("en-IN")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No historical cutoff data available for this category.
            </p>
          )}
        </div>

        {/* ----------------------------------------------------------------
            Section 2 — Placement Numbers (exact figures)
        ---------------------------------------------------------------- */}
        {college.placementData ? (
          <div>
            <h4 className="text-sm font-semibold mb-2">
              💼 Placements ({college.placementData.year})
            </h4>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Avg Package
                </p>
                <p className="font-bold text-green-700 text-base">
                  {formatPackage(college.placementData.averagePackage)}
                </p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Highest Package
                </p>
                <p className="font-bold text-emerald-700 text-base">
                  {formatPackage(college.placementData.highestPackage)}
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  Placed %
                </p>
                <p className="font-bold text-blue-700 text-base">
                  {college.placementData.placementPercentage.toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Fallback: show normalized score bar when no exact data is available
          <div>
            <h4 className="text-sm font-semibold mb-2">💼 Placement Score</h4>
            <ScoreBar label="Placement" value={college.placementScore} />
          </div>
        )}

        {/* ----------------------------------------------------------------
            Section 3 — Other Scores
        ---------------------------------------------------------------- */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreBar label="Campus Life" value={college.campusLifeScore} />
          <ScoreBar
            label="Infrastructure"
            value={college.infrastructureScore}
          />
          <ScoreBar label="Teaching" value={college.teachingScore} />
          <ScoreBar
            label="Industry Exposure"
            value={college.industryExposureScore}
          />
        </div>

        {/* ----------------------------------------------------------------
            Section 4 — Fees
        ---------------------------------------------------------------- */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Annual Fees</p>
            <p className="font-semibold">₹{college.fees.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Hostel Fees</p>
            <p className="font-semibold">
              {college.hostelAvailable
                ? `₹${college.hostelFees.toLocaleString("en-IN")}`
                : "Not Available"}
            </p>
          </div>
        </div>

        {/* ----------------------------------------------------------------
            Section 5 — Student Feedback (AI summary + sentiment badge)
        ---------------------------------------------------------------- */}
        {college.studentFeedback && (
          <div className="border border-border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <MessageSquare className="w-4 h-4" /> Student Feedback
              </h4>
              <Badge
                variant={sentimentBadge.variant}
                className={sentimentBadge.className}
              >
                {sentimentBadge.label}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {showFullSummary
                ? college.studentFeedback.summary
                : truncate(college.studentFeedback.summary, 180)}
            </p>

            {college.studentFeedback.summary.length > 180 && (
              <button
                type="button"
                onClick={() => setShowFullSummary(!showFullSummary)}
                className="text-xs text-blue-600 hover:underline mt-1"
              >
                {showFullSummary ? "Show less" : "Read more"}
              </button>
            )}

            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${sentimentBadge.barColor}`}
                  style={{
                    width: `${college.studentFeedback.sentimentScore * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {Math.round(college.studentFeedback.sentimentScore * 100)}%
                positive
              </span>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------
            Actions
        ---------------------------------------------------------------- */}
        <div className="flex gap-2 pt-1">
          <Button
            id={`compare-btn-${college.collegeId}`}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={onSelect}
            className="flex-1"
          >
            {isSelected ? "✓ Selected" : "Select for Comparison"}
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

// ---------------------------------------------------------------------------
// Sentiment Badge Helper
// ---------------------------------------------------------------------------

function getSentimentBadge(score?: number): {
  label: string;
  variant: "default" | "destructive" | "outline" | "secondary";
  className: string;
  barColor: string;
} {
  if (score === undefined || score === null) {
    return {
      label: "No Data",
      variant: "outline",
      className: "",
      barColor: "bg-gray-400",
    };
  }
  if (score > 0.6) {
    return {
      label: "Positive ✨",
      variant: "default",
      className: "bg-green-600 hover:bg-green-700 text-white",
      barColor: "bg-green-500",
    };
  }
  if (score < 0.4) {
    return {
      label: "Critical ⚠️",
      variant: "destructive",
      className: "",
      barColor: "bg-red-500",
    };
  }
  return {
    label: "Mixed 🔄",
    variant: "secondary",
    className: "",
    barColor: "bg-yellow-400",
  };
}

// ---------------------------------------------------------------------------
// Score Bar
// ---------------------------------------------------------------------------

interface ScoreBarProps {
  label: string;
  value: number;
}

function ScoreBar({ label, value }: ScoreBarProps) {
  const percentage = Math.min(100, Math.max(0, value));
  const getColor = (val: number) => {
    if (val >= 80) return "bg-green-500";
    if (val >= 60) return "bg-yellow-500";
    return "bg-red-400";
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-xs font-semibold">{value.toFixed(0)}/100</p>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getColor(value)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}
