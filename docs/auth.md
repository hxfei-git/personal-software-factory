# API Authentication

All write routes require `Authorization: Bearer <PSF_API_TOKEN>` unless `PSF_AUTH_DISABLED=true`.
Use disabled auth only for local development and automated tests. `GET /health` remains public.
