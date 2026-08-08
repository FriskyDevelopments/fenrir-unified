# CPU-only a propósito: una GPU no se justifica para este volumen de imágenes.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/models \
    TRANSFORMERS_OFFLINE=0

WORKDIR /srv

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# El índice CPU de PyTorch evita bajar CUDA (~2 GB inútiles aquí).
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY classifiers.py app.py ./

# Los pesos se bajan en el build, no en la primera petición: un arranque en frío
# no debe depender de que Hugging Face esté disponible.
ARG NSFW_MODEL=Falconsai/nsfw_image_detection
ARG AGE_MODEL=nateraw/vit-age-classifier
RUN python -c "\
from transformers import pipeline; \
pipeline('image-classification', model='${NSFW_MODEL}', device=-1); \
pipeline('image-classification', model='${AGE_MODEL}', device=-1)"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD curl -fsS http://localhost:8080/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
