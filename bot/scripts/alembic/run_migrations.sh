read -p "Enter name of DB container:  " container
docker compose exec $container python -m alembic upgrade head