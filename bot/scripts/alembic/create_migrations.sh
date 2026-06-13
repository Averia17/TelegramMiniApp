read -p "Enter name of DB container:  " container
read -p "Enter name of migration: " message
docker compose exec $container python -m alembic revision --autogenerate -m "$message"