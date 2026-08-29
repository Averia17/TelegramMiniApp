import os
from dataclasses import dataclass

from environs import Env


@dataclass(frozen=True)
class DbConfig:
    host: str
    password: str
    user: str
    database: str
    port: int = 5432

    def sqlalchemy_url(self) -> str:
        from sqlalchemy.engine.url import URL

        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.user,
            password=self.password,
            host=self.host,
            port=self.port,
            database=self.database,
        ).render_as_string(hide_password=False)


def load_db_config() -> DbConfig:
    env = Env()
    env.read_env()
    return DbConfig(
        host=env.str("NEWS_DB_HOST", "news-db"),
        password=env.str("POSTGRES_PASSWORD"),
        user=env.str("POSTGRES_USER"),
        database=env.str("POSTGRES_DB", "news"),
        port=env.int("NEWS_DB_PORT", 5432),
    )


def deployment_token() -> str:
    return os.getenv("DEPLOY_ADMIN_TOKEN", "")
