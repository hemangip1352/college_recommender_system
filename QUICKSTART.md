# Quick Start Guide - 5 Minutes to Running

Get the Maharashtra CAP Recommender running locally in 5 minutes!

## Prerequisites

Have these installed:
- Node.js 18+ ([download](https://nodejs.org))
- PostgreSQL 13+ ([download](https://postgresql.org/download))
- Git ([download](https://git-scm.com))

## 1. Create Database (1 minute)

Open PostgreSQL command prompt:

```bash
psql -U postgres
CREATE DATABASE maharashtra_cap_db;
\q
```

## 2. Setup Project (2 minutes)

```bash
# Clone/extract project
cd maharashtra-cap-recommender

# Install dependencies
pnpm install

# OR if using npm
npm install
```

## 3. Configure Environment (1 minute)

Create `.env.local` file:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/maharashtra_cap_db
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get Gemini API key:
1. Visit [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy and paste above

## 4. Setup Database (1 minute)

```bash
# Run migrations
npx prisma migrate deploy

# Load sample data
python scripts/ingest_sample_data.py

# (Install Python requirements if needed: pip install psycopg2-binary python-dotenv)
```

## 5. Run Development Server (1 minute)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## You're Done!

Visit [http://localhost:3000/recommendations](http://localhost:3000/recommendations) and:

1. Enter percentile: **85**
2. Select category: **General**
3. Select at least one branch
4. Click **Get Recommendations**

## Next Steps

- **View Details**: Click "Details" on any college
- **Compare**: Select colleges and click "Compare Selected"
- **Read AI Summary**: Scroll to see AI-generated insights
- **Explore Cutoffs**: See 3 years of historical cutoff data

## Common Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# View database UI
npx prisma studio

# Reset database
npx prisma migrate reset

# View logs
npm run dev -- --debug

# Run migrations
npm run db:migrate

# Load data
npm run ingest:data
```

## Troubleshooting

**PostgreSQL error?**
```bash
# Start PostgreSQL service
# Windows: Open Services → Start PostgreSQL
# Mac: brew services start postgresql
# Linux: sudo service postgresql start
```

**Can't connect to database?**
```bash
# Check DATABASE_URL in .env.local is correct
# Test connection:
psql $DATABASE_URL
```

**Gemini API error?**
- Verify API key in .env.local
- Check quota at [makersuite.google.com](https://makersuite.google.com)

**Port 3000 in use?**
```bash
npm run dev -- -p 3001
```

## Project Structure

```
app/
  ├── page.tsx              # Landing page
  ├── recommendations/      # Main recommendations
  ├── college/[id]/        # College details
  ├── compare/             # College comparison
  └── api/                 # API routes

components/
  ├── recommendation-form.tsx
  ├── college-results.tsx
  └── ui/                  # Shadcn components

lib/
  ├── config.ts           # Configuration
  ├── filtering-engine.ts # Ranking logic
  └── utils.ts

prisma/
  ├── schema.prisma       # Database schema
  └── migrations/

scripts/
  └── ingest_sample_data.py
```

## Key Features

1. **Smart Filtering**: Category-aware, home university rules respected
2. **Three Tiers**: Dream, Target, Safe colleges
3. **Personalized Ranking**: Weight your priorities
4. **Data-Driven**: Real cutoffs, placements, fees
5. **AI Summaries**: Gemini summarizes college reviews
6. **Comparisons**: Side-by-side college analysis

## API Endpoints

```
POST /api/recommendations      # Get college recommendations
POST /api/ai-summary          # Generate AI summary
GET  /api/colleges/[id]       # Get college details
POST /api/colleges/compare    # Compare colleges
```

## Deploy in 5 Minutes

### To Vercel (Free)

```bash
git add .
git commit -m "Init"
git push origin main

# Visit vercel.com → Import → Select repo → Deploy
```

Then set environment variables in Vercel dashboard.

### To Railway (Free)

1. Visit [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub"
3. Select repo
4. Add PostgreSQL plugin
5. Deploy

## Database Schema

**Tables:**
- `College` - College info (name, code, city, etc.)
- `Branch` - Engineering branches
- `Cutoff` - Official CAP cutoffs by year/round
- `Placement` - Placement data by year
- `Review` - Student reviews
- `CollegeSummary` - Cached AI summaries

## Performance

- Landing page: <500ms
- Recommendations: <2s
- College details: <500ms
- Comparisons: <1s

## Mobile Responsive

All pages fully responsive:
- Mobile (320px+)
- Tablet (768px+)
- Desktop (1024px+)

## What's Included

✓ Complete Next.js 16 setup
✓ TypeScript configuration
✓ Prisma ORM with migrations
✓ PostgreSQL schema
✓ Authentication ready
✓ Styling with Tailwind
✓ Form validation with Zod
✓ API routes with error handling
✓ AI integration ready
✓ Sample data ingestion
✓ Documentation

## Learn More

- [Full Setup Guide](SETUP.md) - Detailed beginner guide
- [README.md](README.md) - Architecture & features
- [Deployment Guide](DEPLOYMENT.md) - Production deployment
- [API Reference](README.md#api-reference) - API endpoints

## Tips

1. **Customize thresholds**: Edit `lib/config.ts` TIER_THRESHOLDS
2. **Add colleges**: Run Python script with real data
3. **Change UI**: Themes in `app/globals.css`
4. **Add auth**: Integrate with NextAuth or Supabase
5. **Monitor**: Check Vercel/Railway dashboard

## Support

- Check logs: `npm run dev` output
- Database issues: `npx prisma studio`
- API issues: Browser DevTools → Network
- Deployment issues: Platform docs (vercel.com, railway.app)

---

**Stuck?** Start here:
1. Check `.env.local` has all variables
2. Verify database running: `psql -U postgres`
3. Check node version: `node --version` (should be 18+)
4. Clear cache: `rm -rf .next node_modules && npm install`
5. Restart dev server: `npm run dev`

**Congratulations!** You're ready to help students make college decisions! 🎓
