"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface CollegeDetailPageProps {
  params: { id: string };
}

export default function CollegeDetailPage({ params }: CollegeDetailPageProps) {
  const [college, setCollege] = useState<any>(null);
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    fetchCollegeDetails();
  }, [params.id]);

  const fetchCollegeDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/colleges/${params.id}`);
      if (!response.ok) throw new Error("Failed to fetch college details");
      const data = await response.json();
      setCollege(data.data);

      // Fetch AI summary
      fetchAISummary(parseInt(params.id));
    } catch (error) {
      console.error("Error fetching college details:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAISummary = async (collegeId: number) => {
    try {
      setSummaryLoading(true);
      const response = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId }),
      });
      if (!response.ok) throw new Error("Failed to fetch summary");
      const data = await response.json();
      setSummary(data.data.summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
    } finally {
      setSummaryLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!college) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-4">College not found</p>
          <Link href="/recommendations">
            <Button>Back to Recommendations</Button>
          </Link>
        </div>
      </div>
    );
  }

  const latestCutoff = college.cutoffs?.[0];
  const latestPlacement = college.placements?.[0];

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/recommendations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-4xl font-bold">{college.collegeName}</h1>
            <p className="text-muted-foreground">
              {college.city} | {college.university}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>College Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">College Code</p>
                    <p className="font-semibold">{college.collegeCode}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">University</p>
                    <p className="font-semibold">{college.university}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Annual Fees</p>
                    <p className="font-semibold">₹{college.fees.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Hostel Available</p>
                    <p className="font-semibold">
                      {college.hostelAvailable ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
                {college.website && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Website</p>
                    <a
                      href={college.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      Visit Website <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Branches */}
            <Card>
              <CardHeader>
                <CardTitle>Branches Offered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {college.branches?.map((branch: any) => (
                    <Badge key={branch.id}>{branch.branchName}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Scores */}
            <Card>
              <CardHeader>
                <CardTitle>College Scores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScoreGrid
                  scores={{
                    "Placement": college.placementScore,
                    "Campus Life": college.campusLifeScore,
                    "Infrastructure": college.infrastructureScore,
                    "Teaching Quality": college.teachingScore,
                    "Industry Exposure": college.industryExposureScore,
                  }}
                />
              </CardContent>
            </Card>

            {/* Cutoffs */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Cutoffs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Year</th>
                        <th className="text-left py-2 px-2">Round</th>
                        <th className="text-left py-2 px-2">Category</th>
                        <th className="text-left py-2 px-2">Percentile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {college.cutoffs?.slice(0, 10).map((cutoff: any) => (
                        <tr
                          key={cutoff.id}
                          className="border-b hover:bg-gray-50"
                        >
                          <td className="py-2 px-2">{cutoff.year}</td>
                          <td className="py-2 px-2">{cutoff.round}</td>
                          <td className="py-2 px-2">{cutoff.category}</td>
                          <td className="py-2 px-2 font-semibold">
                            {cutoff.percentile.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Placements */}
            {latestPlacement && (
              <Card>
                <CardHeader>
                  <CardTitle>Placement Data</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Average Package</p>
                    <p className="text-2xl font-bold text-green-600">
                      ₹{(latestPlacement.averagePackage / 100000).toFixed(2)}L
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Median Package</p>
                    <p className="text-2xl font-bold text-green-600">
                      ₹{(latestPlacement.medianPackage / 100000).toFixed(2)}L
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Highest Package</p>
                    <p className="text-2xl font-bold text-green-600">
                      ₹{(latestPlacement.highestPackage / 100000).toFixed(2)}L
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Placement %
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      {latestPlacement.placementPercentage.toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* AI Summary */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {summaryLoading ? "Generating Summary..." : "College Summary"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  </div>
                ) : summary ? (
                  <p className="text-sm leading-relaxed">{summary}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No summary available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Reviews */}
            <Card>
              <CardHeader>
                <CardTitle>Student Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                {college.reviews && college.reviews.length > 0 ? (
                  <div className="space-y-3">
                    {college.reviews.map((review: any) => (
                      <div key={review.id} className="border-l-4 border-blue-500 pl-3">
                        <p className="text-xs text-muted-foreground mb-1">
                          {review.source}
                        </p>
                        <p className="text-sm">{review.reviewText}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No reviews available
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

interface ScoreGridProps {
  scores: Record<string, number>;
}

function ScoreGrid({ scores }: ScoreGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {Object.entries(scores).map(([label, value]) => (
        <div key={label}>
          <div className="flex justify-between items-center mb-2">
            <p className="font-medium text-sm">{label}</p>
            <p className="font-bold text-lg">{value.toFixed(0)}/100</p>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                value >= 80
                  ? "bg-green-500"
                  : value >= 60
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, value)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
