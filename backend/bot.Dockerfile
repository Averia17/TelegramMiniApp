FROM python:3.12-slim

RUN pip install -U pip wheel setuptools && mkdir /src && mkdir /src/src

COPY pyproject.toml /src/

RUN pip install '/src[bot]'

WORKDIR /src

COPY src /src/src

CMD  ["python", "-m", "miniapp.tgbot.bot"]
