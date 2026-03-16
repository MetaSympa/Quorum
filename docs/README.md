# Quorum Documentation

This directory contains complete developer documentation for the Quorum organization management dashboard.

---

## Documents

| Document | Description |
|----------|-------------|
| [setup-guide.md](setup-guide.md) | Local development setup: Node, PostgreSQL, Docker, env vars, seed data |
| [deployment-guide.md](deployment-guide.md) | LunaNode VPS deployment with Docker Compose, Caddy, UFW, and backups |
| [razorpay-setup.md](razorpay-setup.md) | Razorpay account, API keys, webhook configuration, test vs live mode |
| [whatsapp-setup.md](whatsapp-setup.md) | Meta Business account, API token, and all 8 message templates |
| [api-reference.md](api-reference.md) | All 29 API routes with methods, request/response schemas, auth requirements, and curl examples |
| [data-model.md](data-model.md) | All 10 database models, relationships, enum values, and field-level encryption notes |
| [security.md](security.md) | Auth, encryption, rate limiting, headers, webhook verification, backup/restore |
| [approval-flow.md](approval-flow.md) | Universal approval system: operator vs admin flow, entity types, DB changes, notifications |
| [testing-guide.md](testing-guide.md) | Running tests, test structure, seed accounts, test mode login, writing new tests |
| [architecture.md](architecture.md) | Tech stack, module structure, service layer pattern, file organisation, data flow |

---

## Quick Links

- [Test accounts](setup-guide.md#test-accounts)
- [Environment variables](setup-guide.md#configure-environment-variables)
- [Member ID format](data-model.md#member-id-format)
- [Payment amounts](razorpay-setup.md#6-payment-amounts-fixed)
- [WhatsApp templates](whatsapp-setup.md#5-register-message-templates)
- [Backup procedure](security.md#backup-and-restore)
- [Role permissions matrix](architecture.md#module-structure)

---

## For the root README

See [../README.md](../README.md) for the quick start, tech stack summary, and feature list.
