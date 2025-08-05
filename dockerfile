# Base image
FROM ghcr.io/promptfoo/promptfoo:0.117.1

# user setting
USER root

# environment variables
ENV PROMPTFOO_API_PORT=3001

# api file copy
COPY ./app.js /app/promptfoo_api/app.js

# python module install
RUN pip install openai mlflow --break-system-packages

# node module install(sqlite3)
RUN npm install sqlite3

# node server run
WORKDIR /app
CMD node dist/src/server/index.js & node promptfoo_api/app.js

