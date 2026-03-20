# Data Generator Service

Отдельный сервис для генерации синтетических данных под основной backend.

Сервис автономный и не требует изменений в `backend`.

## Что умеет

- Генерирует один снимок данных дома (`/generate/snapshot`)
- Генерирует пачку исторических снимков (`/generate/batch`)
- Опционально отправляет сгенерированный снимок в любой endpoint основного backend (`/forward/snapshot`)

## Структура

```
data-generator-service/
  src/
    app.py
    config.py
    generator.py
    models.py
  requirements.txt
  .env.example
```

## Запуск

```bash
cd data-generator-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.app:app --reload --port 8010 --host 0.0.0.0
```

## Примеры запросов

### 1) Один snapshot

```bash
curl -X POST http://localhost:8010/generate/snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "house_id": "house-1",
    "apartments_count": 8
  }'
```

### 2) Batch snapshot-ов

```bash
curl -X POST http://localhost:8010/generate/batch \
  -H "Content-Type: application/json" \
  -d '{
    "house_id": "house-1",
    "apartments_count": 8,
    "count": 24,
    "step_minutes": 60
  }'
```

### 3) Отправка в основной backend

```bash
curl -X POST http://localhost:8010/forward/snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "http://localhost:8000/your-ingest-endpoint",
    "house_id": "house-1",
    "apartments_count": 8
  }'
```

Если не передавать `target_url`, сервис использует `DEFAULT_TARGET_URL` из `.env`.
