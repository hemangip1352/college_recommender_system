#!/usr/bin/env python3
"""
College Review Scraper & Sentiment Scorer
==========================================
Scrapes college reviews from a configurable public URL and populates the
Review and CollegeSummary tables in the database with a calculated sentiment score.

The scraper:
  1. Fetches HTML from the target URL (supports pagination)
  2. Extracts review text, author type (Student/Alumni/Faculty), and date
  3. Runs a lightweight keyword-based VADER-style sentiment scorer
  4. Upserts records into the Review table
  5. Aggregates per-college and writes/updates CollegeSummary

Supported review sites (configure via --site):
  - shiksha    : https://www.shiksha.com  (college review pages)
  - collegedunia: https://collegedunia.com (college review pages)
  - generic    : Any site where reviews are in a consistent CSS pattern

Usage:
    python scripts/review_scraper.py --college-id 1 --url "https://www.shiksha.com/college/reviews" --site shiksha
    python scripts/review_scraper.py --college-id 1 --url "https://collegedunia.com/college/1-coep/reviews" --site collegedunia
    python scripts/review_scraper.py --college-id 1 --url "..." --site generic --review-selector ".review-text" --author-selector ".reviewer-type"

Dependencies:
    pip install requests beautifulsoup4 python-dotenv psycopg2-binary lxml

Environment:
    DATABASE_URL must be set in .env
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime
from typing import Optional

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print(
        "Error: Required packages not installed.\n"
        "Run: pip install requests beautifulsoup4 lxml"
    )
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional; DATABASE_URL can be set directly

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Sentiment Scoring
# ---------------------------------------------------------------------------

# Positive and negative keyword dictionaries tailored to college reviews.
# Each word maps to a weight (0-1). Words with higher magnitude have stronger impact.
POSITIVE_WORDS: dict[str, float] = {
    "excellent": 0.9, "outstanding": 0.9, "great": 0.8, "amazing": 0.9,
    "fantastic": 0.85, "superb": 0.85, "best": 0.8, "wonderful": 0.8,
    "good": 0.65, "nice": 0.6, "decent": 0.55, "fine": 0.5,
    "helpful": 0.7, "knowledgeable": 0.75, "experienced": 0.65,
    "supportive": 0.7, "friendly": 0.65, "cooperative": 0.6,
    "modern": 0.6, "well-equipped": 0.75, "updated": 0.55,
    "placement": 0.6,  # Neutral noun, boosted slightly as it implies positive context
    "placed": 0.65, "hired": 0.65, "recruited": 0.65, "selected": 0.6,
    "top": 0.65, "highest": 0.6, "lakh": 0.55,  # salary context
    "recommend": 0.85, "satisfied": 0.8, "happy": 0.75, "proud": 0.7,
    "clean": 0.6, "safe": 0.6, "affordable": 0.65, "scholarship": 0.6,
    "opportunity": 0.6, "exposure": 0.6, "internship": 0.55, "projects": 0.5,
    "active": 0.55, "vibrant": 0.65, "cultural": 0.5, "sports": 0.5,
    "events": 0.45, "fest": 0.55, "fun": 0.6, "enjoyable": 0.65,
}

NEGATIVE_WORDS: dict[str, float] = {
    "bad": 0.75, "poor": 0.75, "terrible": 0.9, "awful": 0.9, "horrible": 0.9,
    "worst": 0.95, "pathetic": 0.9, "useless": 0.85, "waste": 0.8,
    "disappointed": 0.8, "disappointing": 0.8, "dissatisfied": 0.8,
    "average": 0.4,  # Mild negative in context of reviews
    "outdated": 0.7, "old": 0.45, "obsolete": 0.75,
    "corrupt": 0.9, "bribe": 0.95, "ragging": 0.95, "unsafe": 0.85,
    "expensive": 0.6, "overpriced": 0.7, "fees": 0.3,  # mild negative signal
    "no placement": 0.95, "no job": 0.9, "unemployed": 0.85,
    "fake": 0.9, "fraud": 0.95, "misleading": 0.85,
    "rude": 0.75, "incompetent": 0.8, "careless": 0.7, "ignorant": 0.65,
    "dirty": 0.7, "unhygienic": 0.8, "noisy": 0.5, "crowded": 0.5,
    "pressure": 0.5, "stress": 0.55, "politics": 0.65,
    "backlog": 0.7, "fail": 0.65, "detention": 0.65,
}

# Negation words that flip the sentiment of the next word
NEGATIONS = {"not", "no", "never", "neither", "without", "barely", "hardly", "scarcely"}


def score_text_sentiment(text: str) -> float:
    """
    Calculate a sentiment score for a given text string.
    
    Returns a float in [0, 1]:
      - > 0.6  → Positive
      - 0.4–0.6 → Neutral
      - < 0.4  → Negative
    
    Algorithm:
      1. Tokenize text into lowercase words
      2. For each word, check positive/negative dictionaries
      3. If preceded by a negation, flip the sentiment
      4. Accumulate weighted positive and negative scores
      5. Normalize to [0, 1] using the ratio: pos / (pos + neg + ε)
    """
    tokens = re.findall(r"\b[a-zA-Z]+\b", text.lower())
    pos_score = 0.0
    neg_score = 0.0
    prev_negated = False

    for i, token in enumerate(tokens):
        # Check for negation in preceding window (up to 2 words back)
        window_start = max(0, i - 2)
        negated = any(tokens[j] in NEGATIONS for j in range(window_start, i))

        if token in POSITIVE_WORDS:
            weight = POSITIVE_WORDS[token]
            if negated:
                neg_score += weight * 0.8   # negated positive → negative signal
            else:
                pos_score += weight
        elif token in NEGATIVE_WORDS:
            weight = NEGATIVE_WORDS[token]
            if negated:
                pos_score += weight * 0.8   # negated negative → mild positive signal
            else:
                neg_score += weight

    epsilon = 1e-6  # prevent divide-by-zero
    total = pos_score + neg_score + epsilon

    # Normalize to [0, 1]. Completely neutral text → 0.5
    if pos_score == 0 and neg_score == 0:
        return 0.5  # No sentiment signals found

    sentiment = pos_score / total
    # Clamp to [0.05, 0.95] to avoid extreme values for short texts
    return round(min(0.95, max(0.05, sentiment)), 4)


def aggregate_sentiment(scores: list[float]) -> float:
    """Compute the mean sentiment score across a list of review scores."""
    if not scores:
        return 0.5
    return round(sum(scores) / len(scores), 4)


def generate_summary(reviews: list[dict], college_name: str) -> str:
    """
    Generate a template-based summary from scraped reviews.
    This is a heuristic fallback; for production, use the Gemini AI API
    route already present at /api/ai-summary in this project.
    """
    total = len(reviews)
    if total == 0:
        return f"No reviews available for {college_name}."

    avg_sentiment = aggregate_sentiment([r["sentiment_score"] for r in reviews])

    positive_count = sum(1 for r in reviews if r["sentiment_score"] > 0.6)
    negative_count = sum(1 for r in reviews if r["sentiment_score"] < 0.4)

    positive_pct = round(positive_count / total * 100)
    negative_pct = round(negative_count / total * 100)

    # Extract top positive and negative snippets
    top_positive = sorted(
        [r for r in reviews if r["sentiment_score"] > 0.6],
        key=lambda r: r["sentiment_score"],
        reverse=True,
    )
    top_negative = sorted(
        [r for r in reviews if r["sentiment_score"] < 0.4],
        key=lambda r: r["sentiment_score"],
    )

    positive_snippet = ""
    if top_positive:
        text = top_positive[0]["text"]
        positive_snippet = f'Students frequently highlight: "{text[:120]}..."' if len(text) > 120 else f'"{text}"'

    negative_snippet = ""
    if top_negative:
        text = top_negative[0]["text"]
        negative_snippet = f'Common concerns include: "{text[:120]}..."' if len(text) > 120 else f'"{text}"'

    overall = "positive" if avg_sentiment > 0.6 else "mixed" if avg_sentiment >= 0.4 else "critical"

    summary_parts = [
        f"Based on {total} student reviews, {college_name} receives overall {overall} feedback "
        f"({positive_pct}% positive, {negative_pct}% negative).",
    ]
    if positive_snippet:
        summary_parts.append(positive_snippet)
    if negative_snippet:
        summary_parts.append(negative_snippet)

    return " ".join(summary_parts)


# ---------------------------------------------------------------------------
# Site-Specific Scrapers
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
}


def scrape_shiksha(url: str, max_pages: int = 5) -> list[dict]:
    """Scrape reviews from Shiksha.com college review pages."""
    reviews = []

    for page in range(1, max_pages + 1):
        page_url = f"{url}?page={page}" if page > 1 else url
        print(f"  [Shiksha] Fetching page {page}: {page_url}")

        try:
            resp = requests.get(page_url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"  [Shiksha] Request failed: {e}")
            break

        soup = BeautifulSoup(resp.text, "lxml")

        # Shiksha review card selectors (as of 2024 layout)
        review_cards = soup.select("div.reviewCard, div[class*='review-card'], div[class*='ReviewCard']")

        if not review_cards:
            print(f"  [Shiksha] No review cards found on page {page}. Stopping.")
            break

        for card in review_cards:
            # Extract review text
            text_el = card.select_one(
                "p.reviewText, div.review-text, p[class*='reviewText'], div[class*='review_text']"
            )
            if not text_el:
                continue

            text = text_el.get_text(separator=" ", strip=True)
            if len(text) < 20:
                continue

            # Extract author type
            author_el = card.select_one("span.reviewer-type, span[class*='authorType'], p[class*='reviewer']")
            author_type = "Student"
            if author_el:
                raw = author_el.get_text(strip=True).lower()
                if "alumni" in raw:
                    author_type = "Alumni"
                elif "faculty" in raw or "staff" in raw:
                    author_type = "Faculty"

            reviews.append({
                "text": text,
                "source": author_type,
                "sentiment_score": score_text_sentiment(text),
            })

        time.sleep(1.5)  # Polite delay between pages

    return reviews


def scrape_collegedunia(url: str, max_pages: int = 5) -> list[dict]:
    """Scrape reviews from CollegeDunia.com college review pages."""
    reviews = []

    for page in range(1, max_pages + 1):
        page_url = f"{url}?page={page}" if page > 1 else url
        print(f"  [CollegeDunia] Fetching page {page}: {page_url}")

        try:
            resp = requests.get(page_url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"  [CollegeDunia] Request failed: {e}")
            break

        soup = BeautifulSoup(resp.text, "lxml")

        # CollegeDunia selectors (as of 2024)
        review_items = soup.select(
            "div.review_desc, div[class*='review-desc'], li[class*='review-item'], div[class*='reviewItem']"
        )

        if not review_items:
            break

        for item in review_items:
            text_el = item.select_one("p, div.review-text, div[class*='reviewText']")
            if not text_el:
                continue

            text = text_el.get_text(separator=" ", strip=True)
            if len(text) < 20:
                continue

            # Author type detection
            author_el = item.select_one("span[class*='user-type'], p[class*='user_type']")
            author_type = "Student"
            if author_el:
                raw = author_el.get_text(strip=True).lower()
                if "alumni" in raw:
                    author_type = "Alumni"
                elif "faculty" in raw:
                    author_type = "Faculty"

            reviews.append({
                "text": text,
                "source": author_type,
                "sentiment_score": score_text_sentiment(text),
            })

        time.sleep(1.5)

    return reviews


def scrape_generic(
    url: str,
    review_selector: str,
    author_selector: Optional[str],
    max_pages: int = 3,
) -> list[dict]:
    """Scrape reviews from any site using user-provided CSS selectors."""
    reviews = []

    for page in range(1, max_pages + 1):
        page_url = f"{url}?page={page}" if page > 1 else url
        print(f"  [Generic] Fetching page {page}: {page_url}")

        try:
            resp = requests.get(page_url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"  [Generic] Request failed: {e}")
            break

        soup = BeautifulSoup(resp.text, "lxml")
        text_elements = soup.select(review_selector)

        if not text_elements:
            break

        for el in text_elements:
            text = el.get_text(separator=" ", strip=True)
            if len(text) < 20:
                continue

            author_type = "Student"
            if author_selector:
                author_el = el.select_one(author_selector) or el.find_parent().select_one(author_selector)
                if author_el:
                    raw = author_el.get_text(strip=True).lower()
                    if "alumni" in raw:
                        author_type = "Alumni"
                    elif "faculty" in raw:
                        author_type = "Faculty"

            reviews.append({
                "text": text,
                "source": author_type,
                "sentiment_score": score_text_sentiment(text),
            })

        time.sleep(1.0)

    return reviews


# ---------------------------------------------------------------------------
# Database Operations
# ---------------------------------------------------------------------------

def get_db_connection():
    """Create and return a psycopg2 database connection."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL environment variable not set.")
        sys.exit(1)
    return psycopg2.connect(db_url)


