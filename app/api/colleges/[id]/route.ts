import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const collegeId = parseInt(params.id);

    if (isNaN(collegeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid college ID" },
        { status: 400 }
      );
    }

    const college = await prisma.college.findUnique({
      where: { id: collegeId },
      include: {
        branches: true,
        cutoffs: {
          orderBy: [{ year: "desc" }, { round: "desc" }],
          take: 20,
        },
        placements: {
          orderBy: { year: "desc" },
          take: 5,
        },
        reviews: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        summaries: {
          take: 1,
        },
      },
    });

    if (!college) {
      return NextResponse.json(
        { success: false, error: "College not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: college,
    });
  } catch (error) {
    console.error("College details error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch college details" },
      { status: 500 }
    );
  }
}
