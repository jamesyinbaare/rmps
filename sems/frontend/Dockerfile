FROM node:20-alpine

WORKDIR /app

# Copy package files (+ .npmrc for legacy-peer-deps / lucide peer range)
COPY package*.json .npmrc ./

# Install dependencies
RUN npm ci

# Copy application files
COPY . .

# Expose Next.js port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev"]
