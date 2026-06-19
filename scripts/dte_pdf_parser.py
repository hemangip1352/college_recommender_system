#!/usr/bin/env python3
"""
DTE Maharashtra CAP Round Allotment PDF Parser
===============================================
Parses official DTE Maharashtra allotment PDF files and extracts cutoff data.

Supported PDF layouts (detected automatically):
  - New-style (post-2020): columns are Choice Code | Name | Seat Type | Category | Percentile | Rank
  - Legacy style: Choice Code | Seat Type | Category | Percentile (no rank column)

Usage:
    python scripts/dte_pdf_parser.py --pdf path/to/allotment.pdf --year 2024 --round 1
    python scripts/dte_pdf_parser.py --pdf path/to/allotment.pdf --year 2023 --round 2 --output cutoffs_2023_r2.json

Dependencies:
    pip install PyMuPDF python-dotenv psycopg2-binary

Output JSON schema:
    [
        {
            "choice_code": "412519110",
            "college_code": "4125",
            "branch_code": "19",
            "seat_type": "GOPENH",           # e.g., GOPENH, LOBCO, TFWSH, EWSCO, etc.
            "category": "OPEN",
            "gender": "G",
            "percentile": 94.2345,
            "cutoff_rank": 1234,             # null if not present in PDF
            "year": 2024,
            "round": 1,
            "is_home_university": true       # derived from seat_type suffix H vs O
        },
        ...
    ]
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print(
        "Error: PyMuPDF not installed.\n"
        "Run: pip install PyMuPDF\n"
        "Documentation: https://pymupdf.readthedocs.io/"
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# DTE seat type codes and their human-readable meaning
# The LAST character of the code encodes Home University (H) vs Other (O):
#   H = Home University quota (e.g., GOPENH = General Open Home University)
#   O = Outside Home University quota (e.g., GOPENCO = General Open Other/Caste)
# Special codes that don't follow the H/O suffix pattern are listed explicitly.
SEAT_TYPE_MAP = {
    "GOPENH": {"category": "OPEN", "gender": "G", "hu": True},
    "LOPENO": {"category": "OPEN", "gender": "G", "hu": False},
    "LOBCO":  {"category": "OBC", "gender": "G", "hu": False},
    "LOBCH":  {"category": "OBC", "gender": "G", "hu": True},
    "LSCH":   {"category": "SC", "gender": "G", "hu": True},
    "LSCO":   {"category": "SC", "gender": "G", "hu": False},
    "LSTH":   {"category": "ST", "gender": "G", "hu": True},
    "LSTO":   {"category": "ST", "gender": "G", "hu": False},
    "DEFOPEH": {"category": "DEF-OPEN", "gender": "G", "hu": True},
    "TFWS":   {"category": "TFWS", "gender": "G", "hu": None},   # Tuition-Fee Waiver – no HU split
    "PWDOPEH": {"category": "PwD-OPEN", "gender": "G", "hu": True},
    "EWSOPEH": {"category": "EWS-OPEN", "gender": "G", "hu": True},
    "EWSOPEO": {"category": "EWS-OPEN", "gender": "G", "hu": False},
}

# Regex patterns
CHOICE_CODE_RE = re.compile(r"^\d{9,12}$")    # Choice code is typically 9-12 digits
PERCENTILE_RE  = re.compile(r"^\d{1,2}\.\d+$")  # e.g., 94.2345
RANK_RE        = re.compile(r"^\d{1,6}$")       # Integer rank


# ---------------------------------------------------------------------------
# PDF Parsing
# ---------------------------------------------------------------------------

def extract_text_blocks(pdf_path: str) -> list[dict]:
    """
    Open the PDF and extract all text blocks page by page.
    Returns a flat list of {page, text, bbox} dicts.
    """
    doc = fitz.open(pdf_path)
    blocks = []
    for page_num, page in enumerate(doc):
        for block in page.get_text("blocks"):
            x0, y0, x1, y1, text, block_no, block_type = block
            text = text.strip()
            if text:
                blocks.append({
                    "page": page_num + 1,
                    "text": text,
                    "bbox": (x0, y0, x1, y1),
                })
    doc.close()
    return blocks


def extract_tables_via_words(pdf_path: str) -> list[list[str]]:
    """
    Extract tables from a PDF by grouping words by their Y-position (row) and
    sorting by X-position (column). This approach handles PDFs without explicit
    table borders.
    
    Returns a list of rows, where each row is a list of cell strings.
    """
    doc = fitz.open(pdf_path)
    all_rows: list[list[str]] = []

    for page in doc:
        words = page.get_text("words")  # (x0, y0, x1, y1, word, block_no, line_no, word_no)

        if not words:
            continue

        # Group words by approximate Y position (±3pt tolerance)
        row_map: dict[int, list[tuple[float, str]]] = {}
        for (x0, y0, x1, y1, word, *_) in words:
            # Round y0 to nearest 3 to cluster words on the same visual line
            y_key = int(round(y0 / 3.0)) * 3
            if y_key not in row_map:
                row_map[y_key] = []
            row_map[y_key].append((x0, word))

        for y_key in sorted(row_map.keys()):
            # Sort each row's words left-to-right
            row_words = sorted(row_map[y_key], key=lambda w: w[0])
            row_text = [w for _, w in row_words]
            all_rows.append(row_text)

    doc.close()
    return all_rows


def detect_header_row(rows: list[list[str]]) -> int:
    """
    Find the index of the header row by looking for rows containing keywords
    like 'Choice', 'Seat', 'Percentile', 'Rank', etc.
    Returns -1 if not found.
    """
    header_keywords = {"choice", "seat", "percentile", "category", "rank", "code"}
    for i, row in enumerate(rows):
        row_lower = {cell.lower() for cell in row}
        if len(row_lower & header_keywords) >= 2:
            return i
    return -1


def parse_row_to_record(
    row: list[str],
    col_indices: dict[str, int | None],
    year: int,
    cap_round: int,
) -> dict | None:
    """
    Given a data row and column index mapping, extract a structured cutoff record.
    Returns None if the row doesn't look like a valid data row.
    """
    def get(col: str) -> str | None:
        idx = col_indices.get(col)
        if idx is None or idx >= len(row):
            return None
        return row[idx].strip()

    choice_code = get("choice_code")
    if not choice_code or not CHOICE_CODE_RE.match(choice_code):
        return None  # Not a data row

    # Derive college code from first 4 digits, branch code from next 2
    college_code = choice_code[:4]
    branch_code  = choice_code[4:6] if len(choice_code) >= 6 else "00"

    seat_type  = get("seat_type") or ""
    category   = get("category") or "OPEN"
    gender     = get("gender") or "G"

    # Parse percentile
    pct_str = get("percentile")
    try:
        percentile = float(pct_str) if pct_str else None
    except ValueError:
        percentile = None

    # Parse rank (optional)
    rank_str = get("rank")
    try:
        cutoff_rank = int(rank_str) if rank_str and RANK_RE.match(rank_str) else None
    except ValueError:
        cutoff_rank = None

    if percentile is None:
        return None

    # Determine if this is a Home University seat from the seat type code
    if seat_type in SEAT_TYPE_MAP:
        is_hu = SEAT_TYPE_MAP[seat_type].get("hu")
    elif seat_type.endswith("H"):
        is_hu = True
    elif seat_type.endswith("O"):
        is_hu = False
    else:
        is_hu = None  # Unknown / TFWS-style

    return {
        "choice_code":       choice_code,
        "college_code":      college_code,
        "branch_code":       branch_code,
        "seat_type":         seat_type,
        "category":          category,
        "gender":            gender,
        "percentile":        percentile,
        "cutoff_rank":       cutoff_rank,
        "year":              year,
        "round":             cap_round,
        "is_home_university": is_hu,
    }


def build_col_indices(header_row: list[str]) -> dict[str, int | None]:
    """
    Map logical column names to their 0-based index in the header row.
    Uses fuzzy keyword matching to be resilient across DTE PDF format variations.
    """
    col_indices: dict[str, int | None] = {
        "choice_code": None,
        "seat_type":   None,
        "category":    None,
        "gender":      None,
        "percentile":  None,
        "rank":        None,
    }

    for i, cell in enumerate(header_row):
        cell_lower = cell.lower()
        if "choice" in cell_lower or "code" in cell_lower:
            col_indices["choice_code"] = i
        elif "seat" in cell_lower and col_indices["seat_type"] is None:
            col_indices["seat_type"] = i
        elif "categ" in cell_lower:
            col_indices["category"] = i
        elif "gender" in cell_lower or "sex" in cell_lower:
            col_indices["gender"] = i
        elif "percentile" in cell_lower or "pct" in cell_lower:
            col_indices["percentile"] = i
        elif "rank" in cell_lower:
            col_indices["rank"] = i

    return col_indices


def parse_pdf(pdf_path: str, year: int, cap_round: int) -> list[dict]:
    """
    Main entry point for parsing a DTE allotment PDF.
    Returns a list of structured cutoff records.
    """
    print(f"[Parser] Opening: {pdf_path}")
    rows = extract_tables_via_words(pdf_path)
    print(f"[Parser] Extracted {len(rows)} raw rows from PDF")

    header_idx = detect_header_row(rows)
    if header_idx == -1:
        print("[Parser] WARNING: Could not detect header row. Attempting fallback heuristic.")
        # Fallback: assume columns are in standard DTE order
        col_indices = {
            "choice_code": 0,
            "seat_type":   2,
            "category":    3,
            "gender":      None,
            "percentile":  4,
            "rank":        5,
        }
        data_start = 0
    else:
        header_row = rows[header_idx]
        print(f"[Parser] Header detected at row {header_idx}: {header_row}")
        col_indices = build_col_indices(header_row)
        data_start = header_idx + 1

    records = []
    skipped = 0
    for row in rows[data_start:]:
        record = parse_row_to_record(row, col_indices, year, cap_round)
        if record:
            records.append(record)
        else:
            skipped += 1

    print(f"[Parser] Parsed {len(records)} valid records. Skipped {skipped} non-data rows.")
    return records


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_output(records: list[dict], output_path: str) -> None:
    """Write the parsed records to a JSON file."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    print(f"[Parser] Wrote {len(records)} records to: {output_path}")


