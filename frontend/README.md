# Writing-Anima Frontend

React frontend for the Writing-Anima writing analysis system.

## Features

- **Writing Canvas**: Rich text editor for your writing
- **Persona Management**: Create and manage writing analysis personas
- **Anima-Powered Feedback**: Get feedback grounded in persona corpora
- **Purpose & Criteria**: Define writing goals and evaluation criteria
- **Inquiry Complex**: Dialectical inquiry system for deep analysis
- **Project Management**: Save and organize writing projects

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Firebase credentials
```

3. Start development server:
```bash
npm start
```

The app will run at `http://localhost:3000`

## Prerequisites

- Node.js 16+ and npm
- Backend server running at `http://localhost:8000`
- Firebase project configured

## Scripts

- `npm start` - Run development server
- `npm build` - Create production build
- `npm test` - Run tests

## Project Structure

```
frontend/
├── src/
│   ├── components/        # React components
│   │   ├── Projects/      # Project dashboard
│   │   ├── PurposeStep/   # Purpose & criteria setup
│   │   ├── WritingInterface/  # Main editor
│   │   ├── InquiryComplex/    # Dialectical inquiry
│   │   ├── PersonaManager/    # Persona management (new)
│   │   └── Auth/          # Authentication
│   ├── services/          # API services
│   │   ├── firebase.js    # Firebase configuration
│   │   └── animaService.js # Anima backend API (new)
│   ├── contexts/          # React contexts
│   └── utils/             # Utility functions
├── public/                # Static assets
└── package.json          # Dependencies
```

## Configuration

### Environment Variables

- `REACT_APP_API_URL` - Anima backend URL (default: http://localhost:8000)
- `REACT_APP_WS_URL` - WebSocket URL for streaming (default: ws://localhost:8000)
- `REACT_APP_FIREBASE_*` - Firebase configuration

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication (Email/Password)
3. Create a Firestore database
4. Copy your Firebase config to `.env`

## Architecture Changes from Writing Assistant V2

### Removed
- ✗ Flow system (FlowExecutor, FlowDesigner, flow agents)
- ✗ OpenAI/Claude direct API calls from frontend
- ✗ Old backend server (Express)

### Added
- ✓ Persona management UI
- ✓ Anima backend integration
- ✓ WebSocket streaming support
- ✓ Corpus upload and management

### Preserved
- ✓ Firebase authentication and projects
- ✓ Purpose and criteria system
- ✓ Inquiry complex (dialectical inquiry)
- ✓ Writing interface and feedback display
- ✓ All existing UI components
