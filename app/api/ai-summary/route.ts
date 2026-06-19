import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_CONFIG } from "@/lib/config";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SummarySchema = z.object({
  collegeId: z.number(),
});

async function generateSummaryWithGemini(
  collegeName: string,
  scores: Record<string, number>,
  reviews: Array<{ text: string; sentiment: number }>
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: GEMINI_CONFIG.MODEL });

  const prompt = `You are a factual education advisor. Summarize the following college information using ONLY the provided facts. Do not generate, assume, or invent any data.

College: ${collegeName}

Scores (0-100 scale):
- Placement Score: ${scores.placement}
- Campus Life Score: ${scores.campusLife}
- Infrastructure Score: ${scores.infrastructure}
- Teaching Quality: ${scores.teaching}
- Industry Exposure: ${scores.industryExposure}

Student Reviews Summary:
${reviews.map((r) => `- "${r.text}" (Sentiment: ${r.sentiment > 0.5 ? "Positive" : r.sentiment < -0.5 ? "Negative" : "Neutral"})`).join("\n")}

Based ONLY on this information, provide a brief 60-word summary covering:
1. Key Strengths
2. Notable Weakness (if any)
3. Student Experience Overview

Do NOT generate missing statistics or data.`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  return responseText;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { collegeId } = SummarySchema.parse(body);

    // Check if summary already exists
    let existingSummary = await prisma.collegeSummary.findUnique({
      where: { collegeId },
    });

    if (existingSummary) {
      return NextResponse.json({
        success: true,
        data: { summary: existingSummary.summary },
      });
    }

    // Fetch college data
    const college = await prisma.college.findUnique({
      where: { id: collegeId },
      include: {
        reviews: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!college) {
      return NextResponse.json(
        { success: false, error: "College not found" },
        { status: 404 }
      );
    }

    // Generate summary with Gemini
    const scores = {
      placement: college.placementScore,
      campusLife: college.campusLifeScore,
      infrastructure: college.infrastructureScore,
      teaching: college.teachingScore,
      industryExposure: college.industryExposureScore,
    };

    const reviews = college.reviews.map((r) => ({
      text: r.reviewText,
      sentiment: r.sentimentScore,
    }));

    const summary = await generateSummaryWithGemini(
      college.collegeName,
      scores,
      reviews
    );

    // Store summary
    const savedSummary = await prisma.collegeSummary.create({
      data: {
        collegeId,
        summary,
      },
    });

    return NextResponse.json({
      success: true,
      data: { summary: savedSummary.summary },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    console.error("AI Summary error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
