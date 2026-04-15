FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS engine-build
WORKDIR /eng
COPY engine/html-to-figma/package*.json ./
RUN npm install --no-audit --no-fund
COPY engine/html-to-figma/ ./
RUN npm run build:package || npx tsc

FROM mcr.microsoft.com/playwright:v1.59.1-jammy
WORKDIR /app

COPY backend/package*.json ./
RUN npm install --no-audit --no-fund

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc

COPY --from=engine-build /eng/build ./engine/html-to-figma/build
COPY --from=engine-build /eng/node_modules ./engine/html-to-figma/node_modules
COPY --from=engine-build /eng/package.json ./engine/html-to-figma/package.json

ENV NODE_ENV=production
ENV PORT=3000
ENV ENGINE_ENTRY_PATH=/app/engine/html-to-figma/build/browser/index.js
EXPOSE 3000

CMD ["node", "dist/index.js"]
