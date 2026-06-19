"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTierColor, getTierLabel } from "@/lib/filtering-engine";
import { ExternalLink, Info } from "lucide-react";

interface CollegeResult {
  collegeId: number;
  collegeName: string;
  collegeCode: string;
  city: string;
  university: string;
  fees: number;
  hostelFees: number;
  tier: "dream" | "target" | "safe";
  lastCutoff: number;
  applicablePercentile: number;
  score: number;
  placementScore: number;
  campusLifeScore: number;
  infrastructureScore: number;
  teachingScore: number;
}

interface CollegeResultsProps {
  dream: CollegeResult[];
  target: CollegeResult[];
  safe: CollegeResult[];
  onCompare: (collegeIds: number[]) => void;
}

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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
        <p className="text-blue-800">
          Found <span className="font-bold">{totalColleges}</span> colleges
          matching your profile: <span className="font-bold">{dream.length}</span> Dream,{" "}
          <span className="font-bold">{target.length}</span> Target, and{" "}
          <span className="font-bold">{safe.length}</span> Safe options.
        </p>
      </div>

      {selectedForComparison.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex justify-between items-center">
          <p className="text-amber-800">
            <span className="font-bold">{selectedForComparison.length}</span> college{selectedForComparison.length !== 1 ? "s" : ""} selected for comparison (max 3)
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
              No colleges found matching your criteria. Try adjusting your preferences.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface CollegeCardProps {
  college: CollegeResult;
  isSelected: boolean;
  onSelect: () => void;
}

function CollegeCard({ college, isSelected, onSelect }: CollegeCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-blue-500 bg-blue-50" : "hover:shadow-lg"
      }`}
    >
      <CardHeader>
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{college.collegeName}</CardTitle>
              <Badge
                style={{
                  backgroundColor: getTierColor(college.tier),
                  color: "white",
                }}
              >
                {getTierLabel(college.tier)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Code: {college.collegeCode} | {college.city}, {college.university}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">
              {college.score.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">Match Score</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cutoff Information */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Your Percentile</p>
            <p className="font-semibold">{college.applicablePercentile.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Cutoff</p>
            <p className="font-semibold">{college.lastCutoff.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Difference</p>
            <p className={`font-semibold ${
              college.applicablePercentile >= college.lastCutoff
                ? "text-green-600"
                : "text-orange-600"
            }`}>
              {(college.applicablePercentile - college.lastCutoff).toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreBar
            label="Placement"
            value={college.placementScore}
          />
          <ScoreBar
            label="Campus Life"
            value={college.campusLifeScore}
          />
          <ScoreBar
            label="Infrastructure"
            value={college.infrastructureScore}
          />
          <ScoreBar
            label="Teaching"
            value={college.teachingScore}
          />
        </div>

        {/* Fees */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Annual Fees</p>
            <p className="font-semibold">₹{college.fees.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Hostel Fees</p>
            <p className="font-semibold">₹{college.hostelFees.toLocaleString()}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={onSelect}
            className="flex-1"
          >
            {isSelected ? "✓ Selected" : "Select"}
          </Button>
          <Link href={`/college/${college.collegeId}`}>
            <Button variant="outline" size="sm">
              <Info className="w-4 h-4 mr-1" />
              Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

interface ScoreBarProps {
  label: string;
  value: number;
}

function ScoreBar({ label, value }: ScoreBarProps) {
  const percentage = Math.min(100, Math.max(0, value));
  const getColor = (val: number) => {
    if (val >= 80) return "bg-green-500";
    if (val >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-xs font-semibold">{value.toFixed(0)}</p>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(value)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
