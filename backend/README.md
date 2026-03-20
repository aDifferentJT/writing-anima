# Writing-Anima Backend

Python FastAPI backend providing Anima-powered writing analysis.

## Setup

1. Install hatch
```bash
uv tool install hatch
```

2. Start Qdrant:
```bash
cd ..
docker-compose up -d qdrant
```

3. Build
```bash
hatch run dist
```
