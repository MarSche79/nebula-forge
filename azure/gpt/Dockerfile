FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-bookworm
WORKDIR /app
# WorkIQ ships a pre-built linux-x64 binary that is glibc-linked, so we
# use the Debian-based Node image (NOT alpine). We install globally and
# accept the EULA at image-build time so the runtime subprocess starts
# clean (otherwise the first call prompts for EULA acceptance and stalls).
RUN npm install -g @microsoft/workiq --no-audit --no-fund --unsafe-perm \
 && workiq accept-eula \
 && workiq version
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
