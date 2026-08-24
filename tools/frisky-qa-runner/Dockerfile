# Apify base image with Node 20 + Playwright + Chromium preinstalled.
FROM apify/actor-node-playwright-chrome:20

# Install prod deps (Playwright itself is provided by the base image).
COPY --chown=myuser:myuser package.json ./
RUN npm install --omit=dev --no-optional --no-audit --no-fund \
    && echo "installed deps:" && npm ls || true

COPY --chown=myuser:myuser . ./

CMD ["node", "main.js"]
