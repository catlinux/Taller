FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Taller/taller-bicicletas/ ./
RUN sed -i -E 's#^(programarBackupAutomatico\(\)|setInterval\(programarBackupAutomatico)#// \1#' server/index.js && npm ci && npm run build
ENV NODE_ENV=production PORT=3001 DATABASE_URL=file:./dev.db DATA_DIR=/data
COPY entrypoint.sh /entrypoint.sh
CMD ["bash", "/entrypoint.sh"]
