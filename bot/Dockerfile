FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml .
COPY . .
RUN pip install --no-cache-dir -e .

CMD ["python", "-m", "bot"]
