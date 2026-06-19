#!/usr/bin/env python3
"""
Batch College Review Scraper & Sentiment Processor
====================================================
Reads a CSV mapping file (data/urls.csv) containing college IDs and their
review page URLs, scrapes qualitative review text in batches using BeautifulSoup,
scores each review with a keyword-based sentiment engine, and writes the
results deterministically to the Review and CollegeSummary tables.

This script operates strictly on qualitative text (student reviews).
The LLM API is intentionally NOT called here — the AI summarization route
(/api/ai-summary) is invoked separately and only after text data is populated.

CSV schema (data/urls.csv):
    college_id,review_url,site_type,notes
    1,https://www.shiksha.com/college/coep-reviews,shiksha,COEP Pune
    2,https://collegedunia.com/college/2-vit-pune/reviews,collegedunia,VIT Pune
    3,https://www.shiksha.com/college/dyp-reviews,shiksha,DYP Institute

Supported site_type values:
    shiksha, collegedunia, generic

Usage:
    python scripts/batch_scraper.py
    python scripts/batch_scraper.py --csv data/urls.csv
    python scripts/batch_scraper.py --college-id 5       # Only college ID 5
    python scripts/batch_scraper.py --dry-run            # No DB writes
    python scripts/batch_scraper.py --max-pages 3        # Limit pagination

Dependencies:
    pip install requests beautifulsoup4 lxml psycopg2-binary python-dotenv

Environment:
    DATABASE_URL must be set in .env or the OS environment.
"""

import argparse
import csv
import os
import re
import sys
import time
import random
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Error: requests/beautifulsoup4 not installed.\nRun: pip install requests beautifulsoup4 lxml")
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Sentiment Lexicon
# ---------------------------------------------------------------------------

# Positive signals weighted 0–1 by strength
POSITIVE: dict[str, float] = {
    "excellent": 0.90, "outstanding": 0.90, "exceptional": 0.90,
    "amazing": 0.88, "fantastic": 0.85, "superb": 0.85, "brilliant": 0.85,
    "great": 0.80, "wonderful": 0.80, "terrific": 0.80,
    "good": 0.65, "nice": 0.60, "decent": 0.55, "fine": 0.50,
    "helpful": 0.70, "knowledgeable": 0.75, "supportive": 0.70,
    "friendly": 0.65, "cooperative": 0.60, "dedicated": 0.70,
    "modern": 0.60, "well-equipped": 0.75, "equipped": 0.60,
    "placed": 0.68, "hired": 0.68, "recruited": 0.65, "selected": 0.60,
    "lakh": 0.55, "package": 0.50, "salary": 0.50, "offer": 0.50,
    "recommend": 0.88, "satisfied": 0.82, "happy": 0.78, "proud": 0.72,
    "clean": 0.60, "safe": 0.62, "affordable": 0.65, "scholarship": 0.62,
    "opportunity": 0.60, "exposure": 0.60, "internship": 0.58,
    "vibrant": 0.65, "active": 0.55, "fun": 0.60, "enjoyable": 0.65,
    "best": 0.82, "top": 0.65, "prestigious": 0.75, "reputed": 0.70,
    "improve": 0.45, "improved": 0.55, "growing": 0.50,
}

# Negative signals weighted 0–1 by strength
NEGATIVE: dict[str, float] = {
    "bad": 0.75, "poor": 0.75, "terrible": 0.90, "awful": 0.90,
    "horrible": 0.90, "worst": 0.95, "pathetic": 0.90, "useless": 0.85,
    "waste": 0.80, "disappointed": 0.80, "disappointing": 0.80,
    "dissatisfied": 0.80, "unhappy": 0.75, "frustrating": 0.75,
    "outdated": 0.70, "obsolete": 0.75, "old": 0.40,
    "corrupt": 0.92, "bribe": 0.95, "ragging": 0.98, "unsafe": 0.88,
    "expensive": 0.58, "overpriced": 0.72,
    "unemployed": 0.88, "unplaced": 0.90, "jobless": 0.90,
    "fake": 0.92, "fraud": 0.95, "misleading": 0.88, "cheating": 0.92,
    "rude": 0.78, "incompetent": 0.82, "careless": 0.72,
    "dirty": 0.72, "unhygienic": 0.82, "overcrowded": 0.55,
    "politics": 0.68, "favouritism": 0.75, "nepotism": 0.78,
    "backlog": 0.72, "detention": 0.68, "pressure": 0.52,
    "average": 0.35, "mediocre": 0.68, "below": 0.40,
    "never": 0.45, "nothing": 0.50, "nobody": 0.45,
}

# Negation window — flip adjacent sentiment within a 2-word lookback
NEGATIONS = {
    "not", "no", "never", "without", "barely", "hardly",
    "scarcely", "neither", "nor", "don't", "doesn't", "didn't",
    "won't", "wouldn't", "isn't", "aren't", "wasn't", "weren't",
}


