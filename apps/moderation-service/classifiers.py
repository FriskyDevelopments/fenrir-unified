"""
Clasificadores CPU-only. Dos preguntas, dos modelos especializados — no un VLM
generalista: para "¿aparenta ser menor?" un clasificador entrenado para eso le
gana a un modelo general, y además se puede evaluar contra un set propio.

Los modelos se descargan en el build de la imagen (ver Dockerfile), no en la
primera petición, para que el arranque en frío no dependa de la red.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import torch
from PIL import Image
from transformers import pipeline

# NSFW: Falconsai/nsfw_image_detection (Apache-2.0, ViT). Sirve para SABER si la
# imagen es explícita — no para bloquearla: en estas comunidades el contenido
# sexual adulto está permitido. Se registra, no se rechaza.
NSFW_MODEL = os.getenv("NSFW_MODEL", "Falconsai/nsfw_image_detection")

# Edad aparente: éste ES el control. Revisar la licencia del modelo elegido
# ANTES de usarlo comercialmente — varios modelos de edad populares
# (InsightFace buffalo, algunos MiVOLO) son solo para investigación.
AGE_MODEL = os.getenv("AGE_MODEL", "nateraw/vit-age-classifier")

torch.set_num_threads(int(os.getenv("TORCH_THREADS", "4")))


@dataclass
class Verdict:
    person: bool
    explicit: bool
    # Punto medio del rango de edad estimado; None si no hubo lectura de edad.
    apparent_age: int | None

    def decision(self, allow_at: int, reject_below: int) -> str:
        """
        Tres estados, no dos. La duda no se resuelve rechazando: se manda a
        revisión humana.

        - `reject`  edad claramente por debajo del mínimo legal. Se bloquea de
                    inmediato y NO entra a la cola: nadie tiene que mirar eso
                    para decidir.
        - `review`  banda de incertidumbre, o hay persona y no hubo lectura de
                    edad. Decide un admin.
        - `allow`   por encima del umbral de confianza.
        """
        if not self.person:
            return "allow"
        if self.apparent_age is None:
            return "review"
        if self.apparent_age < reject_below:
            return "reject"
        if self.apparent_age < allow_at:
            return "review"
        return "allow"


class ClassifierBundle:
    def __init__(self) -> None:
        device = -1  # CPU siempre: la GPU no se justifica para este volumen.
        self.nsfw = pipeline("image-classification", model=NSFW_MODEL, device=device)
        self.age = pipeline("image-classification", model=AGE_MODEL, device=device)
        self.model_id = f"{NSFW_MODEL}+{AGE_MODEL}"

    def describe(self) -> dict[str, str]:
        return {"nsfw": NSFW_MODEL, "age": AGE_MODEL}

    def classify(self, image: Image.Image) -> Verdict:
        nsfw_scores = {r["label"].lower(): r["score"] for r in self.nsfw(image)}
        explicit = nsfw_scores.get("nsfw", 0.0) >= 0.5

        age_results = self.age(image)
        apparent_age = _age_from_labels(age_results)
        # LIMITACIÓN CONOCIDA: un clasificador siempre devuelve alguna etiqueta,
        # también sobre una foto sin personas — así que esto sobre-detecta y el
        # servicio peca de estricto (rechaza de más, no de menos). Aceptable
        # como punto de partida, pero antes de producción hay que anteponer un
        # detector de rostros real y solo entonces estimar edad.
        person = apparent_age is not None

        return Verdict(person=person, explicit=explicit, apparent_age=apparent_age)


def _age_from_labels(results: list[dict]) -> int | None:
    """
    Convierte etiquetas tipo "20-29" / "3-9" al punto medio del rango.
    Se queda con la etiqueta de mayor score que sepa interpretar.
    """
    for result in sorted(results, key=lambda r: r["score"], reverse=True):
        label = str(result["label"]).strip()
        parts = label.replace("+", "-120").split("-")
        if len(parts) == 2 and all(p.strip().isdigit() for p in parts):
            low, high = int(parts[0]), int(parts[1])
            return (low + high) // 2
        if label.isdigit():
            return int(label)
    return None
