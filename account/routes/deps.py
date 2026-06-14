from config import load_config
from infrastructure.database.repo import Repo
from infrastructure.database.setup import create_engine, create_session_pool

config = load_config()
engine = create_engine(config.db)
session_pool = create_session_pool(engine)


async def get_repo():
    async with session_pool() as session:
        yield Repo(session)