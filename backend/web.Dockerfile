FROM python:3.12-slim

RUN pip install -U pip wheel setuptools && mkdir /src && mkdir /src/src

COPY pyproject.toml /src/

RUN pip install '/src[web]'

WORKDIR /src

COPY src /src/src

CMD ["uvicorn", "miniapp.webhook.app:app", "--host", "0.0.0.0", "--reload", "--port", "8000", "--workers", "4"]