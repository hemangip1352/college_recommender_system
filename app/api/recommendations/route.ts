import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { filterColleges } from "@/lib/filtering-engine";

const prisma = new PrismaClient();

const RecommendationSchema = z.object({
  mhtcetPercentile: z.number().min(0).max(100),
  jeePercentile: z.number().min(0).max(100).optional(),
  twelfthPercentage: z.number().min(0).max(100).optional(),
  category: z.string(),
  gender: z.string(),
  homeUniversity: z.string(),
  branchPreferences: z.array(z.string()).min(1),
  cityPreferences: z.array(z.string()).optional(),
  priorityWeights: z.record(z.number()),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validData = RecommendationSchema.parse(body);

    const groupedColleges = await filterColleges(validData, prisma);

    const results = {
      dream: groupedColleges.get("dream") || [],
      target: groupedColleges.get("target") || [],
      safe: groupedColleges.get("safe") || [],
    };

    return NextResponse.json({
      success: true,
      data: results,
      message: `Found ${results.dream.length} dream, ${results.target.length} target, and ${results.safe.length} safe colleges`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Recommendation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate recommendations" },
      { status: 500 }
    );
  }
}
