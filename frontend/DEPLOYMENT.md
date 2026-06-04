# Deployment Guide

## Frontend Deployment Options

### Option 1: Vercel (Recommended for Next.js projects, but works for Vite)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

### Option 2: Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

### Option 3: Docker

```dockerfile
# Dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm i -g http-server
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["http-server", "dist", "-p", "3000"]
```

```bash
# Build image
docker build -t intelliglog-frontend:latest .

# Run container
docker run -p 3000:80 intelliglog-frontend:latest
```

### Option 4: AWS S3 + CloudFront

```bash
# Build production files
npm run build

# Sync to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

### Option 5: Self-hosted (nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/intelliglog-frontend;

    location / {
        try_files $uri $uri/ /index.html;
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Deploy
npm run build
sudo cp -r dist/* /var/www/intelliglog-frontend/
sudo systemctl restart nginx
```

## Environment Configuration

### Production Environment Variables

Create `.env.production`:

```
VITE_API_URL=https://api.intelliglobal.com
VITE_WS_URL=wss://api.intelliglobal.com/ws
```

### Build Command

```bash
npm run build
```

This creates a production build in the `dist/` folder.

## Pre-deployment Checklist

- [ ] All environment variables configured
- [ ] Backend API is running and accessible
- [ ] WebSocket endpoint is reachable
- [ ] Type check passes: `npm run type-check`
- [ ] Lint check passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Test with `npm run preview`
- [ ] Analytics/monitoring configured
- [ ] Error logging configured
- [ ] CORS headers properly set on backend

## Performance Optimization

### Code Splitting
Already configured in `vite.config.ts`:
- React vendor chunk
- Map vendor chunk
- Charts chunk
- State management chunk

### Caching Strategy
```
Assets in /assets/: 30 days cache
HTML: No cache (always fetch latest)
API responses: Handled by React Query (5 min stale time)
```

### Monitoring

Consider adding:
- Sentry for error tracking
- LogRocket for session replay
- DataDog for performance monitoring
- Google Analytics for user behavior

```typescript
// Example Sentry integration
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});
```

## Rollback Procedure

If deployment goes wrong:

1. **Immediate**: Revert to previous version in deployment platform
2. **Check logs**: Look for WebSocket connection errors
3. **Verify backend**: Ensure API is responding
4. **Clear browser cache**: Might be serving stale assets
5. **Check environment variables**: Confirm API URL is correct

## Health Checks

After deployment, verify:

1. **Page loads**: Navigate to root URL
2. **Authentication**: Login with test credentials
3. **Dashboard loads**: Check console for errors
4. **Map renders**: Verify Leaflet tiles load
5. **WebSocket connects**: Check network tab for ws connection
6. **Data loads**: Orders and metrics appear in dashboard

```bash
# Quick health check script
curl https://your-domain.com
curl -X POST https://api.intelliglobal.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@intelliglobal.com","password":"demo123"}'
```

## Support

For deployment issues:
1. Check browser console (F12)
2. Review network tab for failed requests
3. Check server logs for WebSocket errors
4. Verify environment variables match backend
5. Ensure CORS is properly configured
