import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const prisma = new PrismaClient();

const CompareSchema = z.object({
  collegeIds: z.array(z.number()).min(1).max(3),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { collegeIds } = CompareSchema.parse(body);

    const colleges = await prisma.college.findMany({
      where: {
        id: { in: collegeIds },
      },
      include: {
        branches: true,
        cutoffs: {
          orderBy: [{ year: "desc" }],
          take: 1,
        },
        placements: {
          orderBy: { year: "desc" },
          take: 1,
        },
        reviews: {
          take: 5,
        },
        summaries: {
          take: 1,
        },
      },
    });

    if (colleges.length === 0) {
      return NextResponse.json(
        { success: false, error: "No colleges found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: colleges,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Compare error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to compare colleges" },
      { status: 500 }
    );
  }
}
