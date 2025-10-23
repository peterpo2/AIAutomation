# 🧱 SmartOps Docker + Prisma Commands Cheat-Sheet

## 🟢 1. Build & start all containers
```bash
docker compose up -d --build
```

## 🧹 2. Stop and remove containers
```bash
docker compose down
```
Remove volumes too (clean start):
```bash
docker compose down -v
```

## 🧭 3. Check container status
```bash
docker compose ps
```

## 📜 4. View logs
```bash
docker compose logs -f
```
Filter by service:
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## 🧰 5. Run Prisma migrations (deploy existing)
```bash
docker compose exec backend npx prisma migrate deploy
```

## 🧩 6. Create and apply first migration
```bash
docker compose exec backend npx prisma migrate dev --name init
```
Alternative (manual):
```bash
docker compose exec backend npx prisma migrate dev --name init --create-only
docker compose exec backend npx prisma db push
```

## 🔄 7. Regenerate Prisma client
```bash
docker compose exec backend npx prisma generate
```

## 🧮 8. Inspect database tables
```bash
docker compose exec db psql -U postgres -d postgres -c "\dt"
```
View contents of a table:
```bash
docker compose exec db psql -U postgres -d postgres -c "SELECT * FROM \"User\";"
```

## 🧠 9. Restart specific services
```bash
docker compose restart backend
docker compose restart frontend
```

## 🧼 10. Rebuild only one service
```bash
docker compose build backend
docker compose up -d backend
```

## 🛠 11. Drop and reset database (dev only)
```bash
docker compose exec backend npx prisma migrate reset
```

## ⚙️ 12. Health checks
```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/docs
```

## 🧩 13. Open Prisma Studio (GUI)
```bash
docker compose exec backend npx prisma studio
```

## 🧰 14. Clean up unused Docker data (optional)
```bash
docker system prune -a
```

---
© SmartOps Automation Stack — Docker + Prisma Quick Reference
