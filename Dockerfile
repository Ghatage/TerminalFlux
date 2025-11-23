# =============================================
# Stage 1: Build Dependencies
# =============================================
FROM node:20-alpine AS builder

LABEL maintainer="Anup Ghatage"
LABEL description="TerminalFlux - Three.js AI-Generated Game (Builder Stage)"

WORKDIR /app

# Install build dependencies required for native modules (sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --only=production

# =============================================
# Stage 2: Runtime Image
# =============================================
FROM node:20-alpine

LABEL maintainer="Anup Ghatage"
LABEL description="TerminalFlux - Three.js AI-Generated Game"
LABEL version="1.0"

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    curl

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy package.json for reference
COPY package.json ./

# Copy application code
COPY server.js ./
COPY app.js ./
COPY index.html ./

# Copy service modules
COPY database/ ./database/
COPY services/ ./services/
COPY utils/ ./utils/

# Copy static assets (models and music)
COPY assets/models/ ./assets/models/
COPY assets/music/ ./assets/music/

# Copy legacy ground texture if it exists
COPY ground-texture.png ./ground-texture.png

# Create directories for dynamic content (will be mounted as volumes)
RUN mkdir -p /app/assets /app/database && \
    chmod -R 755 /app/assets /app/database

# Expose port 8081
EXPOSE 8081

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8081/api/health || exit 1

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Start the server
CMD ["node", "server.js"]
