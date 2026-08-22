FROM golang:1.26.6-alpine AS development
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
RUN go install github.com/air-verse/air@v1.62.0
CMD ["air", "-c", ".air.toml"]

FROM golang:1.26.6-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /party-service .

FROM alpine:3.22
COPY --from=build /party-service /party-service
EXPOSE 8002
ENTRYPOINT ["/party-service"]
