FROM python:3.13-slim

RUN pip install -U pip wheel setuptools

WORKDIR /app

COPY pyproject.toml .
COPY src ./src

RUN pip install '.[battle]'

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "battle_service.app:app", "--host", "0.0.0.0", "--reload", "--port", "8000"]
