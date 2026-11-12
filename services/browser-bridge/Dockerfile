FROM golang:1.25-bookworm AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/mireva-bridge ./cmd/server

FROM debian:bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/bin/mireva-bridge /app/mireva-bridge

EXPOSE 8080

ENV BRIDGE_PORT="8080" \
    GIN_MODE="release" \
    BRIDGE_HEADLESS="true"

CMD ["/app/mireva-bridge"]