FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
