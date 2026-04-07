FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Final stage: copy dist to a volume mount point.
# The docker-compose setup mounts a shared volume at /app/dist
# so Caddy can serve the static files directly.
FROM alpine:3.20

COPY --from=build /app/dist /app/dist

# Keep the container alive just long enough for the volume to be populated.
# docker-compose uses service_completed_successfully, so we exit cleanly.
CMD ["echo", "Web build complete"]
