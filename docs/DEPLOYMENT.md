# Deployment Guide

## Production Deployment Options

### Option 1: Docker Compose (Recommended for VPS)

Create a production `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: writing-anima-qdrant
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: writing-anima-backend
    ports:
      - "8000:8000"
    environment:
      - QDRANT_HOST=qdrant
      - QDRANT_PORT=6333
    env_file:
      - ./backend/.env.production
    depends_on:
      - qdrant
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: writing-anima-frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  qdrant_data:
```

### Option 2: Separate Services

**Backend**: Deploy to Railway, Render, or DigitalOcean App Platform
**Frontend**: Deploy to Vercel, Netlify, or Cloudflare Pages
**Qdrant**: Use Qdrant Cloud or self-hosted on VPS

### Security Considerations

1. **Use HTTPS**: Always use SSL/TLS in production
2. **Environment Variables**: Never commit `.env` files
3. **API Keys**: Rotate keys regularly
4. **Firebase Rules**: Set proper Firestore security rules
5. **CORS**: Configure proper CORS origins
6. **Rate Limiting**: Implement API rate limiting

### Production Checklist

- [ ] Set `DEBUG=False` in backend
- [ ] Use production Firebase project
- [ ] Enable Firestore security rules
- [ ] Set up monitoring (Sentry, LogRocket)
- [ ] Configure backups for Qdrant
- [ ] Set up CDN for frontend
- [ ] Enable caching headers
- [ ] Set up domain and SSL
- [ ] Configure environment variables securely
- [ ] Test WebSocket connections work through proxy
