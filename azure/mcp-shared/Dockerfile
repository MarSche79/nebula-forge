# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY agents/nebula-hr/package.json ./agents/nebula-hr/
COPY agents/nebula-materials/package.json ./agents/nebula-materials/
COPY agents/nebula-exploration/package.json ./agents/nebula-exploration/
COPY agents/nebula-science/package.json ./agents/nebula-science/
COPY agents/nebula-safety/package.json ./agents/nebula-safety/
COPY agents/nebula-engineering/package.json ./agents/nebula-engineering/
COPY agents/nebula-logistics/package.json ./agents/nebula-logistics/
COPY agents/nebula-comms/package.json ./agents/nebula-comms/
COPY agents/nebula-medbay/package.json ./agents/nebula-medbay/
COPY agents/nebula-scribe/package.json ./agents/nebula-scribe/
COPY agents/nebula-herald/package.json ./agents/nebula-herald/
COPY agents/nebula-sentinel/package.json ./agents/nebula-sentinel/
COPY agents/nebula-auditor/package.json ./agents/nebula-auditor/
COPY agents/nebula-whisperer/package.json ./agents/nebula-whisperer/
RUN npm install --omit=dev=false

# Copy source
COPY tsconfig.json ./
COPY packages ./packages
COPY agents ./agents

# Runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app /app
ARG AGENT_NAME
ENV AGENT_NAME=${AGENT_NAME}
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npx tsx agents/${AGENT_NAME}/src/main.ts"]
