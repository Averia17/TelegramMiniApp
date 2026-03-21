from shop_service.config import Config, load_config
from shop_service.infrastructure.database.repo.requests import RequestsRepo
from shop_service.infrastructure.database.setup import create_engine, create_session_pool

config: Config = load_config()
engine = create_engine(config.db)
session_pool = create_session_pool(engine)


async def get_repo():
    async with session_pool() as session:
        yield RequestsRepo(session)