def print_summary(records: list[dict]) -> None:
    """Print a short summary of what was parsed."""
    seat_types = {}
    for r in records:
        st = r["seat_type"]
        seat_types[st] = seat_types.get(st, 0) + 1

    print("\n--- Parsing Summary ---")
    print(f"Total records  : {len(records)}")
    print(f"Unique seat types: {len(seat_types)}")
    print("Seat type breakdown:")
    for st, count in sorted(seat_types.items(), key=lambda x: -x[1]):
        hu_flag = "HU" if records[0]["is_home_university"] else "OHU" if records else "?"
        print(f"  {st:15s}: {count:5d} records")
    print("-----------------------\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Parse DTE Maharashtra CAP allotment PDFs into structured JSON cutoff data."
    )
    parser.add_argument(
        "--pdf", required=True, help="Path to the DTE allotment PDF file"
    )
    parser.add_argument(
        "--year", type=int, required=True, help="Academic year (e.g., 2024)"
    )
    parser.add_argument(
        "--round", type=int, required=True, dest="cap_round",
        help="CAP round number (1, 2, or 3)"
    )
    parser.add_argument(
        "--output", default=None,
        help="Output JSON file path (default: cutoffs_<year>_r<round>.json)"
    )
    parser.add_argument(
        "--summary", action="store_true",
        help="Print a summary of parsed seat types to stdout"
    )
    args = parser.parse_args()

    pdf_path = args.pdf
    if not Path(pdf_path).exists():
        print(f"Error: PDF file not found: {pdf_path}")
        sys.exit(1)

    output_path = args.output or f"cutoffs_{args.year}_r{args.cap_round}.json"

    records = parse_pdf(pdf_path, args.year, args.cap_round)

    if args.summary:
        print_summary(records)

    write_output(records, output_path)


if __name__ == "__main__":
    main()
