# Deployment Guide

Complete guide for deploying Maharashtra CAP Recommender to production.

## Pre-Deployment Checklist

- [ ] All environment variables configured locally
- [ ] Database migrations tested locally
- [ ] Sample data ingestion works
- [ ] All pages load without errors
- [ ] Forms validate correctly
- [ ] API endpoints return expected data
- [ ] AI summaries generate properly
- [ ] Comparison feature works
- [ ] No console errors or warnings

## Option 1: Deploy to Vercel (Recommended)

Vercel is the easiest option for Next.js apps. Completely free tier available.

### Step 1: Prepare Repository

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Maharashtra CAP Recommender"

# Push to GitHub
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/repo-name.git
git push -u origin main
```

### Step 2: Connect to Vercel

1. Visit [vercel.com](https://vercel.com)
2. Click "Sign Up" and choose "Continue with GitHub"
3. Authorize Vercel
4. Click "Add New..." → "Project"
5. Select your repository
6. Click "Import"

### Step 3: Configure Environment Variables

1. In Vercel dashboard, go to Settings → Environment Variables
2. Add these variables:
   ```
   DATABASE_URL=<your-neon-connection-string>
   GEMINI_API_KEY=<your-gemini-api-key>
   NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
   ```
3. Click "Save"

### Step 4: Deploy

1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Visit your app at `https://your-project.vercel.app`

### Step 5: Setup Production Database

Create a PostgreSQL database on Neon:

