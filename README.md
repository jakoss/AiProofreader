# AI Proofreader

Small self-hosted proofreading web app built with TanStack Start, React, TypeScript, Aspire TypeScript AppHost, Docker Compose, and an OpenAI-compatible Bifrost gateway.

## Local Web App

```bash
cd proofreader-web
npm install
npm run dev
```

The app listens on `http://localhost:3000`.

## Aspire

Install the Aspire CLI, then run:

```bash
npm run aspire
```

The TypeScript AppHost is in `apphost.mts` and starts:

- `proofreader-web`
- `bifrost-gateway`

Bifrost config/data is persisted in the named volume `bifrost-gateway-data`, mounted at `/app/data`.

## Docker Compose

Update the Bifrost image in `docker-compose.yml`, then run:

```bash
docker compose up --build
```

## Configuration

`proofreader-web` reads:

```env
MODEL_PROVIDER_BASE_URL=http://bifrost-gateway:8080/v1
MODEL_PROVIDER_MODEL=<model-id>
MODEL_PROVIDER_AUTHORIZATION_HEADER=
```

Provider credentials can stay in Bifrost configuration. If you point the app directly at a provider, set `MODEL_PROVIDER_AUTHORIZATION_HEADER` to the complete authorization header value, such as `Bearer <token>`. The web app sends proofreading requests to the configured model through an OpenAI-compatible `/chat/completions` endpoint.
