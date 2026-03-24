# Setup & Installation

## Prerequisites

- Node.js 18+ or Python 3.9+
- Git
- Manifold Markets API key (from https://manifold.markets/account)
- Code editor (VS Code recommended)

## Project Setup

### 1. Clone/Initialize Repository
```bash
cd dayli
git init
```

### 2. Backend Setup

#### Python (Recommended)
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt
```

#### Node.js
```bash
cd backend
npm init -y
npm install axios ws dotenv
```

### 3. Frontend Setup
```bash
cd frontend
npm create vite@latest . -- --template react
# or
npx create-react-app .
npm install axios

# Install dependencies
npm install
```

### 4. Configuration

#### Create `.env` file (root or backend/)
```env
MANIFOLD_API_KEY=your_api_key_here
MANIFOLD_API_URL=https://api.manifold.markets
ENVIRONMENT=development  # or production
LOG_LEVEL=info
```

#### Never commit `.env` - add to `.gitignore`
```
.env
.env.local
node_modules/
venv/
__pycache__/
.DS_Store
```

### 5. Directory Structure Setup

```
backend/
├── src/
│   ├── api/              # API client wrappers
│   ├── strategy/         # Strategy & prediction models
│   ├── trading/          # Trade execution logic
│   ├── portfolio/        # Portfolio tracking
│   ├── monitor/          # Logging & monitoring
│   └── scheduler/        # Task scheduling
├── tests/
├── requirements.txt
└── main.py

frontend/
├── src/
│   ├── components/       # React components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom hooks
│   ├── utils/           # Utilities
│   ├── App.jsx
│   └── index.jsx
├── public/
├── package.json
└── vite.config.js
```

### 6. Development Server

#### Backend
```bash
cd backend
# Python
python main.py

# Node.js
npm run dev
```

#### Frontend
```bash
cd frontend
npm run dev
```

Access dashboard at `http://localhost:5173` (Vite)

## Testing Setup

### Unit Tests
```bash
# Python
pip install pytest
pytest tests/

# Node.js
npm install --save-dev jest
npm test
```

### Paper Trading
Before live trading, test with:
1. Manifold Markets testnet (if available)
2. Paper trading mode (simulated trades)
3. Small initial position sizes

## Deployment

See [docs/DEPLOYMENT.md](DEPLOYMENT.md) for production setup.

## Troubleshooting

### API Key Issues
- Verify key in https://manifold.markets/account
- Ensure key has required permissions
- Check `.env` file is properly formatted

### Connection Issues
- Verify internet connectivity
- Check Manifold Markets API status
- Review rate limiting and implement backoff

### Performance Issues
- Enable logging to identify bottlenecks
- Cache market data locally
- Implement connection pooling for API requests

## Next Steps

1. Implement API client
2. Build market data fetcher
3. Create strategy model
4. Build dashboard UI
5. Integrate & test
6. Deploy
