/**
 * Fenrir Image Guard — Vision Adapter
 *
 * Routes vision requests through LiteLLM / OpenRouter gateway with
 * automatic fallback chain. Never hardcodes a specific provider.
 */

import type { VisionAdapterConfig, VisionResult } from "./types.js";

// ── OpenAI-compatible chat completion types (minimal) ─────

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

interface ChatCompletionResponse {
  id: string;
  choices: { message: { content: string } }[];
  model: string;
}

// ── Public API ────────────────────────────────────────────

/**
 * Send an image (as base64 data URI) plus a prompt to the vision model.
 * Tries the primary model first, then falls through the fallback chain.
 */
export async function analyzeImage(
  config: VisionAdapterConfig,
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<VisionResult> {
  const models = [config.primaryModel, ...config.fallbackModels];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const start = Date.now();
      const response = await callVisionModel(config, model, imageBase64, mimeType, prompt);
      const latencyMs = Date.now() - start;

      return parseVisionResponse(response, model, latencyMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[image-guard] Model ${model} failed: ${lastError.message}`);
    }
  }

  // All models failed — return error result
  return {
    personDetected: false,
    appropriate: true,
    entering: false,
    raw: lastError?.message ?? "all models failed",
    model: "none",
    latencyMs: 0,
  };
}

// ── Internal helpers ──────────────────────────────────────

async function callVisionModel(
  config: VisionAdapterConfig,
  model: string,
  imageBase64: string,
  mimeType: string,
  prompt: string
): Promise<ChatCompletionResponse> {
  const dataUri = `data:${mimeType};base64,${imageBase64}`;
  const timeoutMs = config.timeoutMs ?? 15_000;
  const maxTokens = config.maxTokens ?? 150;

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: dataUri, detail: "low" } },
      ],
    },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    return (await res.json()) as ChatCompletionResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the structured "PERSON:Yes/No, APPROPRIATE:Yes/No, ENTERING:Yes/No"
 * response from the vision model. Tolerant of minor formatting variations.
 */
function parseVisionResponse(
  response: ChatCompletionResponse,
  model: string,
  latencyMs: number
): VisionResult {
  const raw = response.choices?.[0]?.message?.content ?? "";
  const upper = raw.toUpperCase();

  // Extract each field with flexible matching
  const personDetected = extractBool(upper, "PERSON");
  const appropriate = extractBool(upper, "APPROPRIATE");
  const entering = extractBool(upper, "ENTERING");

  return {
    personDetected,
    appropriate,
    entering,
    raw,
    model: response.model || model,
    latencyMs,
  };
}

/**
 * Look for "FIELD:Yes" or "FIELD:No" in the response.
 * Defaults to false if not found (fail-safe for person/entering),
 * but appropriate defaults to true (don't false-reject).
 */
function extractBool(text: string, field: string): boolean {
  const pattern = new RegExp(`${field}\\s*[:\\-=]\\s*(YES|NO|TRUE|FALSE|SI|SÍ)`, "i");
  const match = text.match(pattern);
  if (!match) {
    // Safe defaults: appropriate → true (don't reject), others → false
    return field === "APPROPRIATE";
  }
  const value = match[1].toUpperCase();
  return value === "YES" || value === "TRUE" || value === "SI" || value === "SÍ";
}
