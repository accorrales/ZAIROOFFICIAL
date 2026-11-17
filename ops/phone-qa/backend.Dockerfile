FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY scripts/phone-qa ./scripts/phone-qa
RUN chmod -R a+rX /app
USER node
CMD ["node", "scripts/phone-qa/serve.cjs"]