def score_text(text: str) -> float:
    """
    Compute a sentiment score in [0, 1] for the given review text.
    > 0.60 → Positive
    0.40–0.60 → Neutral
    < 0.40 → Negative

    Uses a negation-aware keyword matching approach:
    - If a word is preceded within 2 tokens by a negation word,
      its sentiment contribution is flipped and dampened.
    """
    tokens = re.findall(r"\b[a-zA-Z']+\b", text.lower())
    pos = 0.0
    neg = 0.0

    for i, token in enumerate(tokens):
        # Check for negation in a 2-token look-back window
        window = tokens[max(0, i - 2): i]
        negated = any(w in NEGATIONS for w in window)

        if token in POSITIVE:
            w = POSITIVE[token]
            pos += w * (0.15 if negated else 1.0)
            neg += w * (0.70 if negated else 0.0)
        elif token in NEGATIVE:
            w = NEGATIVE[token]
            neg += w * (0.15 if negated else 1.0)
            pos += w * (0.60 if negated else 0.0)

    total = pos + neg
    if total < 0.01:
        return 0.5  # No detectable sentiment signals

    score = pos / total
    return round(min(0.95, max(0.05, score)), 4)


def aggregate_sentiment(scores: list[float]) -> float:
    if not scores:
        return 0.5
    return round(sum(scores) / len(scores), 4)


def build_summary(reviews: list[dict], college_name: str) -> str:
    """
    Construct a deterministic text summary from scraped and scored reviews.
    This is a factual aggregation pass — no LLM involved.
    The AI summarization endpoint (/api/ai-summary) may optionally be called
    separately to refine this into a more natural language output.
    """
    n = len(reviews)
    if n == 0:
        return f"No reviews found for {college_name}."

    scores = [r["sentiment_score"] for r in reviews]
    avg = aggregate_sentiment(scores)
    pos_n = sum(1 for s in scores if s > 0.6)
    neg_n = sum(1 for s in scores if s < 0.4)
    neu_n = n - pos_n - neg_n

    tone = "predominantly positive" if avg > 0.6 else "mixed" if avg >= 0.4 else "generally critical"
    pct_pos = round(pos_n / n * 100)
    pct_neg = round(neg_n / n * 100)

    top_pos = sorted(
        [r for r in reviews if r["sentiment_score"] > 0.6],
        key=lambda r: -r["sentiment_score"]
    )
    top_neg = sorted(
        [r for r in reviews if r["sentiment_score"] < 0.4],
        key=lambda r: r["sentiment_score"]
    )

    snippets = []
    if top_pos:
        t = top_pos[0]["text"]
        snippets.append(
            f'Students frequently highlight: "{t[:130]}{"…" if len(t) > 130 else ""}"'
        )
    if top_neg:
        t = top_neg[0]["text"]
        snippets.append(
            f'Reported concerns include: "{t[:130]}{"…" if len(t) > 130 else ""}"'
        )

    body = " ".join(snippets)
    return (
        f"Based on {n} reviews, {college_name} has {tone} student sentiment "
        f"({pct_pos}% positive, {pct_neg}% negative, {100 - pct_pos - pct_neg}% neutral). "
        + body
    )


# ---------------------------------------------------------------------------
# HTTP Fetcher
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def fetch_html(url: str, timeout: int = 20) -> Optional[BeautifulSoup]:
    """Fetch a URL and return a BeautifulSoup object, or None on failure."""
    try:
        resp = SESSION.get(url, timeout=timeout, allow_redirects=True)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "lxml")
    except requests.RequestException as e:
        print(f"    [HTTP] Failed: {url} → {e}")
        return None


def polite_sleep() -> None:
    """
    Random sleep between 2 and 5 seconds between network requests
    to avoid IP throttling and respect server rate limits.
    """
    delay = random.uniform(2.0, 5.0)
    time.sleep(delay)


# ---------------------------------------------------------------------------
# Site-Specific Scrapers
# ---------------------------------------------------------------------------

def _extract_reviews_from_soup(
    soup: BeautifulSoup,
    text_selectors: list[str],
    author_selectors: list[str],
) -> list[dict]:
    """
    Generic review extractor: tries each CSS selector in priority order,
    normalizes author type, and scores each review text.
    """
    reviews = []

    for sel in text_selectors:
        elements = soup.select(sel)
        if elements:
            for el in elements:
                text = el.get_text(separator=" ", strip=True)
                if len(text) < 25:
                    continue

                author_type = "Student"
                for asel in author_selectors:
                    # Try within element, then in parent
                    a_el = el.select_one(asel) or (
                        el.parent.select_one(asel) if el.parent else None
                    )
                    if a_el:
                        raw = a_el.get_text(strip=True).lower()
                        if "alumni" in raw or "pass out" in raw:
                            author_type = "Alumni"
                        elif "faculty" in raw or "staff" in raw or "professor" in raw:
                            author_type = "Faculty"
                        break

                reviews.append({
                    "text": text,
                    "source": author_type,
                    "sentiment_score": score_text(text),
                })
            break  # Stop after first selector that produces results

    return reviews


