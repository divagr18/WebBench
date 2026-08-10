FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY analysis/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/schema/package.json packages/schema/
COPY packages/llm/package.json packages/llm/
COPY packages/generator/package.json packages/generator/
COPY packages/evaluator/package.json packages/evaluator/
COPY apps/echoweb/package.json apps/echoweb/
COPY apps/runner/package.json apps/runner/
COPY apps/cli/package.json apps/cli/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY prompts ./prompts
COPY analysis ./analysis
COPY datasets/dev ./datasets/dev

ENV NODE_OPTIONS="--max-old-space-size=2048"

ENTRYPOINT ["pnpm", "echobench"]
CMD ["help"]
