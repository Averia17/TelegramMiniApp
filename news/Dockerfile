FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml .
COPY . .
RUN pip install --no-cache-dir -e .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
