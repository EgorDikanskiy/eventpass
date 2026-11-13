FROM python:3.12-alpine
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apk add --no-cache font-dejavu tzdata && adduser -D eventpass
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
USER eventpass
CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8080", "--forwarded-allow-ips=*", "--no-access-log"]