def get_college_name(conn, college_id: int) -> str:
    """Fetch the college name from the DB for use in summaries."""
    with conn.cursor() as cur:
        cur.execute('SELECT "collegeName" FROM "College" WHERE id = %s', (college_id,))
        row = cur.fetchone()
        return row[0] if row else f"College #{college_id}"


def upsert_reviews(conn, college_id: int, reviews: list[dict]) -> int:
    """Insert review records. Skips duplicates based on text content hash."""
    if not reviews:
        return 0

    inserted = 0
    with conn.cursor() as cur:
        for review in reviews:
            cur.execute(
                """
                INSERT INTO "Review" ("collegeId", source, "reviewText", "sentimentScore", "createdAt")
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (college_id, review["source"], review["text"], review["sentiment_score"]),
            )
            if cur.fetchone():
                inserted += 1

    conn.commit()
    return inserted


def upsert_college_summary(
    conn,
    college_id: int,
    summary: str,
    sentiment_score: float,
) -> None:
    """Upsert the CollegeSummary record for a given college."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "CollegeSummary" ("collegeId", summary, "sentimentScore", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT ("collegeId") DO UPDATE
                SET summary = EXCLUDED.summary,
                    "sentimentScore" = EXCLUDED."sentimentScore",
                    "updatedAt" = NOW()
            """,
            (college_id, summary, sentiment_score),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Scrape college reviews and populate the Review and CollegeSummary tables."
    )
    parser.add_argument(
        "--college-id", type=int, required=True,
        help="Database ID of the college to associate reviews with"
    )
    parser.add_argument(
        "--url", required=True,
        help="URL of the reviews page to scrape"
    )
    parser.add_argument(
        "--site", choices=["shiksha", "collegedunia", "generic"], default="generic",
        help="Which review site scraper to use (default: generic)"
    )
    parser.add_argument(
        "--review-selector", default="p.review, div.review-text, .reviewText",
        help="CSS selector for review text elements (generic mode only)"
    )
    parser.add_argument(
        "--author-selector", default=None,
        help="CSS selector for author type element (generic mode only)"
    )
    parser.add_argument(
        "--max-pages", type=int, default=5,
        help="Maximum number of pagination pages to scrape (default: 5)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse and score reviews but do NOT write to the database"
    )
    args = parser.parse_args()

    print(f"\n[Scraper] Starting review scrape for college ID: {args.college_id}")
    print(f"[Scraper] Site: {args.site} | URL: {args.url}\n")

    # --- Scrape ---
    if args.site == "shiksha":
        reviews = scrape_shiksha(args.url, max_pages=args.max_pages)
    elif args.site == "collegedunia":
        reviews = scrape_collegedunia(args.url, max_pages=args.max_pages)
    else:
        reviews = scrape_generic(
            args.url,
            review_selector=args.review_selector,
            author_selector=args.author_selector,
            max_pages=args.max_pages,
        )

    print(f"\n[Scraper] Scraped {len(reviews)} reviews.")

    if not reviews:
        print("[Scraper] No reviews found. Check the URL and CSS selectors.")
        sys.exit(0)

    # --- Score summary ---
    scores = [r["sentiment_score"] for r in reviews]
    avg_score = aggregate_sentiment(scores)
    positive_count = sum(1 for s in scores if s > 0.6)
    negative_count = sum(1 for s in scores if s < 0.4)

    print(f"[Scraper] Average sentiment: {avg_score:.4f}")
    print(f"[Scraper] Positive: {positive_count} | Neutral: {len(reviews) - positive_count - negative_count} | Negative: {negative_count}")

    if args.dry_run:
        print("\n[Scraper] DRY RUN — not writing to database.")
        print("Sample reviews:")
        for r in reviews[:3]:
            print(f"  [{r['source']}] score={r['sentiment_score']:.3f} | {r['text'][:100]}...")
        sys.exit(0)

    # --- Write to DB ---
    conn = get_db_connection()

    college_name = get_college_name(conn, args.college_id)
    print(f"[Scraper] College name from DB: {college_name}")

    inserted = upsert_reviews(conn, args.college_id, reviews)
    print(f"[Scraper] Inserted {inserted} new review records (duplicates skipped).")

    summary = generate_summary(reviews, college_name)
    upsert_college_summary(conn, args.college_id, summary, avg_score)
    print(f"[Scraper] CollegeSummary upserted for college ID {args.college_id}.")

    conn.close()
    print("\n[Scraper] Done.\n")


if __name__ == "__main__":
    main()
