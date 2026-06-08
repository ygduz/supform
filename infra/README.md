# Infra

Deployment & ops live here. Local development uses the root
[`docker-compose.yml`](../docker-compose.yml); this folder is for production-grade
concerns as the project matures.

Planned contents:

```
infra/
  docker/         production Dockerfiles / compose overrides
  nginx/          reverse proxy + TLS termination config
  k8s/            (optional) Helm chart / manifests
  terraform/      (optional) cloud provisioning
```

## Production checklist (M4+)

- [ ] Separate `docker-compose.prod.yml` (no bind mounts, built images, restart policies)
- [ ] Postgres backups + connection pooling (PgBouncer)
- [ ] S3-compatible object storage for media/attachments
- [ ] Secrets via environment / secret manager (never committed)
- [ ] HTTPS via nginx/Caddy + automatic certs
- [ ] Healthchecks & log aggregation
