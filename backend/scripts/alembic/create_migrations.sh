read -p "Enter name of migration: " message
docker compose exec bot /venv/bin/python -m alembic revision --autogenerate -m "$message"