# VPS Discord Bot Hosting - Prototype

This repository contains a minimal prototype for hosting Discord bots on a single VPS using Docker.

Features included:
- API (Express + dockerode) to create/start/stop/manage bot containers programmatically
- Simple web UI to create/list/manage bots
- docker-compose for local VPS deployment
- Example bot templates (Node & Python)

WARNING: This is an initial prototype. It mounts the Docker socket into the API container for orchestration which grants the API full control of Docker on the host. Only run on a trusted private VPS and read the security notes below before production use.

Quickstart (Ubuntu 22.04):
1. SSH into your VPS and install Docker & docker-compose.
2. Clone this repo into /opt/vps-hosting.
3. Copy the example env file for the API and set ADMIN_TOKEN and OWNER_EMAIL.

  cp api/.env.example api/.env
  # edit api/.env and set ADMIN_TOKEN and OWNER_EMAIL

4. Start services:
  docker compose up -d --build

5. Open the web UI on port 3000 (or configure a reverse proxy and TLS).

Admin API (simple token auth): set ADMIN_TOKEN in api/.env and include header `x-admin-token: <ADMIN_TOKEN>` on API requests. The owner email is set with OWNER_EMAIL.

Security & next steps:
- Replace socket mount approach with a small privileged host agent or use Docker Engine TLS for remote control.
- Add persistent DB (Postgres) for users, metadata, and secrets; encrypt tokens at rest.
- Add authentication, user accounts, and Stripe billing integration.
- Add monitoring, resource quotas, and container isolation (seccomp/AppArmor).

See the README sections below and the code in `/api` and `/web` for implementation details.
