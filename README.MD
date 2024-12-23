Application build on https://github.com/Latand/MedSyncWebApp
### First project initialization
1. Copy .env.dist to .env file, update BOT_TOKEN to your bot token from @botfather
2. Copy frontend/.env.dist to frontend/.env file, update VITE_REACT_APP_API_URL=http://localhost:3779

### Up project
```bash
docker compose up
docker compose exec bot /venv/bin/python -m alembic upgrade head
```
