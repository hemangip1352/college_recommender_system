# Maharashtra Engineering College Recommender & CAP Decision Assistant

A trustworthy, data-driven platform that helps students make informed decisions about which engineering college to choose based on their Maharashtra CAP admission profile.

## Features

### 🎯 Smart Filtering Engine
- Filter colleges by category, gender, home university, and branch preferences
- Respects Maharashtra CAP admission system rules
- Distinguishes between home university and outside home university colleges

### 🎓 Three-Tier Recommendation System
- **Dream Colleges**: Slightly below your historical cutoff range
- **Target Colleges**: Close to your historical cutoff range
- **Safe Colleges**: Well above your cutoff range

### 📊 Comprehensive College Profiles
- Official cutoff data across years and rounds
- Placement statistics (average, median, highest package, placement percentage)
- College infrastructure and quality scores
- Student reviews and AI-powered summaries
- Hostel availability and fee information

### 🔍 College Comparison
- Compare up to 3 colleges side-by-side
- View all metrics in one place for easy decision-making

### 🤖 AI-Powered Insights
- Gemini AI generates factual summaries based on verified data
- Never generates or hallucates missing information
- Strictly fact-based analysis only

### 🎚️ Personalized Ranking
- Rank priorities by importance (placements, campus life, fees, etc.)
- Weighted scoring system customized to your preferences
- Colleges automatically ranked within each tier

## Technology Stack

### Frontend
- **Next.js 15+** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Shadcn UI** - Professional component library
- **React Hook Form** - Form management
- **Recharts** - Data visualization

### Backend
- **Next.js API Routes** - Serverless backend
- **TypeScript** - Type safety

### Database
- **PostgreSQL** - Structured data with Prisma
- **Prisma ORM** - Type-safe database access

### AI
- **Google Gemini API** - AI-powered summaries (factual only)

### Data Processing
- **Python** - Data ingestion scripts
- **pandas** - Data manipulation
- **camelot** - PDF table extraction
- **PyMuPDF** - PDF processing

## Architecture

### Core Principle: Strict Separation of Concerns

```
Database (PostgreSQL) = Facts
    ↓
Backend Logic (Filtering + Ranking) = Calculations
    ↓
AI (Gemini) = Summarization Only
    ↓
Frontend (Next.js) = Presentation
```

**Important**: The AI NEVER generates cutoff data, fees, placement numbers, or any factual information. All facts come directly from PostgreSQL.

## Database Schema

### Tables

**colleges**
- College basic information (name, code, city, university)
- Quality scores (placement, infrastructure, teaching, etc.)
- Fee information

**branches**
- Engineering branches offered by each college

**cutoffs**
- Official CAP cutoff percentiles
- Organized by: year, round, category, gender, seat type

**placements**
- Placement statistics by year
- Average, median, highest package, placement percentage

**reviews**
- Student reviews and feedback
- Sentiment scores

**college_summary**
- Cached AI-generated summaries (prevents repeated API calls)

## File Structure

```
├── app/
│   ├── page.tsx                 # Landing page
│   ├── recommendations/page.tsx # Main recommendation page
│   ├── college/[id]/page.tsx   # College details page
│   ├── compare/page.tsx         # College comparison page
│   ├── api/
│   │   ├── recommendations/route.ts   # Filtering engine API
│   │   ├── ai-summary/route.ts        # AI summary generation
│   │   └── colleges/
│   │       ├── [id]/route.ts          # Get college details
│   │       └── compare/route.ts       # Compare colleges
│   └── layout.tsx
├── components/
│   ├── recommendation-form.tsx  # Form to input student profile
│   ├── college-results.tsx      # Display recommendations
│   └── ui/                      # Shadcn UI components
├── lib/
│   ├── config.ts               # Configuration constants
│   ├── filtering-engine.ts     # Core filtering and scoring logic
│   └── utils.ts
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # Database migrations
├── scripts/
│   └── ingest_sample_data.py   # Sample data ingestion
└── public/
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Python 3.8+ (for data ingestion)
- Gemini API key from Google

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <your-repo>
   cd maharashtra-cap-recommender
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add:
   - `DATABASE_URL`: PostgreSQL connection string
   - `GEMINI_API_KEY`: Your Google Gemini API key

3. **Setup database**
   ```bash
   npx prisma migrate deploy
   ```

4. **Ingest sample data** (optional, for testing)
   ```bash
   # Install Python dependencies
   pip install psycopg2-binary python-dotenv

   # Run ingestion script
   python scripts/ingest_sample_data.py
   ```

5. **Run development server**
   ```bash
   pnpm dev
   ```

   Visit `http://localhost:3000`

