FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

# The volume holds WhatsApp auth state and high-water marks.
ENV STATE_DIR=/data

CMD ["node", "--experimental-strip-types", "src/index.ts"]
