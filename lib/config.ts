// Tier classification thresholds (configurable)
export const TIER_THRESHOLDS = {
  DREAM: 3, // 3 percentile points below cutoff
  TARGET: 1.5, // 1.5 percentile points below cutoff
  SAFE: 0, // Equal or above cutoff
};

// Priority weights mapping
export const PRIORITY_WEIGHTS: Record<number, number> = {
  1: 8,
  2: 7,
  3: 6,
  4: 5,
  5: 4,
  6: 3,
  7: 2,
  8: 1,
};

// Score normalization range
export const SCORE_RANGE = {
  MIN: 0,
  MAX: 100,
};

// Metrics used in scoring
export const METRICS = [
  "placement",
  "campusLife",
  "infrastructure",
  "teaching",
  "hostel",
  "fees",
  "location",
  "industryExposure",
];

// Categories for CAP system
export const CATEGORIES = [
  "General",
  "SC",
  "ST",
  "OBC",
  "SEBC",
  "PwD",
];

// Gender options
export const GENDERS = ["M", "F", "Other"];

// Seat types
export const SEAT_TYPES = ["Unreserved", "Reserved"];

// Maharashtra universities
export const UNIVERSITIES = [
  "University of Pune",
  "Savitribai Phule Pune University",
  "Nagpur University",
  "Dr. Babasaheb Ambedkar Marathwada University",
  "Shivaji University",
  "North Maharashtra University",
  "Rashtrasant Tukadoji Maharaj Nagpur University",
  "Symbiosis International University",
  "MIT ADT University",
];

// Branch preferences
export const BRANCHES = [
  "Computer Science",
  "Information Technology",
  "Electronics and Telecommunication",
  "Electrical",
  "Mechanical",
  "Civil",
  "Production",
  "Instrumentation",
  "Aeronautical",
  "Biomedical",
];

// Major cities in Maharashtra
export const CITIES = [
  "Pune",
  "Mumbai",
  "Nagpur",
  "Nashik",
  "Aurangabad",
  "Jalgaon",
  "Solapur",
  "Satara",
  "Kolhapur",
  "Sangli",
  "Ratnagiri",
  "Sindhudurg",
];

// Gemini configuration
export const GEMINI_CONFIG = {
  MODEL: "gemini-1.5-flash",
  MAX_OUTPUT_TOKENS: 200,
  TEMPERATURE: 0.3,
};

// Cache settings
export const CACHE_SETTINGS = {
  SUMMARY_TTL: 7 * 24 * 60 * 60, // 7 days in seconds
};
