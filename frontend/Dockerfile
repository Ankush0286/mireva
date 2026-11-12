FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors from frontend directory
COPY frontend/package*.json ./
RUN npm install

# Copy frontend source code and compile Vite production bundle
COPY frontend/ .
RUN npm run build


FROM caddy:2-alpine AS runner

# Copy compiled static assets from builder stage to Caddy's default webroot
COPY --from=builder /app/dist /srv

# Copy the unified Caddyfile from the repo root
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443 443/udp

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]