## API Reference

### POST /api/recommendations
Get personalized college recommendations.

**Request Body:**
```json
{
  "mhtcetPercentile": 85.5,
  "jeePercentile": 72.3,
  "category": "General",
  "gender": "M",
  "homeUniversity": "University of Pune",
  "branchPreferences": ["Computer Science", "IT"],
  "cityPreferences": ["Pune", "Mumbai"],
  "priorityWeights": {
    "placement": 8,
    "campusLife": 7,
    "infrastructure": 6,
    "teaching": 5,
    "hostel": 4,
    "fees": 3,
    "location": 2,
    "industryExposure": 1
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dream": [...],
    "target": [...],
    "safe": [...]
  }
}
```

### POST /api/ai-summary
Generate AI summary for a college.

**Request Body:**
```json
{
  "collegeId": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": "..."
  }
}
```

### GET /api/colleges/[id]
Get detailed information about a college.

### POST /api/colleges/compare
Compare multiple colleges.

**Request Body:**
```json
{
  "collegeIds": [1, 2, 3]
}
```

## Configuration

### Tier Thresholds (lib/config.ts)
- **DREAM**: 3 percentile points below cutoff
- **TARGET**: 1.5 percentile points below cutoff
- **SAFE**: Equal or above cutoff

Adjust these values to change tier classification behavior.

### Priority Weights
Mapped automatically from ranking position:
- 1st Priority = Weight 8
- 2nd Priority = Weight 7
- ... and so on

## Data Ingestion

### Using the Python Script

```bash
# Ensure DATABASE_URL is set in .env
python scripts/ingest_sample_data.py
```

This script:
1. Inserts 5 sample colleges
2. Adds multiple branches per college
3. Creates cutoff records for multiple years and rounds
4. Adds placement data
5. Inserts sample student reviews

### Custom Data Ingestion

For production, create a script similar to `ingest_sample_data.py` that:
1. Parses official CAP PDF data
2. Converts to database records
3. Handles category-specific cutoff rules
4. Validates data before insertion

## Deployment

### Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Connect to Vercel**
   - Visit [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Set environment variables:
     - `DATABASE_URL`
     - `GEMINI_API_KEY`
   - Deploy

3. **Setup Database**
   - Connect to Neon PostgreSQL or your chosen provider
   - Run migrations: `npx prisma migrate deploy`
   - Ingest data using Python script

## Security Considerations

1. **API Keys**: Never commit `.env.local`. Use environment variables.
2. **Database**: Use strong passwords and restrict access.
3. **CORS**: Configure appropriate CORS policies if needed.
4. **Input Validation**: All API inputs are validated with Zod.
5. **Row-Level Security**: Implement RLS policies if adding user-specific data.

## Performance Optimizations

1. **Database Indexing**: Schema includes indexes on frequently queried fields
2. **Caching**: AI summaries are cached after generation
3. **Pagination**: Results can be paginated for large datasets
4. **Query Optimization**: Prisma queries are optimized with includes/selects

## Future Enhancements

- Add OAuth login for saved preferences
- Implement drag-and-drop priority reordering
- Export recommendations as PDF
- Integration with actual Maharashtra CAP portal
- Support for other Indian state admission systems
- Mobile app version
- Real-time cutoff updates

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` format
- Check PostgreSQL is running
- Ensure database exists and migrations are applied

### Gemini API Errors
- Verify `GEMINI_API_KEY` is valid
- Check API quota limits
- Ensure API is enabled in Google Cloud Console

### Data Not Showing
- Run: `python scripts/ingest_sample_data.py` to load sample data
- Check database is properly migrated
- Verify Prisma client is regenerated: `npx prisma generate`

## Support

For issues or questions, please create an issue in the repository.

## License

MIT License - See LICENSE file for details

## About

Built with the goal of making college admission decisions trustworthy, transparent, and data-driven for Maharashtra engineering students.

---

**Remember**: This platform is designed to support your decision-making process. Always verify information and consider multiple factors before making your final choice.
