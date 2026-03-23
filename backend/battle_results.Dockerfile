FROM golang:1.26.1-alpine

RUN go install github.com/air-verse/air@v1.64.5

WORKDIR /app

COPY src/battle_results_service/go.mod src/battle_results_service/go.sum* ./
RUN go mod download

COPY src/battle_results_service/ .

CMD ["air"]