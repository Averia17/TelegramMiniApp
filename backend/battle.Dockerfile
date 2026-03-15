FROM python:3.13-slim

RUN pip install -U pip wheel setuptools && mkdir -p /app/src

COPY pyproject.toml /app/

RUN pip install '/app[battle]'

WORKDIR /app

COPY src /app/src

ENV PYTHONPATH=/app/src

CMD ["uvicorn", "battle_service.app:app", "--host", "0.0.0.0", "--port", "8000"]
