FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
# Static JSON assets imported by the API at runtime (e.g. demo CV payloads).
# tsc doesn't emit .json files, so we copy them in directly to mirror the
# `src/data` → `dist/data` layout the code expects via `../data/...`.
COPY --from=build /app/src/data ./dist/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
