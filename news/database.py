from config import load_db_config
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

db_config = load_db_config()
engine = create_async_engine(
    db_config.sqlalchemy_url(),
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
session_pool = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