def scrape_shiksha(url: str, max_pages: int) -> list[dict]:
    reviews: list[dict] = []
    for page in range(1, max_pages + 1):
        page_url = f"{url}?page={page}" if page > 1 else url
        print(f"    [Shiksha] Page {page}: {page_url}")
        soup = fetch_html(page_url)
        if soup is None:
            break

        batch = _extract_reviews_from_soup(
            soup,
            text_selectors=[
                "div.reviewCard p",
                "p.reviewText",
                "div[class*='review-text']",
                "div[class*='reviewText']",
                "div[class*='review_desc'] p",
            ],
            author_selectors=[
                "span[class*='authorType']",
                "span[class*='reviewer-type']",
                "p[class*='user_type']",
            ],
        )
        if not batch:
            print(f"    [Shiksha] No reviews on page {page} — stopping")
            break
        reviews.extend(batch)
        if page < max_pages:
            polite_sleep()

    return reviews


def scrape_collegedunia(url: str, max_pages: int) -> list[dict]:
    reviews: list[dict] = []
    for page in range(1, max_pages + 1):
        page_url = f"{url}?page={page}" if page > 1 else url
        print(f"    [CollegeDunia] Page {page}: {page_url}")
        soup = fetch_html(page_url)
        if soup is None:
            break

        batch = _extract_reviews_from_soup(
            soup,
            text_selectors=[
                "div.review_desc p",
                "li[class*='review-item'] p",
                "div[class*='reviewItem'] p",
                "div[class*='review-desc'] p",
                "div[class*='reviewDesc']",
            ],
            author_selectors=[
                "span[class*='user-type']",
                "p[class*='user_type']",
                "div[class*='authorInfo']",
            ],
        )
        if not batch:
            print(f"    [CollegeDunia] No reviews on page {page} — stopping")
            break
        reviews.extend(batch)
        if page < max_pages:
            polite_sleep()

    return reviews


def scrape_generic(url: str, max_pages: int) -> list[dict]:
    """
    Generic fallback scraper: pulls any paragraph or div text that looks
    like a review (length > 40 chars, doesn't look like a nav element).
    """
    reviews: list[dict] = []
    for page in range(1, max_pages + 1):
        page_url = f"{url}?page={page}" if page > 1 else url
        print(f"    [Generic] Page {page}: {page_url}")
        soup = fetch_html(page_url)
        if soup is None:
            break

        batch = _extract_reviews_from_soup(
            soup,
            text_selectors=[
                "p.review, div.review-text, .reviewText",
                "div[class*='review'] p",
                "li[class*='review'] p",
                "article p",
                "div[class*='comment'] p",
            ],
            author_selectors=[
                "span[class*='type']",
                "p[class*='type']",
                "span[class*='role']",
            ],
        )
        if not batch:
            break
        reviews.extend(batch)
        if page < max_pages:
            polite_sleep()

    return reviews


# ---------------------------------------------------------------------------
# Scraper Dispatcher
# ---------------------------------------------------------------------------

SCRAPERS = {
    "shiksha":     scrape_shiksha,
    "collegedunia": scrape_collegedunia,
    "generic":     scrape_generic,
}

def scrape_college_reviews(url: str, site_type: str, max_pages: int) -> list[dict]:
    fn = SCRAPERS.get(site_type.lower(), scrape_generic)
    return fn(url, max_pages)


# ---------------------------------------------------------------------------
# Database Operations
# ---------------------------------------------------------------------------

def get_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not set.")
        sys.exit(1)
    return psycopg2.connect(db_url)


def get_college_name(conn, college_id: int) -> str:
    with conn.cursor() as cur:
        cur.execute('SELECT "collegeName" FROM "College" WHERE id = %s', (college_id,))
        row = cur.fetchone()
        return row[0] if row else f"College #{college_id}"


