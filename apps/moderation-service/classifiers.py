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

import cv2
import numpy as np
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
        - `review`  banda de incertidumbre, o contenido explícito cuya edad no
                    se puede verificar. Decide un admin.
        - `allow`   por encima del umbral, o imagen sin personas ni explícito.
        """
        if not self.person:
            # Sin rostro detectable: un paisaje pasa, pero contenido explícito
            # cuya edad NO se puede verificar va a revisión. Que el detector
            # falle no puede convertirse en vía libre.
            return "review" if self.explicit else "allow"
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

        # El detector de rostros decide SI se estima edad. Antes "hay persona"
        # se infería de que el clasificador devolvió etiqueta — pero un
        # clasificador siempre devuelve algo, también sobre un paisaje.
        person = _has_face(image)
        apparent_age = _age_from_labels(self.age(image)) if person else None

        return Verdict(person=person, explicit=explicit, apparent_age=apparent_age)


_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def _has_face(image: Image.Image) -> bool:
    """
    ¿Hay al menos un rostro? Haar cascade de OpenCV: va incluido en el paquete,
    licencia permisiva y corre en milisegundos en CPU.

    Detecta rostros frontales; los de perfil o muy oscuros se le escapan. Por
    eso `decision()` manda a revisión el explícito sin rostro en vez de dejarlo
    pasar: un fallo del detector no puede volverse vía libre.
    """
    frame = np.array(image.convert("L"))
    faces = _FACE_CASCADE.detectMultiScale(frame, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    return len(faces) > 0


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
