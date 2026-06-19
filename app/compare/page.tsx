"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ComparePage() {
  const searchParams = useSearchParams();
  const [colleges, setColleges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = searchParams.getAll("ids").map((id) => parseInt(id));
    if (ids.length > 0) {
      fetchColleges(ids);
    }
  }, [searchParams]);

  const fetchColleges = async (collegeIds: number[]) => {
    try {
      setLoading(true);
      const response = await fetch("/api/colleges/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeIds }),
      });

      if (!response.ok) throw new Error("Failed to fetch colleges");
      const data = await response.json();
      setColleges(data.data);
    } catch (error) {
      console.error("Error fetching colleges:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (colleges.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-4">
            No colleges selected for comparison
          </p>
          <Link href="/recommendations">
            <Button>Back to Recommendations</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/recommendations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-4xl font-bold">Compare Colleges</h1>
            <p className="text-muted-foreground">
              Side-by-side comparison of {colleges.length} colleges
            </p>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              {/* College Names */}
              <tr>
                <td className="font-bold p-4 bg-gray-100 border">Criteria</td>
                {colleges.map((college) => (
                  <td key={college.id} className="p-4 bg-blue-50 border font-bold">
                    <div className="flex flex-col">
                      <p>{college.collegeName}</p>
                      <p className="text-sm text-muted-foreground">
                        {college.collegeCode}
                      </p>
                    </div>
                  </td>
                ))}
              </tr>

              {/* City */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">City</td>
                {colleges.map((college) => (
                  <td key={college.id} className="p-4 border">
                    {college.city}
                  </td>
                ))}
              </tr>

              {/* University */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">University</td>
                {colleges.map((college) => (
                  <td key={college.id} className="p-4 border">
                    {college.university}
                  </td>
                ))}
              </tr>

              {/* Annual Fees */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Annual Fees
                </td>
                {colleges.map((college) => (
                  <td key={college.id} className="p-4 border font-semibold text-green-600">
                    ₹{college.fees.toLocaleString()}
                  </td>
                ))}
              </tr>

              {/* Hostel Fees */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Hostel Fees
                </td>
                {colleges.map((college) => (
                  <td key={college.id} className="p-4 border">
                    {college.hostelAvailable
                      ? `₹${college.hostelFees.toLocaleString()}`
                      : "N/A"}
                  </td>
                ))}
              </tr>

              {/* Branches */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">Branches</td>
                {colleges.map((college) => (
                  <td key={college.id} className="p-4 border">
                    <div className="flex flex-wrap gap-1">
                      {college.branches?.map((branch: any) => (
                        <Badge key={branch.id} variant="outline">
                          {branch.branchName}
                        </Badge>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Placement Score */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Placement Score
                </td>
                {colleges.map((college) => (
                  <td
                    key={college.id}
                    className="p-4 border font-bold text-lg text-blue-600"
                  >
                    {college.placementScore.toFixed(1)}/100
                  </td>
                ))}
              </tr>

              {/* Campus Life Score */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Campus Life Score
                </td>
                {colleges.map((college) => (
                  <td
                    key={college.id}
                    className="p-4 border font-bold text-lg text-blue-600"
                  >
                    {college.campusLifeScore.toFixed(1)}/100
                  </td>
                ))}
              </tr>

              {/* Infrastructure Score */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Infrastructure Score
                </td>
                {colleges.map((college) => (
                  <td
                    key={college.id}
                    className="p-4 border font-bold text-lg text-blue-600"
                  >
                    {college.infrastructureScore.toFixed(1)}/100
                  </td>
                ))}
              </tr>

              {/* Teaching Score */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Teaching Score
                </td>
                {colleges.map((college) => (
                  <td
                    key={college.id}
                    className="p-4 border font-bold text-lg text-blue-600"
                  >
                    {college.teachingScore.toFixed(1)}/100
                  </td>
                ))}
              </tr>

              {/* Latest Cutoff */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Last Cutoff (General)
                </td>
                {colleges.map((college) => {
                  const cutoff = college.cutoffs?.[0];
                  return (
                    <td key={college.id} className="p-4 border">
                      {cutoff ? `${cutoff.percentile.toFixed(2)}%` : "N/A"}
                    </td>
                  );
                })}
              </tr>

              {/* Placement Data */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Avg Package (Latest)
                </td>
                {colleges.map((college) => {
                  const placement = college.placements?.[0];
                  return (
                    <td key={college.id} className="p-4 border font-bold text-green-600">
                      {placement
                        ? `₹${(placement.averagePackage / 100000).toFixed(2)}L`
                        : "N/A"}
                    </td>
                  );
                })}
              </tr>

              {/* Placement Percentage */}
              <tr>
                <td className="font-semibold p-4 bg-gray-50 border">
                  Placement % (Latest)
                </td>
                {colleges.map((college) => {
                  const placement = college.placements?.[0];
                  return (
                    <td key={college.id} className="p-4 border font-bold text-blue-600">
                      {placement
                        ? `${placement.placementPercentage.toFixed(1)}%`
                        : "N/A"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link href="/recommendations">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Recommendations
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
