# ---- Build frontend ----
FROM node:20-alpine AS web-builder

WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ .
RUN npm run build

# ---- Build API ----
FROM golang:1.25-alpine AS api-builder

RUN apk add --no-cache git ca-certificates
WORKDIR /build
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /build/trailforge-api ./cmd/server

# ---- Runtime ----
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=api-builder /build/trailforge-api /app/trailforge-api
COPY --from=api-builder /build/migrations /app/migrations
COPY --from=web-builder /web/dist /srv/web

EXPOSE 8080

ENTRYPOINT ["/app/trailforge-api"]
