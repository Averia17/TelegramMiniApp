FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY src/battle_results_service/ ./
RUN go mod tidy && go mod download && CGO_ENABLED=0 go build -o /battle_results_service .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /battle_results_service .
COPY src/battle_results_service/init.sql .

CMD ["./battle_results_service"]
