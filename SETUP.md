# Complete Setup Guide for Maharashtra CAP Recommender

This guide is designed for beginners. Follow each step carefully.

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Install Node.js](#install-nodejs)
3. [Install PostgreSQL](#install-postgresql)
4. [Setup Project](#setup-project)
5. [Setup Database](#setup-database)
6. [Get API Keys](#get-api-keys)
7. [Run Development Server](#run-development-server)
8. [Load Sample Data](#load-sample-data)
9. [Deploy to Production](#deploy-to-production)

## System Requirements

- **Operating System**: Windows, macOS, or Linux
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 2GB free space

## Install Node.js

Node.js is a JavaScript runtime needed to run this project.

### On Windows

1. Visit [nodejs.org](https://nodejs.org)
2. Download **Node.js LTS** (Long Term Support)
3. Run the installer
4. Click "Next" through the installation
5. **Important**: Check the box "Automatically install the necessary tools"
6. Click "Install"
7. Restart your computer

### On macOS

Using Homebrew (recommended):

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

Or download from [nodejs.org](https://nodejs.org)

### On Linux (Ubuntu/Debian)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Verify Installation

Open terminal/command prompt and run:

```bash
node --version
npm --version
```

You should see version numbers (e.g., v18.0.0).

## Install PostgreSQL

PostgreSQL is the database that stores college and admission data.

### On Windows

1. Visit [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
2. Click "Download the installer"
3. Choose version 13 or later
4. Run the installer
5. Follow setup steps:
   - Accept license
   - Choose installation directory
   - **Save the password you set for the "postgres" user**
   - Port: Use default 5432
   - Locale: Use default
6. Complete installation

### On macOS

Using Homebrew:

```bash
brew install postgresql@15
brew services start postgresql@15
```

Or download from [postgresql.org/download/macosx](https://www.postgresql.org/download/macosx/)

### On Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo service postgresql start
```

### Create a New Database

1. Open PostgreSQL command prompt/terminal
2. Run:

```bash
psql -U postgres
```

3. When prompted, enter your PostgreSQL password
4. Create database:

```sql
CREATE DATABASE maharashtra_cap_db;
\q
```

The `\q` command exits PostgreSQL.

## Setup Project

### 1. Download Project

If you have Git installed:
```bash
git clone <repository-url>
cd maharashtra-cap-recommender
```

Or download as ZIP and extract.

### 2. Install Dependencies

Open terminal in the project directory and run:

```bash
npm install
```

This downloads all required packages (~500MB). It may take 2-5 minutes.

### 3. Create Environment File

1. In the project root, create a file named `.env.local`
2. Copy this content:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/maharashtra_cap_db
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Replace `YOUR_PASSWORD` with the PostgreSQL password you set during installation.

## Setup Database

### 1. Generate Prisma Client

```bash
npx prisma generate
```

### 2. Run Database Migrations

Migrations create the database tables:

```bash
npx prisma migrate deploy
```

You should see output like:
```
Applying migration `...
```

### 3. Verify Database

```bash
npx prisma db push
```

## Get API Keys

### Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account (create one if needed)
3. Click "Create API Key"
4. Copy the key
5. Paste into `.env.local` as `GEMINI_API_KEY=<your-key>`

## Run Development Server

### Start the Server

```bash
npm run dev
```

You should see:
```
> next dev

  ▲ Next.js 15.x.x
  - ready on http://localhost:3000
```

### Open in Browser

Open your browser and go to: [http://localhost:3000](http://localhost:3000)

You should see the landing page.

## Load Sample Data

Sample data is necessary to test the recommendations feature.

### 1. Install Python Dependencies

```bash
pip install psycopg2-binary python-dotenv
```

### 2. Run Data Ingestion Script

```bash
python scripts/ingest_sample_data.py
```

You should see output like:
```
✓ Inserted 5 colleges
✓ Inserted 15 branches
✓ Inserted 120 cutoff records
✓ Inserted placement records
✓ Inserted 25 reviews

✓ Sample data ingestion completed successfully!

You can now visit http://localhost:3000/recommendations to test the platform
```

### 3. Test the Platform

1. Go to [http://localhost:3000/recommendations](http://localhost:3000/recommendations)
2. Fill in the form:
   - MHT CET Percentile: **85**
   - Category: **General**
   - Gender: **M**
   - Home University: **University of Pune**
   - Select at least one branch
3. Click "Get Recommendations"
4. You should see colleges categorized as Dream, Target, and Safe

## Common Issues & Solutions

### Issue: "DATABASE_URL is not set"

**Solution**: Make sure `.env.local` exists and has `DATABASE_URL` set correctly.

### Issue: PostgreSQL connection refused

**Solution**: 
- Check PostgreSQL is running
- Verify password is correct
- Ensure database `maharashtra_cap_db` exists

### Issue: Port 3000 already in use

**Solution**: Stop other applications using port 3000 or run on different port:
```bash
npm run dev -- -p 3001
```

### Issue: "Cannot find module" error

**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: AI Summary API Error

**Solution**:
- Verify `GEMINI_API_KEY` is correct
- Check API is enabled: [Google Cloud Console](https://console.cloud.google.com/)
- Ensure you have API quota remaining

## Deploy to Production

### Option 1: Deploy to Vercel (Recommended)

Vercel is free and automatically hosts Next.js apps.

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Sign up at Vercel**
   - Visit [vercel.com](https://vercel.com)
   - Sign up with GitHub

3. **Create Project**
   - Click "New Project"
   - Select your repository
   - Click "Import"

4. **Set Environment Variables**
   - Click "Environment Variables"
   - Add `DATABASE_URL` and `GEMINI_API_KEY`
   - Click "Save"

5. **Deploy**
   - Click "Deploy"
   - Wait ~2-3 minutes

6. **Setup Production Database**
   - Use Neon (free tier): [neon.tech](https://neon.tech)
   - Create PostgreSQL database
   - Get connection string
   - Update `DATABASE_URL` in Vercel

7. **Run Production Migrations**
   - Get Neon connection string
   - Run: `DATABASE_URL="your_neon_url" npx prisma migrate deploy`

### Option 2: Deploy to Railway

1. Visit [railway.app](https://railway.app)
2. Sign up with GitHub
3. Create new project
4. Add PostgreSQL plugin
5. Add Node.js service
6. Set environment variables
7. Deploy

### Option 3: Self-Hosted on VPS

1. Rent a VPS (DigitalOcean, Linode, AWS, etc.)
2. Install Node.js and PostgreSQL
3. Clone repository
4. Run: `npm run build`
5. Run: `npm start`
6. Use PM2 to keep app running:
   ```bash
   npm install -g pm2
   pm2 start npm -- start
   pm2 startup
   pm2 save
   ```

## Next Steps

1. **Customize Data**: Replace sample data with real CAP cutoff data
2. **Add More Colleges**: Use Python script to ingest all Maharashtra colleges
3. **Customize Thresholds**: Edit `lib/config.ts` to change tier thresholds
4. **Add Authentication**: Implement login so students can save preferences
5. **Add User Reviews**: Allow students to submit college reviews

## Getting Help

- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Prisma Documentation**: [prisma.io/docs](https://prisma.io/docs)
- **PostgreSQL Documentation**: [postgresql.org/docs](https://www.postgresql.org/docs)
- **Gemini API Documentation**: [ai.google.dev/docs](https://ai.google.dev/docs)

## Performance Tips

1. **Database Indexes**: Already configured in schema
2. **API Caching**: Summaries are cached after first generation
3. **Image Optimization**: Next.js automatically optimizes images
4. **Code Splitting**: Components are automatically code-split

## Security Checklist

- [ ] `.env.local` is in `.gitignore` (never commit secrets)
- [ ] Use strong PostgreSQL password
- [ ] Validate all user inputs (already done with Zod)
- [ ] Use HTTPS in production
- [ ] Enable CORS only for trusted domains
- [ ] Regularly update dependencies: `npm update`

## Monitoring

After deployment, monitor:

1. **Server Logs**
   - Vercel: Dashboard → Logs
   - Railway: Deployments → Logs

2. **Performance**
   - Check Core Web Vitals
   - Monitor API response times

3. **Database**
   - Monitor connection count
   - Check query performance

## Congratulations! 🎉

You now have a fully functional Maharashtra CAP Recommender platform!

---

**Need help?** Check the main [README.md](README.md) for more detailed information.
