#!/usr/bin/env python3
"""
DTE Maharashtra CAP Round ETL Master Pipeline
==============================================
Reads pipeline_config.json, parses each listed DTE allotment PDF,
maps choice codes to database college/branch IDs, and bulk-inserts
Cutoff rows with ON CONFLICT DO NOTHING idempotency.

Architecture (Separation of Concerns):
  - All volatile factual data (cutoffs) flows exclusively through
    PostgreSQL relational tables — NO LLM involvement.
  - This script is the single authoritative ETL entrypoint.

Usage:
    python scripts/run_pipeline.py
    python scripts/run_pipeline.py --config scripts/pipeline_config.json
    python scripts/run_pipeline.py --dry-run        # parse only, skip DB writes
    python scripts/run_pipeline.py --year 2024      # process only a specific year
    python scripts/run_pipeline.py --round 3        # process only a specific round

Dependencies:
    pip install PyMuPDF psycopg2-binary python-dotenv

Environment:
    DATABASE_URL must be set in .env or the OS environment.
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF not installed. Run: pip install PyMuPDF")
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
    pass  # dotenv is optional

# ---------------------------------------------------------------------------
# Constants — DTE PDF Seat Type Knowledge Base
# ---------------------------------------------------------------------------

# Seat type suffix conventions (last character determines HU/OHU eligibility):
#   H  → Home University seats          (e.g. GOPENH, LOBCH, LSCH)
#   O  → Other Home University seats    (e.g. GOPENO, LOBCO, LSCO)
#   S  → State-level / Autonomous seats (e.g. GOPENS — no HU distinction)
#   No suffix → Special schemes         (e.g. TFWS, AI, MI)

# Category normalization — DTE PDFs use abbreviations that must map to DB values
CATEGORY_NORM: dict[str, str] = {
    "OPEN":   "General",
    "GEN":    "General",
    "GENERAL":"General",
    "OBC":    "OBC",
    "LOBC":   "OBC",
    "SC":     "SC",
    "ST":     "ST",
    "VJ":     "VJ",
    "NT1":    "NT1",
    "NT2":    "NT2",
    "NT3":    "NT3",
    "OBC(A)": "OBC",
    "EWS":    "EWS",
    "SEBC":   "SEBC",
    "SBC":    "SBC",
    "PWD":    "PwD",
    "DEF":    "DEF",
    "TFWS":   "TFWS",
}

GENDER_NORM: dict[str, str] = {
    "M":      "M",
    "MALE":   "M",
    "F":      "F",
    "FEMALE": "F",
    "G":      "G",    # Gender-agnostic (most DTE rows use G)
}

# Regex patterns matching DTE allotment PDF data rows
CHOICE_CODE_RE = re.compile(r"^\d{9,12}$")
PERCENTILE_RE  = re.compile(r"^\d{1,2}\.\d{2,6}$")
RANK_RE        = re.compile(r"^\d{1,7}$")

# ---------------------------------------------------------------------------
# PDF Word Extraction (PyMuPDF)
# ---------------------------------------------------------------------------

def extract_rows_from_pdf(pdf_path: str) -> list[list[str]]:
    """
    Open the PDF with PyMuPDF and extract all text as row/column structure
    by grouping words by their approximate Y position (±4pt tolerance).

    Returns a list of rows, each row being a list of string tokens.
    """
    doc = fitz.open(pdf_path)
    all_rows: list[list[str]] = []

    for page in doc:
        words = page.get_text("words")
        if not words:
            continue

        # Group words by rounded Y coordinate
        row_map: dict[int, list[tuple[float, str]]] = {}
        for (x0, y0, x1, y1, word, *_) in words:
            y_key = int(round(y0 / 4.0)) * 4
            row_map.setdefault(y_key, []).append((x0, word.strip()))

        for y_key in sorted(row_map.keys()):
            sorted_words = sorted(row_map[y_key], key=lambda t: t[0])
            row_tokens = [w for _, w in sorted_words if w]
            if row_tokens:
                all_rows.append(row_tokens)

    doc.close()
    return all_rows


# ---------------------------------------------------------------------------
# Header Detection & Column Mapping
# ---------------------------------------------------------------------------

HEADER_KEYWORDS = {
    "choice", "code", "seat", "type", "category", "percentile",
    "rank", "gender", "name", "college", "branch"
}

def detect_header_index(rows: list[list[str]]) -> int:
    """Find the index of the table header row. Returns -1 if not found."""
    for i, row in enumerate(rows[:30]):  # Header will be in first 30 rows
        matched = sum(1 for token in row if token.lower() in HEADER_KEYWORDS)
        if matched >= 2:
            return i
    return -1


def build_column_map(header_row: list[str]) -> dict[str, Optional[int]]:
    """
    Map logical field names to 0-based column indices by fuzzy-matching
    header tokens against known DTE column name variants.
    """
    col = {
        "choice_code": None,
        "seat_type":   None,
        "category":    None,
        "gender":      None,
        "percentile":  None,
        "rank":        None,
        "branch_name": None,
        "college_name": None,
    }
    for i, token in enumerate(header_row):
        t = token.lower().strip()
        if ("choice" in t) or (t in ("code", "choicecode")):
            col["choice_code"] = i
        elif "seat" in t and "type" in t:
            col["seat_type"] = i
        elif "seat" in t and col["seat_type"] is None:
            col["seat_type"] = i
        elif "categ" in t:
            col["category"] = i
        elif "gender" in t or t == "sex":
            col["gender"] = i
        elif "percentile" in t or t in ("pct", "pctile"):
            col["percentile"] = i
        elif "rank" in t:
            col["rank"] = i
        elif "branch" in t:
            col["branch_name"] = i
        elif "college" in t and "name" in t:
            col["college_name"] = i
    return col


# ---------------------------------------------------------------------------
# Row Parsing
# ---------------------------------------------------------------------------

def parse_data_row(
    row: list[str],
    col: dict[str, Optional[int]],
    year: int,
    cap_round: int,
) -> Optional[dict]:
    """
    Parse a single data row into a structured cutoff record.
    Returns None if the row is not a valid data row (e.g., a sub-header).
    """
    def get(field: str) -> Optional[str]:
        idx = col.get(field)
        if idx is None or idx >= len(row):
            return None
        return row[idx].strip() or None

    # Primary validity check: choice_code must be a digit string
    choice_code = get("choice_code")
    if not choice_code or not CHOICE_CODE_RE.match(choice_code):
        return None

    # DTE choice code structure: CCCCBBSSSS
    #   CCCC = 4-digit college code
    #   BB   = 2-digit branch code (internal DTE numbering)
    college_code = choice_code[:4]
    branch_code  = choice_code[4:6] if len(choice_code) >= 6 else "00"

    seat_type_raw = get("seat_type") or ""
    seat_type     = seat_type_raw.upper().strip()

    # Normalize category
    category_raw  = (get("category") or "OPEN").upper().strip()
    # Extract category from seat_type if not in its own column
    if not category_raw or category_raw == "OPEN":
        # Many DTE PDFs embed category in seat type (e.g., LOBCO → OBC + O-suffix)
        for key in CATEGORY_NORM:
            if key in seat_type:
                category_raw = key
                break
    category = CATEGORY_NORM.get(category_raw, category_raw.capitalize())

    # Gender normalization
    gender_raw = (get("gender") or "G").upper().strip()
    gender     = GENDER_NORM.get(gender_raw, "G")

    # Percentile
    pct_str = get("percentile")
    try:
        percentile = float(pct_str) if pct_str and PERCENTILE_RE.match(pct_str) else None
    except (ValueError, TypeError):
        percentile = None

    if percentile is None:
        return None  # Percentile is mandatory

    # Rank (optional)
    rank_str = get("rank")
    try:
        cutoff_rank = int(rank_str) if rank_str and RANK_RE.match(rank_str) else None
    except (ValueError, TypeError):
        cutoff_rank = None

    # Resolve HU/OHU/State from seat type suffix
    upper = seat_type.upper()
    if upper.endswith("H"):
        hu_flag = "H"
    elif upper.endswith("O"):
        hu_flag = "O"
    elif upper.endswith("S"):
        hu_flag = "S"   # State-level autonomous allocation
    else:
        hu_flag = None  # Special scheme (TFWS, AI, etc.)

    return {
        "choice_code":  choice_code,
        "college_code": college_code,
        "branch_code":  branch_code,
        "seat_type":    seat_type,
        "category":     category,
        "gender":       gender,
        "percentile":   percentile,
        "cutoff_rank":  cutoff_rank,
        "hu_flag":      hu_flag,
        "year":         year,
        "round":        cap_round,
    }


# ---------------------------------------------------------------------------
# PDF → Records
# ---------------------------------------------------------------------------

def parse_pdf(pdf_path: str, year: int, cap_round: int) -> list[dict]:
    """Full pipeline: PDF file → list of parsed cutoff dicts."""
    print(f"  [PDF] Opening {pdf_path} …")
    rows = extract_rows_from_pdf(pdf_path)
    print(f"  [PDF] Extracted {len(rows)} raw rows")

    header_idx = detect_header_index(rows)
    if header_idx >= 0:
        col = build_column_map(rows[header_idx])
        data_rows = rows[header_idx + 1:]
        print(f"  [PDF] Header at row {header_idx}: {rows[header_idx]}")
    else:
        # Fallback: assume standard DTE column order
        print("  [PDF] WARNING: no header detected — using default column layout")
        col = {
            "choice_code": 0,
            "seat_type":   2,
            "category":    3,
            "gender":      None,
            "percentile":  4,
            "rank":        5,
            "branch_name": None,
            "college_name": None,
        }
        data_rows = rows

    records = []
    skipped = 0
    for row in data_rows:
        rec = parse_data_row(row, col, year, cap_round)
        if rec:
            records.append(rec)
        else:
            skipped += 1

    print(f"  [PDF] Parsed {len(records)} valid rows, skipped {skipped}")
    return records


# ---------------------------------------------------------------------------
# Database Operations
# ---------------------------------------------------------------------------

def get_connection() -> "psycopg2.connection":
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not set.")
        sys.exit(1)
    return psycopg2.connect(db_url)


def build_lookup_maps(conn) -> tuple[dict[str, int], dict[tuple[int, str], int]]:
    """
    Build two in-memory lookup maps from the DB:
      college_map: { college_code_str → college_id }
      branch_map:  { (college_id, branch_name) → branch_id }

    These are used to translate DTE choice-code segments into DB primary keys.
    """
    with conn.cursor() as cur:
        cur.execute('SELECT "collegeCode", id FROM "College"')
        college_map: dict[str, int] = {row[0]: row[1] for row in cur.fetchall()}

        cur.execute('SELECT "collegeId", "branchName", id FROM "Branch"')
        branch_map: dict[tuple[int, str], int] = {
            (row[0], row[1]): row[2] for row in cur.fetchall()
        }

    return college_map, branch_map


def resolve_branch_id(
    conn,
    college_id: int,
    branch_code: str,
    branch_map: dict[tuple[int, str], int],
) -> Optional[int]:
    """
    Attempt to resolve a branch ID from (college_id, branch_code).
    
    DTE branch codes are numeric (e.g., "19") and don't directly correspond
    to branch names stored in the DB. Strategy:
      1. If a branch named exactly branch_code exists → use it (edge case)
      2. Fallback: return the first branch ID for this college
         (most colleges have one primary branch per student view)
    """
    # Try exact numeric code match first
    key = (college_id, branch_code)
    if key in branch_map:
        return branch_map[key]

    # Fallback: grab the lowest branch_id for this college
    college_branches = [bid for (cid, _), bid in branch_map.items() if cid == college_id]
    if college_branches:
        return min(college_branches)

    return None


def bulk_insert_cutoffs(
    conn,
    records: list[dict],
    college_map: dict[str, int],
    branch_map: dict[tuple[int, str], int],
    year: int,
    cap_round: int,
) -> tuple[int, int]:
    """
    Resolve all records to DB IDs and bulk-insert into the Cutoff table.
    Returns (inserted_count, skipped_count).
    """
    rows_to_insert = []
    unresolved = 0

    for rec in records:
        college_id = college_map.get(rec["college_code"])
        if college_id is None:
            unresolved += 1
            continue

        branch_id = resolve_branch_id(
            conn, college_id, rec["branch_code"], branch_map
        )
        if branch_id is None:
            unresolved += 1
            continue

        rows_to_insert.append((
            college_id,
            branch_id,
            rec["year"],
            rec["round"],
            rec["category"],
            rec["gender"],
            rec["seat_type"],
            rec["percentile"],
            rec["cutoff_rank"],
        ))

    if not rows_to_insert:
        return 0, unresolved

    insert_sql = """
        INSERT INTO "Cutoff"
            ("collegeId", "branchId", year, round, category, gender, "seatType", percentile, "cutoffRank")
        VALUES %s
        ON CONFLICT ("collegeId", "branchId", year, round, category, gender, "seatType")
        DO NOTHING
    """

    with conn.cursor() as cur:
        execute_values(cur, insert_sql, rows_to_insert, page_size=500)

    conn.commit()

    inserted = len(rows_to_insert)
    print(f"    → Inserted up to {inserted} rows ({unresolved} unresolved college/branch codes)")
    return inserted, unresolved


# ---------------------------------------------------------------------------
# Pipeline Orchestration
# ---------------------------------------------------------------------------

def run_pipeline(
    config_path: str,
    dry_run: bool = False,
    year_filter: Optional[int] = None,
    round_filter: Optional[int] = None,
) -> None:
    """
    Main orchestration loop: iterate through pipeline_config.json,
    parse each PDF, and write cutoff rows to the database.
    """
    config_file = Path(config_path)
    if not config_file.exists():
        print(f"Error: Config not found: {config_path}")
        sys.exit(1)

    with config_file.open(encoding="utf-8") as f:
        pipeline = json.load(f)

    print(f"\n{'='*60}")
    print(f" DTE CAP Pipeline — {len(pipeline)} entries in config")
    print(f"{'='*60}\n")

    # Establish DB connection (outside loop to reuse)
    conn = None if dry_run else get_connection()
    college_map, branch_map = ({}, {}) if dry_run else build_lookup_maps(conn)

    if not dry_run:
        print(f"[DB] Loaded {len(college_map)} colleges, {len(branch_map)} branches from database\n")

    total_records   = 0
    total_inserted  = 0
    total_skipped   = 0
    processed_files = 0
    failed_files    = 0

    for entry in pipeline:
        year      = entry["year"]
        cap_round = entry["round"]
        path      = entry["path"]
        source    = entry.get("source_type", "local")
        desc      = entry.get("description", f"{year} Round {cap_round}")

        # Apply CLI filters
        if year_filter is not None and year != year_filter:
            continue
        if round_filter is not None and cap_round != round_filter:
            continue

        print(f"[ENTRY] {desc}")
        print(f"        Year={year}  Round={cap_round}  Source={source}")
        print(f"        Path: {path}")

        if source == "local":
            pdf_path = Path(path)
            if not pdf_path.exists():
                print(f"  [WARN] File not found: {path} — skipping\n")
                failed_files += 1
                continue
        else:
            print(f"  [WARN] source_type='{source}' is not supported in this version — skipping\n")
            failed_files += 1
            continue

        # Parse PDF
        try:
            records = parse_pdf(str(pdf_path), year, cap_round)
        except Exception as e:
            print(f"  [ERROR] Failed to parse PDF: {e}")
            failed_files += 1
            continue

        total_records += len(records)

        if dry_run:
            print(f"  [DRY RUN] Would insert up to {len(records)} cutoff rows\n")
            processed_files += 1
            continue

        # DB write
        try:
            inserted, unresolved = bulk_insert_cutoffs(
                conn, records, college_map, branch_map, year, cap_round
            )
            total_inserted += inserted
            total_skipped  += unresolved
            processed_files += 1
        except Exception as e:
            print(f"  [ERROR] DB write failed: {e}")
            conn.rollback()
            failed_files += 1

        print()

    # Summary
    if conn:
        conn.close()

    print(f"\n{'='*60}")
    print(f" Pipeline Complete")
    print(f"{'='*60}")
    print(f"  Files processed : {processed_files}")
    print(f"  Files failed    : {failed_files}")
    print(f"  Total records   : {total_records}")
    if not dry_run:
        print(f"  Rows inserted   : {total_inserted}")
        print(f"  Rows skipped    : {total_skipped} (unresolved college/branch codes)")
    print()


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="DTE Maharashtra CAP Round ETL Pipeline — bulk-inserts cutoff data from allotment PDFs"
    )
    parser.add_argument(
        "--config", default="scripts/pipeline_config.json",
        help="Path to pipeline_config.json (default: scripts/pipeline_config.json)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse PDFs and report counts without writing to the database"
    )
    parser.add_argument(
        "--year", type=int, default=None,
        help="Process only entries matching this academic year"
    )
    parser.add_argument(
        "--round", type=int, default=None, dest="cap_round",
        help="Process only entries matching this CAP round number (1, 2, or 3)"
    )

    args = parser.parse_args()

    run_pipeline(
        config_path=args.config,
        dry_run=args.dry_run,
        year_filter=args.year,
        round_filter=args.cap_round,
    )


if __name__ == "__main__":
    main()