1. Visit [neon.tech](https://neon.tech)
2. Sign up with GitHub
3. Create new project
4. Copy connection string
5. Update `DATABASE_URL` in Vercel with this string
6. Run migrations:

```bash
DATABASE_URL="your-neon-url" npx prisma migrate deploy
```

7. Ingest sample data:

```bash
DATABASE_URL="your-neon-url" python scripts/ingest_sample_data.py
```

### Step 6: Custom Domain (Optional)

1. In Vercel dashboard, go to Settings → Domains
2. Add your domain
3. Follow DNS configuration steps
4. Wait for SSL certificate (~10 minutes)

## Option 2: Deploy to Railway

Railway is another great option with generous free tier.

### Setup

1. Visit [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project"
4. Select "Database" → "PostgreSQL"
5. Wait for database to start
6. Click "New" → "GitHub Repo"
7. Select your repository
8. Connect PostgreSQL:
   - Go to your app service
   - Add "PostgreSQL" plugin
   - Set environment variable linking

### Run Migrations

In Railway console:

```bash
npx prisma migrate deploy
```

### Monitor

- View logs: Dashboard → Logs
- Monitor resource usage: Dashboard → Resources
- Check deployments: Dashboard → Deployments

## Option 3: Deploy to Heroku

Heroku offers simple deployment but has limited free tier.

### Setup

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create your-app-name

# Set environment variables
heroku config:set DATABASE_URL="your-database-url"
heroku config:set GEMINI_API_KEY="your-api-key"

# Deploy
git push heroku main

# Run migrations
heroku run npx prisma migrate deploy

# View logs
heroku logs --tail
```

## Option 4: Self-Hosted on Linux VPS

For maximum control, deploy on your own server.

### Prerequisites

- Ubuntu 20.04+ VPS (DigitalOcean, Linode, AWS, etc.)
- Minimum 1GB RAM
- SSH access

### Setup

1. **SSH into server**
   ```bash
   ssh root@your-server-ip
   ```

2. **Install dependencies**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt update
   sudo apt install -y nodejs postgresql postgresql-contrib nginx
   ```

3. **Setup PostgreSQL**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE maharashtra_cap_db;
   \q
   ```

4. **Clone repository**
   ```bash
   cd /var/www
   git clone https://github.com/YOUR_USERNAME/repo-name.git
   cd repo-name
   npm install
   ```

5. **Setup environment**
   ```bash
   cat > .env.production << EOF
   DATABASE_URL=postgresql://postgres:password@localhost:5432/maharashtra_cap_db
   GEMINI_API_KEY=your-api-key
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   EOF
   ```

6. **Build and start**
   ```bash
   npm run build
   npm start
   ```

7. **Setup PM2** (keeps app running)
   ```bash
   sudo npm install -g pm2
   pm2 start npm -- start --name "cap-recommender"
   pm2 startup
   pm2 save
   ```

8. **Setup Nginx** (reverse proxy)
   ```bash
   sudo cat > /etc/nginx/sites-available/default << EOF
   server {
     listen 80;
     server_name your-domain.com;

     location / {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade \$http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host \$host;
       proxy_cache_bypass \$http_upgrade;
     }
   }
   EOF
   ```

9. **Setup SSL** (Let's Encrypt)
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

10. **Restart Nginx**
    ```bash
    sudo systemctl restart nginx
    ```

## Post-Deployment

### Verify Deployment

1. Visit your deployed app
2. Test recommendation form
3. Check college details page
4. Test comparison feature
5. Monitor API response times
6. Check error logs

### Monitor Performance

**Vercel:**
- Dashboard → Analytics
- Check Core Web Vitals
- Monitor API routes

**Railway:**
- Dashboard → Monitoring
- Check CPU and memory usage

**Self-hosted:**
```bash
# Check server resources
top

# Check logs
pm2 logs

# Check database
psql -U postgres -d maharashtra_cap_db
SELECT COUNT(*) FROM "College";
```

### Enable Caching

Update next.config.js:

```javascript
module.exports = {
  images: {
    minimumCacheTTL: 3600,
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
}
```

### Setup Error Monitoring

Integrate with Sentry:

1. Create account at [sentry.io](https://sentry.io)
2. Add to dependencies:
   ```bash
   npm install @sentry/nextjs
   ```
3. Configure in next.config.js
4. Errors will be tracked automatically

### Database Backups

**Neon:**
Automatic backups included in free tier.

**PostgreSQL:**
```bash
# Manual backup
pg_dump -U postgres maharashtra_cap_db > backup.sql

# Automated backup (cron)
0 2 * * * pg_dump -U postgres maharashtra_cap_db > /backups/backup-$(date +\%Y\%m\%d).sql
```

## Troubleshooting

### Application Won't Start

```bash
# Check logs
npm run dev

# Check environment variables
echo $DATABASE_URL
echo $GEMINI_API_KEY

# Rebuild
npm run build
```

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL

# Regenerate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

### AI Summaries Not Working

- Check GEMINI_API_KEY is valid
- Verify API quota
- Check logs for errors

### High Response Times

- Check database indexes
- Optimize queries
- Enable caching
- Consider read replicas for database

## Scaling

### Increase Performance

1. **Database**: Use connection pooling (PgBouncer)
2. **CDN**: Cloudflare for static assets
3. **Caching**: Redis for frequent queries
4. **Load Balancer**: Distribute traffic

### Monitor Usage

- Track user growth
- Monitor database size
- Check API quotas
- Review costs

## Security Updates

Regular maintenance tasks:

```bash
# Weekly: Update dependencies
npm update

# Monthly: Security audit
npm audit

# Quarterly: Major updates
npm upgrade
```

## Rollback Procedures

If deployment breaks:

**Vercel:**
1. Dashboard → Deployments
2. Click previous working version
3. Click "Redeploy"

**Self-hosted:**
```bash
# Previous version
git log --oneline
git checkout <commit-hash>
npm run build
pm2 restart cap-recommender
```

## Success Criteria

- [ ] App loads under 3 seconds
- [ ] API responses under 200ms
- [ ] No 5xx errors in logs
- [ ] Database running smoothly
- [ ] AI summaries generating in <5s
- [ ] Mobile responsive
- [ ] SSL certificate valid

## Support

For deployment issues:
- Check logs carefully
- Test locally first
- Verify environment variables
- Check database connectivity
- Review platform-specific docs

---

**Need help?** Refer to [SETUP.md](SETUP.md) for detailed local setup instructions.
