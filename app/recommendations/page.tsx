"use client";

import { useState } from "react";
import { RecommendationForm } from "@/components/recommendation-form";
import { CollegeResults } from "@/components/college-results";
import { useRouter } from "next/navigation";

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRecommendationsReceived = (data: any) => {
    setRecommendations(data);
  };

  const handleCompare = (collegeIds: number[]) => {
    const params = new URLSearchParams();
    collegeIds.forEach((id) => params.append("ids", id.toString()));
    router.push(`/compare?${params.toString()}`);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2">Find Your Perfect College</h1>
          <p className="text-lg text-muted-foreground">
            Get personalized recommendations based on your profile and preferences
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <RecommendationForm
              onRecommendationsReceived={handleRecommendationsReceived}
            />
          </div>

          {recommendations && (
            <div className="lg:col-span-2">
              <CollegeResults
                dream={recommendations.dream || []}
                target={recommendations.target || []}
                safe={recommendations.safe || []}
                onCompare={handleCompare}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