def upsert_reviews(conn, college_id: int, reviews: list[dict]) -> int:
    """
    Insert review records. Each review is uniquely identified by (collegeId + reviewText hash).
    ON CONFLICT DO NOTHING prevents duplicate insertions on re-runs.
    """
    inserted = 0
    with conn.cursor() as cur:
        for r in reviews:
            cur.execute(
                """
                INSERT INTO "Review" ("collegeId", source, "reviewText", "sentimentScore", "createdAt")
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (college_id, r["source"], r["text"], r["sentiment_score"]),
            )
            if cur.fetchone():
                inserted += 1
    conn.commit()
    return inserted


def upsert_summary(conn, college_id: int, summary: str, sentiment: float) -> None:
    """Upsert CollegeSummary with the latest aggregated summary and sentiment score."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "CollegeSummary"
                ("collegeId", summary, "sentimentScore", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT ("collegeId") DO UPDATE
                SET summary        = EXCLUDED.summary,
                    "sentimentScore" = EXCLUDED."sentimentScore",
                    "updatedAt"    = NOW()
            """,
            (college_id, summary, sentiment),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# CSV Loading
# ---------------------------------------------------------------------------

def load_csv(csv_path: str) -> list[dict]:
    """
    Parse the CSV mapping file.

    Expected columns (case-insensitive):
        college_id, review_url, site_type, notes (optional)

    Returns a list of row dicts with keys: college_id (int), review_url, site_type.
    """
    path = Path(csv_path)
    if not path.exists():
        print(f"Error: CSV file not found: {csv_path}")
        sys.exit(1)

    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Normalise key names
            normalised = {k.strip().lower(): v.strip() for k, v in row.items()}
            try:
                college_id = int(normalised["college_id"])
                review_url = normalised["review_url"]
                site_type  = normalised.get("site_type", "generic")
                rows.append({
                    "college_id": college_id,
                    "review_url": review_url,
                    "site_type":  site_type,
                    "notes":      normalised.get("notes", ""),
                })
            except (KeyError, ValueError) as e:
                print(f"[CSV] Skipping malformed row {row}: {e}")

    return rows


# ---------------------------------------------------------------------------
# Batch Orchestration
# ---------------------------------------------------------------------------

def run_batch(
    csv_path: str,
    max_pages: int,
    dry_run: bool,
    college_id_filter: Optional[int],
) -> None:
    entries = load_csv(csv_path)
    if college_id_filter is not None:
        entries = [e for e in entries if e["college_id"] == college_id_filter]

    if not entries:
        print("No entries to process.")
        return

    print(f"\n{'='*60}")
    print(f" Batch Review Scraper — {len(entries)} colleges to process")
    print(f"{'='*60}\n")

    conn = None if dry_run else get_connection()

    total_reviews = 0
    total_inserted = 0

    for i, entry in enumerate(entries, start=1):
        cid      = entry["college_id"]
        url      = entry["review_url"]
        site     = entry["site_type"]
        notes    = entry["notes"]

        print(f"[{i}/{len(entries)}] College ID {cid} ({notes})")
        print(f"         Site: {site}  |  URL: {url}")

        # Scrape
        reviews = scrape_college_reviews(url, site, max_pages)
        total_reviews += len(reviews)
        print(f"         Scraped: {len(reviews)} reviews")

        if not reviews:
            print("         → No reviews found, skipping DB write\n")
            if i < len(entries):
                polite_sleep()
            continue

        # Sentiment aggregation
        avg_sentiment = aggregate_sentiment([r["sentiment_score"] for r in reviews])
        print(f"         Avg sentiment: {avg_sentiment:.4f}")

        if dry_run:
            print("         [DRY RUN] Skipping DB write\n")
        else:
            college_name = get_college_name(conn, cid)
            inserted = upsert_reviews(conn, cid, reviews)
            total_inserted += inserted
            print(f"         Inserted: {inserted} new review rows")

            summary = build_summary(reviews, college_name)
            upsert_summary(conn, cid, summary, avg_sentiment)
            print(f"         CollegeSummary upserted\n")

        # Polite delay between colleges (not needed after last entry)
        if i < len(entries):
            delay = random.uniform(2.0, 5.0)
            print(f"         Sleeping {delay:.1f}s …")
            time.sleep(delay)

    if conn:
        conn.close()

    print(f"\n{'='*60}")
    print(f" Batch Complete")
    print(f"{'='*60}")
    print(f"  Colleges processed : {len(entries)}")
    print(f"  Total reviews      : {total_reviews}")
    if not dry_run:
        print(f"  New rows inserted  : {total_inserted}")
    print()


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Batch scrape college review pages and populate Review + CollegeSummary tables."
        )
    )
    parser.add_argument(
        "--csv", default="data/urls.csv",
        help="Path to the CSV mapping file (default: data/urls.csv)"
    )
    parser.add_argument(
        "--max-pages", type=int, default=5,
        help="Maximum pagination pages to scrape per college (default: 5)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Scrape and score reviews without writing to the database"
    )
    parser.add_argument(
        "--college-id", type=int, default=None, dest="college_id",
        help="Process only the specified college ID from the CSV"
    )
    args = parser.parse_args()

    run_batch(
        csv_path=args.csv,
        max_pages=args.max_pages,
        dry_run=args.dry_run,
        college_id_filter=args.college_id,
    )


if __name__ == "__main__":
    main()
