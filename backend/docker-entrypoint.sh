#!/bin/sh
set -e

# Apply database schema
npx prisma db push

# Start the server
exec node dist/server.js
