FROM python:3.13-slim

RUN pip install -U pip wheel setuptools

WORKDIR /app

COPY pyproject.toml .
COPY src ./src

RUN pip install '.[bot]'

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

CMD  ["python", "-m", "miniapp.tgbot.bot"]
