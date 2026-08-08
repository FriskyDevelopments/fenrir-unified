"""
Fenrir Moderation Service — clasificación de imágenes self-hosted, solo CPU.

Por qué self-hosted: los ToS de Mistral/OpenAI/Google prohíben contenido sexual
explícito. Mandarles el material de una comunidad adulta no es solo exponer la
privacidad de sus miembros, es arriesgarse a que cierren la cuenta. Aquí nada
sale de la infraestructura propia.

Qué NO resuelve: el match contra hashes conocidos de CSAM. Esas listas
(NCMEC/PhotoDNA) no son distribuibles — por diseño, para que no se usen para
evadirlas. Esa capa se queda en Cloudflare CSAM Scanning. Ver el README.

Contrato: expone `/v1/chat/completions` imitando la forma de OpenAI, para que
`fenrir-bridge/functions/_lib/image-guard` apunte aquí cambiando solo `baseUrl`,
sin tocar una línea de TypeScript.
"""

from __future__ import annotations

import base64
import binascii
import io
import os
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel

from classifiers import ClassifierBundle, Verdict

# Dos umbrales, no uno — porque hay tres desenlaces posibles:
#   edad >= ALLOW_AT ................ pasa
#   REJECT_BELOW <= edad < ALLOW_AT .. revisión humana
#   edad < REJECT_BELOW ............. se bloquea de inmediato
# La banda intermedia es deliberadamente ancha: la incertidumbre la resuelve
# una persona, no el umbral.
ALLOW_AT_AGE = int(os.getenv("MIN_APPARENT_AGE", "25"))
REJECT_BELOW_AGE = int(os.getenv("REJECT_BELOW_AGE", "18"))

# Clave compartida con el llamador (image-guard manda Authorization: Bearer).
API_KEY = os.getenv("MODERATION_API_KEY", "")

MAX_IMAGE_BYTES = 12 * 1024 * 1024

app = FastAPI(title="Fenrir Moderation Service", version="1.0")
bundle = ClassifierBundle()


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[dict[str, Any]]
    max_tokens: int | None = None
    temperature: float | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "models": bundle.describe(),
        "allow_at_age": ALLOW_AT_AGE,
        "reject_below_age": REJECT_BELOW_AGE,
    }


@app.post("/v1/chat/completions")
def chat_completions(
    body: ChatRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")

    image = _extract_image(body.messages)
    started = time.perf_counter()
    verdict = bundle.classify(image)
    decision = verdict.decision(ALLOW_AT_AGE, REJECT_BELOW_AGE)
    latency_ms = int((time.perf_counter() - started) * 1000)

    return {
        "id": f"modsvc-{int(time.time() * 1000)}",
        "object": "chat.completion",
        "model": bundle.model_id,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": _render(verdict, decision)},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        # Extra fuera del contrato de OpenAI: el llamador puede ignorarlo, pero
        # sirve para auditar decisiones sin re-inferir.
        "fenrir": {
            "decision": decision,  # allow · review · reject
            "person": verdict.person,
            "explicit": verdict.explicit,
            "apparent_age": verdict.apparent_age,
            "allow_at_age": ALLOW_AT_AGE,
            "reject_below_age": REJECT_BELOW_AGE,
            "needs_human_review": decision == "review",
            "review_reason": _review_reason(verdict, decision),
            "latency_ms": latency_ms,
        },
    }


def _review_reason(verdict: Verdict, decision: str) -> str | None:
    """Por qué se manda a una persona. Es lo primero que el admin necesita ver."""
    if decision != "review":
        return None
    if verdict.apparent_age is None:
        return "no_age_reading"
    return "age_near_threshold"


def _render(verdict: Verdict, decision: str) -> str:
    """
    Formato que image-guard ya sabe parsear (PERSON/APPROPRIATE/ENTERING),
    más los campos propios de esta política.

    APPROPRIATE se decide SOLO por edad aparente, no por desnudez: el contenido
    sexual adulto está permitido en estas comunidades. En `review` va como `No`
    para que el llamador no publique mientras espera al humano.
    """
    lines = [
        f"PERSON:{'Yes' if verdict.person else 'No'}",
        f"APPROPRIATE:{'Yes' if decision == 'allow' else 'No'}",
        "ENTERING:Yes",  # no aplica a este perfil; se mantiene por compatibilidad
        f"DECISION:{decision.upper()}",
        f"EXPLICIT:{'Yes' if verdict.explicit else 'No'}",
        f"APPARENT_AGE:{verdict.apparent_age if verdict.apparent_age is not None else 'Unknown'}",
    ]
    return "\n".join(lines)


def _extract_image(messages: list[dict[str, Any]]) -> Image.Image:
    """Saca la primera image_url (data URI) del mensaje estilo OpenAI."""
    for message in messages:
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if part.get("type") != "image_url":
                continue
            url = (part.get("image_url") or {}).get("url", "")
            if not url.startswith("data:"):
                raise HTTPException(status_code=400, detail="only data URIs are accepted")
            try:
                payload = url.split(",", 1)[1]
                raw = base64.b64decode(payload, validate=True)
            except (IndexError, binascii.Error) as exc:
                raise HTTPException(status_code=400, detail="malformed data URI") from exc
            if len(raw) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="image too large")
            try:
                return Image.open(io.BytesIO(raw)).convert("RGB")
            except OSError as exc:
                raise HTTPException(status_code=400, detail="unreadable image") from exc
    raise HTTPException(status_code=400, detail="no image in request")
