FROM golang:1.21-alpine AS builder
WORKDIR /app

COPY src/battle_results_service/go.mod ./
COPY src/battle_results_service/go.sum* ./

COPY src/battle_results_service/ .

RUN go mod tidy && go mod download

RUN CGO_ENABLED=0 go build -o /main .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /main .
COPY src/battle_results_service/init.sql .

CMD ["./main"]