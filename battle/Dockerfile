FROM golang:1.24-alpine AS development
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
RUN go install github.com/air-verse/air@v1.62.0
CMD ["air", "-c", ".air.toml"]

FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o battle-server .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/battle-server .
EXPOSE 8000
CMD ["./battle-server"]
