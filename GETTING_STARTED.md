# Getting Started with Writing-Anima

This guide will walk you through setting up and using Writing-Anima for the first time.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Firebase Setup](#firebase-setup)
- [Running the Application](#running-the-application)
- [Creating Your First Persona](#creating-your-first-persona)
- [Getting Writing Feedback](#getting-writing-feedback)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, make sure you have:

### Required
- **Python 3.9 or higher** ([Download](https://www.python.org/downloads/))
- **Node.js 16 or higher** ([Download](https://nodejs.org/))
- **Docker** ([Download](https://www.docker.com/get-started))
- **OpenAI API Key** ([Get one](https://platform.openai.com/api-keys))
- **Firebase Account** (free - [Sign up](https://console.firebase.google.com))

### Optional
- **Anthropic API Key** for Claude models ([Get one](https://console.anthropic.com))

## Installation

### Step 1: Clone or Navigate to Project

```bash
cd /Users/julesdesai/Documents/HAI\ Lab\ Code/writing-anima
```

### Step 2: Start Qdrant Vector Database

```bash
# Start Qdrant in the background
docker-compose up -d qdrant

# Verify it's running (should return OK)
curl http://localhost:6333/health
```

### Step 3: Set Up Backend

```bash
cd backend

# Create Python virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
```

Now edit `backend/.env` and add your API keys:

```bash
# Required
OPENAI_API_KEY=sk-...  # Your OpenAI API key

# Optional
ANTHROPIC_API_KEY=sk-ant-...  # For Claude models

# Qdrant (defaults should work)
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Firebase Admin SDK path (we'll set this up next)
FIREBASE_ADMIN_SDK_PATH=./firebase-admin-sdk.json
```

### Step 4: Set Up Frontend

Open a new terminal (keep backend terminal open):

```bash
cd frontend

# Install Node dependencies
npm install

# Create environment file
cp .env.example .env
```

## Firebase Setup

### Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"**
3. Name it (e.g., "writing-anima")
4. Disable Google Analytics (optional)
5. Click **"Create project"**

### Enable Authentication

1. In Firebase Console, go to **Authentication**
2. Click **"Get started"**
3. Click **"Email/Password"** under Sign-in method
4. Enable **"Email/Password"**
5. Click **"Save"**

### Create Firestore Database

1. In Firebase Console, go to **Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (for development)
4. Select a location close to you
5. Click **"Enable"**

### Get Frontend Configuration

1. In Firebase Console, click **⚙️ (Settings) > Project settings**
2. Scroll down to **"Your apps"**
3. Click the **</>** (Web) icon
4. Register app (name: "writing-anima-frontend")
5. Copy the config values

Edit `frontend/.env`:

```bash
REACT_APP_API_URL=http://localhost:8000
REACT_APP_WS_URL=ws://localhost:8000

# Paste your Firebase config here:
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

### Get Backend Service Account

1. In Firebase Console, go to **⚙️ > Project settings > Service accounts**
2. Click **"Generate new private key"**
3. Save the JSON file as `backend/firebase-admin-sdk.json`

## Running the Application

### Terminal 1: Backend

```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### Terminal 2: Frontend

```bash
cd frontend
npm start
```

Browser should open automatically to `http://localhost:3000`

### Terminal 3: Qdrant (Optional - to see logs)

```bash
docker-compose logs -f qdrant
```

## Creating Your First Persona

### Step 1: Sign Up

1. Open `http://localhost:3000`
2. Click **"Create Account"**
3. Enter email and password
4. Click **"Sign Up"**

### Step 2: Create a Project

1. Click **"+ New Project"**
2. Name it (e.g., "My First Writing Project")
3. Click **"Create"**

### Step 3: Define Purpose (Optional)

1. You'll be on the **Purpose** tab
2. Enter your writing goal (e.g., "Write a blog post about AI")
3. Add criteria if desired
4. Click **"Save and Continue"**

### Step 4: Create a Persona

1. Click the **"Personas"** tab
2. Click **"+ New Persona"**
3. Enter details:
   - **Name**: e.g., "Hemingway Style"
   - **Description**: e.g., "Short, direct sentences with minimal adjectives"
4. Click **"Create Persona"**

### Step 5: Upload Corpus

1. The upload modal should appear automatically
2. Click the upload area or drag files
3. Select writing samples:
   - **Format**: PDF, TXT, MD, or DOCX
   - **Recommended**: At least 10-20 pages of text
   - **Examples**:
     - Essays by the author
     - Books in that style
     - Writing samples from you want to emulate
4. Click **"Upload Files"**
5. Wait for processing (may take 30-60 seconds)

### Step 6: Verify Persona

You should see:
- ✅ **Ready** badge
- **X files** uploaded
- **Y chunks** processed

## Getting Writing Feedback

### Step 1: Write Content

1. Go to **Writing** tab
2. Write or paste your content in the editor

### Step 2: Select Persona

In the **Anima Analysis** toolbar:
1. Select your persona from the dropdown
2. You'll see the chunk count (should be > 0)

### Step 3: Analyze

1. Click **"Analyze with Anima"**
2. Watch the status messages:
   - "Initializing..."
   - "Agent ready, starting analysis..."
   - "Analyzing with corpus retrieval..."
   - "Complete!"

### Step 4: Review Feedback

Feedback cards will appear on the right showing:
- **Type**: Issue, Suggestion, Praise, Question
- **Category**: General feedback category
- **Content**: Detailed feedback
- **Severity**: Low, Medium, High
- **Confidence**: How confident the analysis is

### Step 5: Refine

1. Edit your writing based on feedback
2. Click **"Analyze with Anima"** again
3. Iterate until satisfied

## Advanced Features

### Multiple Personas

Create different personas for different styles:
- **Academic Persona**: Upload academic papers
- **Creative Persona**: Upload creative writing
- **Technical Persona**: Upload documentation

Switch between them based on what you're writing!

### Purpose & Criteria

Use the **Purpose** tab to:
- Define writing goals
- Set evaluation criteria
- Guide the feedback

### Inquiry Complex

Use the **Inquiry Complex** tab for:
- Dialectical reasoning
- Question exploration
- Deep analysis

### Feedback History

The system remembers previous feedback:
- Learns from your edits
- Avoids repeat suggestions
- Builds on past analysis

## Troubleshooting

### Backend Won't Start

**Error**: `ModuleNotFoundError: No module named 'fastapi'`
- **Solution**: Make sure you activated the virtual environment and ran `pip install -r requirements.txt`

**Error**: `Connection refused` to Qdrant
- **Solution**: Make sure Qdrant is running: `docker-compose up -d qdrant`

### Frontend Won't Start

**Error**: `Module not found`
- **Solution**: Run `npm install` in the frontend directory

**Error**: Firebase errors
- **Solution**: Double-check your `.env` file has correct Firebase credentials

### Analysis Fails

**Error**: "Persona not found"
- **Solution**: Make sure you selected a persona that has corpus uploaded

**Error**: "Analysis failed"
- **Solution**: Check backend logs for details. Might be an API key issue.

### No Feedback Generated

**Issue**: Analysis completes but no feedback cards appear
- **Solution**:
  1. Check browser console for errors
  2. Make sure persona has corpus (chunk count > 0)
  3. Try with different content

### Slow Performance

**Issue**: Analysis takes very long
- **Solution**:
  1. Normal for first run (building cache)
  2. Check Qdrant is running properly
  3. Reduce content length for testing

## Getting Help

### Check Logs

**Backend logs**:
```bash
# In backend terminal - you'll see all API requests and errors
```

**Frontend logs**:
```
# Open browser DevTools (F12)
# Check Console tab for errors
```

**Qdrant logs**:
```bash
docker-compose logs qdrant
```

### Common Issues

1. **"No personas available"**: Create one in the Personas tab
2. **"No corpus"**: Upload files to your persona
3. **"Select a persona first"**: Choose a persona from the dropdown
4. **"Analysis error"**: Check backend is running and API keys are set

### API Documentation

Visit `http://localhost:8000/docs` to see all backend endpoints and test them directly.

## Next Steps

- **Experiment**: Try different personas and writing styles
- **Refine**: Upload more corpus for better results
- **Share**: Export personas or flows (future feature)
- **Contribute**: Report issues or contribute code

Enjoy using Writing-Anima! 🎭✨
