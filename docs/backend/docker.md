# Docker

## Backend Container

Dockerfile in `src/backend/Dockerfile`.

## Building

```bash
cd src/backend
docker build -t trainaabackend .
```

## Running

```bash
docker run -p 8000:8000 --env-file .env trainaabackend
```

## Docker Compose

TBD - Add docker-compose configuration if needed.

```bash
# to access the running container
docker exec -i trainaabackend /bin/bash
```

