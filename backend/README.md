# Writing-Anima Backend

Python FastAPI backend providing Anima-powered writing analysis.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your API keys
```

4. Start Qdrant:
```bash
cd ..
docker-compose up -d qdrant
```

5. Run the server:
```bash
python main.py
```

The API will be available at `http://localhost:8000`

## API Documentation

Visit `http://localhost:8000/docs` for interactive API documentation (Swagger UI).

## Project Structure

```
backend/
├── src/
│   ├── agent/       # Anima agent orchestration (from Castor)
│   ├── database/    # Qdrant vector database interface
│   ├── corpus/      # Corpus ingestion and processing
│   ├── api/         # FastAPI routes and endpoints
│   └── config.py    # Configuration management
├── main.py          # Application entry point
└── requirements.txt # Python dependencies
```
