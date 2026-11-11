# Build from the repository root: docker build -f near-bridge/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY near-bridge/package.json near-bridge/package.json
RUN npm ci -w near-bridge --omit=dev --ignore-scripts
COPY near-bridge/src near-bridge/src
USER node
ENV BRIDGE_HOST=0.0.0.0 BRIDGE_PORT=8090
EXPOSE 8090
CMD ["node", "--experimental-strip-types", "--no-warnings=ExperimentalWarning", "near-bridge/src/main.ts"]
