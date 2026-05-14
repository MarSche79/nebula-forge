FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
# Pre-install WorkIQ globally so the first chat request doesn't pay the
# npx cold-start tax (and so the image is immutable in production).
RUN npm install -g @microsoft/workiq --no-audit --no-fund
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
