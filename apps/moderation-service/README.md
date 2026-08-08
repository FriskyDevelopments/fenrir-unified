# Fenrir Moderation Service

Clasificación de imágenes **self-hosted, solo CPU**, para las comunidades adultas
de MyFenrir.

## Por qué self-hosted

Los ToS de Mistral, OpenAI y Google **prohíben contenido sexual explícito**.
Mandarles el material de una comunidad adulta no es solo exponer la privacidad
de sus miembros: es arriesgarse a que cierren la cuenta por violar sus términos.
Aquí ninguna imagen sale de la infraestructura propia.

## Lo que este servicio NO hace

**No sustituye el match contra hashes conocidos de CSAM.** Las listas de
NCMEC/PhotoDNA no son distribuibles públicamente — por diseño, para que no se
usen para evadirlas. No existe versión self-hosteable.

Esa capa se queda en **Cloudflare CSAM Scanning** (gratis en todos los planes) o
PhotoDNA. Si se self-hostea todo lo demás y se omite ésa, queda el hueco más
grande justo donde más duele. Ver el README de `apps/community-bridge`.

## La política que implementa

Tres desenlaces, no dos: **la incertidumbre no se resuelve rechazando, se manda
a una persona.**

| Señal | Decisión |
| --- | --- |
| Contenido sexual explícito entre adultos | `allow` — se registra, no se rechaza |
| Edad aparente ≥ `MIN_APPARENT_AGE` (25) | `allow` |
| Edad aparente entre `REJECT_BELOW_AGE` y el umbral (18–24) | **`review`** → cola de admin |
| Hay persona y no se pudo estimar edad | **`review`** → cola de admin |
| Edad aparente < `REJECT_BELOW_AGE` (18) | `reject` — bloqueo inmediato |

`APPROPRIATE` se decide **solo por edad aparente, nunca por desnudez**.

Lo que cae en `reject` **no entra a la cola**: se bloquea de inmediato y nadie
tiene que mirarlo para decidir. La cola es para la duda, no para lo evidente.

La cola vive en Neon (`cb_moderation_reviews`) y guarda una **referencia** al
objeto, nunca una copia de la imagen. El campo `review_reason` dice por qué
llegó (`no_age_reading` o `age_near_threshold`), que es lo primero que el admin
necesita ver.

## Modelos

Dos clasificadores especializados en vez de un VLM generalista: para "¿aparenta
ser menor?" un modelo entrenado para eso le gana a uno general, se evalúa contra
un set propio, y corre en CPU. Un VLM obligaría a rentar GPU sin mejorar la
única pregunta que importa.

| Rol | Modelo por defecto | Licencia |
| --- | --- | --- |
| Explícito / NSFW | `Falconsai/nsfw_image_detection` | Apache-2.0 |
| Edad aparente | `nateraw/vit-age-classifier` | ⚠️ **verificar antes de producción** |

> ⚠️ El modelo de edad es el que **hay que revisar en licencia** antes de usarlo
> comercialmente: varios modelos populares de estimación de edad (InsightFace
> buffalo, algunas variantes de MiVOLO) son solo para investigación. Se cambia
> con la variable `AGE_MODEL` sin tocar código.

## Integración con `image-guard`

`fenrir-bridge/functions/_lib/image-guard` habla OpenAI-compatible. Este servicio
imita esa forma (`POST /v1/chat/completions` con `image_url` en data URI), así
que **no hay que tocar TypeScript**: basta apuntar la config.

```ts
vision: {
  baseUrl: "http://127.0.0.1:8080/v1",   // o la URL interna del proxy
  apiKey: process.env.MODERATION_API_KEY,
  primaryModel: "fenrir-moderation",
  fallbackModels: [],
}
```

La respuesta trae los campos que `image-guard` ya parsea
(`PERSON` / `APPROPRIATE` / `ENTERING`) más los de esta política
(`DECISION`, `EXPLICIT`, `APPARENT_AGE`), y un bloque `fenrir` en el JSON con
`decision`, `needs_human_review` y `review_reason`,
para auditar decisiones sin volver a inferir.

## Desplegar

```bash
export MODERATION_API_KEY="$(openssl rand -hex 32)"
docker compose up -d --build
curl -s localhost:8080/health | jq
```

Escucha **solo en loopback** (`127.0.0.1:8080`): el acceso entra por el reverse
proxy de la caja, nunca directo desde internet. Los pesos se bajan durante el
build, así que un arranque en frío no depende de que Hugging Face responda.

## Pendiente antes de producción

- [ ] Verificar la licencia del modelo de edad para uso comercial
- [ ] **Anteponer un detector de rostros.** Hoy "hay persona" se infiere de que
      el clasificador de edad devolvió una etiqueta legible — pero un
      clasificador siempre devuelve *algo*, también sobre una foto sin gente.
      El servicio peca de estricto (rechaza de más), que es el lado correcto en
      el que fallar, pero genera ruido. Un detector de rostros antes de estimar
      edad lo arregla.
- [ ] Calibrar `MIN_APPARENT_AGE` y `REJECT_BELOW_AGE` contra un set propio
- [ ] Construir la UI de la cola de revisión (tabla `cb_moderation_reviews` ya
      creada en Neon; falta la vista de admin y el escribir en ella)
- [ ] Activar Cloudflare CSAM Scanning (capa 1) y servir los uploads por la zona
      propia para que ese escaneo los alcance
- [ ] Ajustar el prompt de `image-guard` a esta política (hoy rechaza toda
      desnudez, lo que contradice la regla de la comunidad)
