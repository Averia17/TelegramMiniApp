from pathlib import Path

MIGRATION_ENV = Path(__file__).parents[1] / "migrations" / "env.py"


def test_online_migrations_commit_the_advisory_lock_transaction():
    source = MIGRATION_ENV.read_text(encoding="utf-8")

    assert "async with connectable.begin() as connection:" in source
