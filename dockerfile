# Use official Node.js runtime
FROM node:22-alpine

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Expose app port
EXPOSE 3000

# Start app
CMD ["node", "src/app.js"]