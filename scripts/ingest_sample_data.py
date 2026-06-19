#!/usr/bin/env python3
"""
Sample data ingestion script for Maharashtra CAP recommender.
This script creates sample college data for demonstration purposes.

Usage:
    python scripts/ingest_sample_data.py

Before running:
    1. Ensure DATABASE_URL is set in .env
    2. Run: npm run db:migrate
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary python-dotenv")
    sys.exit(1)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set in .env")
    sys.exit(1)


def ingest_sample_data():
    """Ingest sample college data."""
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    try:
        # Sample colleges data
        colleges = [
            {
                "code": "4001",
                "name": "College of Engineering, Pune",
                "city": "Pune",
                "district": "Pune",
                "university": "Savitribai Phule Pune University",
                "website": "https://coep.ac.in",
                "fees": 180000,
                "hostel_available": True,
                "hostel_fees": 100000,
                "infrastructure_score": 95,
                "campus_life_score": 90,
                "teaching_score": 92,
                "placement_score": 94,
                "industry_exposure_score": 88,
            },
            {
                "code": "4002",
                "name": "MIT World Peace University",
                "city": "Pune",
                "district": "Pune",
                "university": "MIT ADT University",
                "website": "https://mitwpu.edu.in",
                "fees": 220000,
                "hostel_available": True,
                "hostel_fees": 120000,
                "infrastructure_score": 92,
                "campus_life_score": 88,
                "teaching_score": 85,
                "placement_score": 86,
                "industry_exposure_score": 89,
            },
            {
                "code": "4003",
                "name": "Vishwakarma Institute of Technology",
                "city": "Pune",
                "district": "Pune",
                "university": "Savitribai Phule Pune University",
                "website": "https://vit.edu.in",
                "fees": 200000,
                "hostel_available": True,
                "hostel_fees": 110000,
                "infrastructure_score": 88,
                "campus_life_score": 85,
                "teaching_score": 87,
                "placement_score": 85,
                "industry_exposure_score": 82,
            },
            {
                "code": "4004",
                "name": "Dr. D.Y. Patil Institute of Technology",
                "city": "Pune",
                "district": "Pune",
                "university": "Savitribai Phule Pune University",
                "website": "https://dypit.ac.in",
                "fees": 190000,
                "hostel_available": True,
                "hostel_fees": 95000,
                "infrastructure_score": 82,
                "campus_life_score": 80,
                "teaching_score": 80,
                "placement_score": 78,
                "industry_exposure_score": 75,
            },
            {
                "code": "4005",
                "name": "Nagpur Institute of Technology",
                "city": "Nagpur",
                "district": "Nagpur",
                "university": "Rashtrasant Tukadoji Maharaj Nagpur University",
                "website": "https://nitnagpur.ac.in",
                "fees": 160000,
                "hostel_available": True,
                "hostel_fees": 80000,
                "infrastructure_score": 78,
                "campus_life_score": 75,
                "teaching_score": 76,
                "placement_score": 72,
                "industry_exposure_score": 70,
            },
        ]

        # Insert colleges and get their IDs
        college_ids = []
        for college in colleges:
            cursor.execute(
                """
                INSERT INTO "College" (
                    "collegeCode", "collegeName", city, district, university, website,
                    fees, "hostelAvailable", "hostelFees", "infrastructureScore",
                    "campusLifeScore", "teachingScore", "placementScore", "industryExposureScore"
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("collegeCode") DO NOTHING
                RETURNING id;
                """,
                (
                    college["code"],
                    college["name"],
                    college["city"],
                    college["district"],
                    college["university"],
                    college["website"],
                    college["fees"],
                    college["hostel_available"],
                    college["hostel_fees"],
                    college["infrastructure_score"],
                    college["campus_life_score"],
                    college["teaching_score"],
                    college["placement_score"],
                    college["industry_exposure_score"],
                ),
            )
            result = cursor.fetchone()
            if result:
                college_ids.append(result[0])

        conn.commit()
        print(f"✓ Inserted {len(college_ids)} colleges")

        # Sample branches
        branches_data = []
        branch_names = [
            "Computer Science",
            "Information Technology",
            "Electronics and Telecommunication",
            "Mechanical",
            "Civil",
        ]

        for college_id in college_ids[:3]:  # Add branches for first 3 colleges
            for branch in branch_names:
                branches_data.append((college_id, branch))

        for college_id, branch_name in branches_data:
            cursor.execute(
                """
                INSERT INTO "Branch" ("collegeId", "branchName")
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING;
                """,
                (college_id, branch_name),
            )

        conn.commit()
        print(f"✓ Inserted {len(branches_data)} branches")

        # Sample cutoffs
        cutoff_data = []
        for college_id in college_ids[:3]:
            # Get branch IDs for this college
            cursor.execute(
                'SELECT id FROM "Branch" WHERE "collegeId" = %s LIMIT 1',
                (college_id,),
            )
            branch_result = cursor.fetchone()
            if branch_result:
                branch_id = branch_result[0]

                # Add cutoff data for different years/rounds
                for year in [2024, 2023, 2022]:
                    for round_num in [1, 2, 3]:
                        for category in ["General", "OBC", "SC"]:
                            percentile = max(
                                50,
                                95 - (year - 2022) * 5 - round_num * 2
                                + ("SC" == category) * 20
                                + ("OBC" == category) * 10,
                            )
                            cutoff_data.append(
                                (
                                    college_id,
                                    branch_id,
                                    year,
                                    round_num,
                                    category,
                                    "M",
                                    "Unreserved",
                                    percentile,
                                )
                            )

        for cutoff in cutoff_data:
            cursor.execute(
                """
                INSERT INTO "Cutoff" 
                ("collegeId", "branchId", year, round, category, gender, "seatType", percentile)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING;
                """,
                cutoff,
            )

        conn.commit()
        print(f"✓ Inserted {len(cutoff_data)} cutoff records")

        # Sample placements
        placement_data = []
        for college_id in college_ids:
            for year in [2024, 2023, 2022]:
                avg_package = 800000 + (college_id % 3) * 200000
                median_package = 750000 + (college_id % 3) * 150000
                highest_package = 3000000 + (college_id % 2) * 500000
                placement_pct = 85 + (college_id % 3) * 5

                cursor.execute(
                    """
                    INSERT INTO "Placement" 
                    ("collegeId", year, "averagePackage", "medianPackage", "highestPackage", "placementPercentage")
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING;
                    """,
                    (college_id, year, avg_package, median_package, highest_package, placement_pct),
                )

        conn.commit()
        print(f"✓ Inserted placement records for {len(college_ids)} colleges")

        # Sample reviews
        sample_reviews = [
            "Great campus infrastructure and active student clubs",
            "Excellent placement record with top IT companies",
            "Good teaching quality and faculty support",
            "Strong industry connections and internship opportunities",
            "Comfortable hostel facilities and good food",
        ]

        review_count = 0
        for college_id in college_ids:
            for review_text in sample_reviews:
                cursor.execute(
                    """
                    INSERT INTO "Review" ("collegeId", source, "reviewText", "sentimentScore")
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT DO NOTHING;
                    """,
                    (college_id, "Student", review_text, 0.7),
                )
                review_count += 1

        conn.commit()
        print(f"✓ Inserted {review_count} reviews")

        print("\n✓ Sample data ingestion completed successfully!")
        print(
            "\nYou can now visit http://localhost:3000/recommendations to test the platform"
        )

    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    ingest_sample_data()
