# Production Deployment Guide

## Overview
This guide covers deploying the Reverse Bundling Shopify app to production with enterprise-grade monitoring, security, and scalability.

## Prerequisites

### Infrastructure Requirements
- **Domain**: HTTPS-enabled domain (required for Shopify apps)
- **Database**: PostgreSQL 13+ (SQLite not supported in production)
- **Redis**: Optional but recommended for session storage and caching
- **SSL Certificate**: Valid SSL certificate for HTTPS

### Environment Setup
1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd reverse-bundling
   ```

2. **Install dependencies**
   ```bash
   npm ci --production=false
   ```

3. **Database setup**
   ```bash
   # Run migrations
   npx prisma migrate deploy

   # Generate Prisma client
   npx prisma generate
   ```

## Environment Configuration

### 1. Create Production Environment File
```bash
cp .env.production.example .env.production
```

### 2. Configure Required Variables
Edit `.env.production` with your production values:

```bash
# Required Shopify credentials
SHOPIFY_API_KEY=your_production_api_key
SHOPIFY_API_SECRET=your_production_api_secret

# Production URLs (must be HTTPS)
SHOPIFY_APP_URL=https://your-domain.com

# PostgreSQL database
DATABASE_URL=postgresql://user:password@host:5432/database

# Strong session secret (32+ characters)
SESSION_SECRET=your_random_32_character_session_secret
```

### 3. Optional Services Configuration
```bash
# Email service (SendGrid recommended)
SENDGRID_API_KEY=your_sendgrid_api_key

# Redis for sessions and caching
REDIS_URL=redis://your-redis-instance:6379

# Error monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project

# Metrics access token
METRICS_TOKEN=your_secure_metrics_token
```

## Deployment Options

### Option 1: Docker Deployment (Recommended)

1. **Build the Docker image**
   ```bash
   docker build -t reverse-bundling:latest .
   ```

2. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Verify deployment**
   ```bash
   curl https://your-domain.com/health
   ```

### Option 2: Direct Node.js Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the application**
   ```bash
   npm start
   ```

3. **Use a process manager (PM2 recommended)**
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.js
   pm2 startup
   pm2 save
   ```

## Shopify App Setup

### 1. Create App in Shopify Partner Dashboard
1. Go to [Shopify Partner Dashboard](https://partners.shopify.com)
2. Create a new app
3. Set App URL: `https://your-domain.com`
4. Set Allowed redirection URL: `https://your-domain.com/auth/callback`

### 2. Configure App Permissions
Ensure these scopes are enabled:
- `write_products`
- `read_all_orders`
- `read_products`
- `write_orders`
- `read_locations`
- `write_order_edits`

### 3. Webhook Configuration
The app automatically registers webhooks on installation. No manual configuration needed.

## Monitoring & Health Checks

### Health Check Endpoint
```
GET https://your-domain.com/health
```
Returns application and database health status.

### Metrics Endpoint
```
GET https://your-domain.com/metrics
Authorization: Bearer <METRICS_TOKEN>
```
Returns business metrics and system performance data.

### Recommended Monitoring Setup
1. **Uptime Monitoring**: Monitor `/health` endpoint
2. **Performance Monitoring**: Track response times and error rates
3. **Business Metrics**: Monitor bundle conversions and savings
4. **Database Monitoring**: Monitor connection pool and query performance

## Security Checklist

### Pre-Deployment
- [ ] All environment variables are set and validated
- [ ] SSL certificate is valid and properly configured
- [ ] Database is secured with strong credentials
- [ ] Session secret is 32+ characters and randomly generated
- [ ] Metrics token is set and secure

### Runtime Security
- [ ] Content Security Policy is active
- [ ] XSS protection headers are present
- [ ] HSTS is enabled for HTTPS enforcement
- [ ] Rate limiting is protecting against abuse
- [ ] All API endpoints require proper authentication

## Scaling Considerations

### Horizontal Scaling
- The app supports multiple instances behind a load balancer
- Use Redis for session storage when scaling horizontally
- Database connection pooling is configured for high concurrency

### Database Scaling
- Monitor database connection usage
- Consider read replicas for heavy read workloads
- Optimize queries and add proper indexing

### Performance Optimization
- Enable gzip compression
- Use CDN for static assets
- Monitor memory usage and optimize garbage collection
- Implement caching strategies for frequently accessed data

## Troubleshooting

### Common Issues

**App won't start**
- Check environment variables are properly set
- Verify database connectivity
- Check Node.js version compatibility

**Health check fails**
- Verify database connection string
- Check database server is running
- Confirm migrations have been applied

**Webhooks not working**
- Verify app is properly installed in Shopify
- Check webhook URLs are accessible
- Review application logs for webhook processing errors

**Rate limiting issues**
- Check rate limit configurations
- Monitor Redis connectivity (if using Redis)
- Review application logs for rate limit violations

### Logs and Debugging
- Application logs are written to stdout/stderr
- Use `npm run dev` for development debugging
- Enable verbose logging by setting `DEBUG=*`

## Rollback Strategy

### Quick Rollback
1. Keep previous deployment version available
2. Use Docker tags for version management
3. Have database backup before migrations

### Emergency Rollback
```bash
# Stop current deployment
docker-compose down

# Start previous version
docker run -d --name reverse-bundling-rollback reverse-bundling:v1.0.0

# Verify rollback
curl https://your-domain.com/health
```

## Support

For deployment issues:
1. Check application logs
2. Verify environment configuration
3. Test with development environment first
4. Review this deployment guide
5. Contact development team with specific error messages

## Version History

- **v1.0.0**: Initial production deployment with enterprise features
- Monitoring, security, and rate limiting enabled
- PostgreSQL support added
- Docker deployment support