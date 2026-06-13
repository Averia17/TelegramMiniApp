from dataclasses import dataclass
from typing import Optional

from environs import Env


@dataclass
class DbConfig:
    host: str
    password: str
    user: str
    database: str
    port: int = 5432

    def construct_sqlalchemy_url(self, driver="asyncpg", host=None, port=None) -> str:
        from sqlalchemy.engine.url import URL

        if not host:
            host = self.host
        if not port:
            port = self.port
        uri = URL.create(
            drivername=f"postgresql+{driver}",
            username=self.user,
            password=self.password,
            host=host,
            port=port,
            database=self.database,
        )
        return uri.render_as_string(hide_password=False)

    @staticmethod
    def from_env(env: Env):
        host = env.str("DB_HOST")
        password = env.str("POSTGRES_PASSWORD")
        user = env.str("POSTGRES_USER")
        database = env.str("POSTGRES_DB")
        port = env.int("DB_PORT", 5432)
        return DbConfig(
            host=host, password=password, user=user, database=database, port=port
        )


@dataclass
class Config:
    db: Optional[DbConfig] = None


def load_config(path: str = None) -> Config:
    env = Env()
    env.read_env(path)
    return Config(db=DbConfig.from_env(env))
