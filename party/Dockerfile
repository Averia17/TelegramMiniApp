FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /party-service .

FROM alpine:3.20
COPY --from=build /party-service /party-service
EXPOSE 8002
ENTRYPOINT ["/party-service"]
