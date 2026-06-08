import { GenerateContentResponse } from "../../shared/types";
import { HttpsProxyAgent } from "https-proxy-agent";

let cachedProxyAgent: HttpsProxyAgent<string> | undefined = undefined;
let isProxyChecked = false;

export function getProxyAgent(requestUrl?: string): HttpsProxyAgent<string> | undefined {
    if (isProxyChecked) return cachedProxyAgent;
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
    if (proxyUrl) {
        try {
            cachedProxyAgent = new HttpsProxyAgent(proxyUrl, { keepAlive: false });
            console.log(`[Proxy] HttpsProxyAgent initialized with: ${proxyUrl} (keepAlive: false)`);
        } catch (err) {
            console.error("[Proxy] Failed to initialize HttpsProxyAgent:", err);
        }
    }
    isProxyChecked = true;
    return cachedProxyAgent;
}

// --- Helpers ---
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
    ]);

export const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 2000,
    onRetry?: (attempt: number, error: any) => void,
    signal?: AbortSignal
): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
        if (signal?.aborted) {
            const err = new Error("Aborted");
            err.name = "AbortError";
            throw err;
        }
        try {
            return await fn();
        } catch (e: any) {
            if (e.name === 'AbortError' || e.message?.includes('aborted') || signal?.aborted) {
                const err = new Error("Aborted");
                err.name = "AbortError";
                throw err;
            }
            if (i === maxRetries - 1) throw e;
            const delay = baseDelay * Math.pow(2, i);
            console.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms:`, e?.message || e);
            if (onRetry) onRetry(i + 1, e);
            
            await new Promise<void>((resolve, reject) => {
                const t = setTimeout(() => {
                    if (signal) signal.removeEventListener('abort', abortHandler);
                    resolve();
                }, delay);
                
                const abortHandler = () => {
                    clearTimeout(t);
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    reject(err);
                };

                if (signal) {
                    signal.addEventListener('abort', abortHandler);
                }
            });
        }
    }
    throw new Error("retryWithBackoff exhausted");
};

/**
 * Sanitize a JSON string by escaping unescaped control characters inside
 * string values. AI models often return JSON where string values contain
 * literal newlines, tabs, or other control chars that break JSON.parse.
 */
const sanitizeJsonString = (raw: string): string => {
    // Walk through the string character-by-character, tracking whether we
    // are currently inside a JSON string value. When inside a string, replace
    // unescaped control characters (U+0000–U+001F) with their JSON escape forms.
    const out: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        const code = raw.charCodeAt(i);

        if (escaped) {
            // Previous char was a backslash inside a string – emit as-is
            out.push(ch);
            escaped = false;
            continue;
        }

        if (inString) {
            if (ch === '\\') {
                escaped = true;
                out.push(ch);
            } else if (ch === '"') {
                inString = false;
                out.push(ch);
            } else if (code < 0x20) {
                // Control character inside a string – must be escaped
                switch (ch) {
                    case '\n': out.push('\\n'); break;
                    case '\r': out.push('\\r'); break;
                    case '\t': out.push('\\t'); break;
                    default: out.push('\\u' + code.toString(16).padStart(4, '0')); break;
                }
            } else {
                out.push(ch);
            }
        } else {
            if (ch === '"') {
                inString = true;
            }
            out.push(ch);
        }
    }

    return out.join('');
};

/**
 * Aggressive JSON repair: fix unescaped double-quotes inside string values.
 * Strategy: walk through char-by-char, tracking string context. When we hit
 * a `"` that looks like it's INSIDE a value (the next chars aren't `,`, `}`,
 * `]`, `:`, or whitespace followed by one of these structural chars) we
 * escape it with `\"`.
 */
const repairJsonQuotes = (raw: string): string => {
    const out: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];

        if (escaped) {
            out.push(ch);
            escaped = false;
            continue;
        }

        if (inString) {
            if (ch === '\\') {
                escaped = true;
                out.push(ch);
            } else if (ch === '"') {
                // Is this a real string-closing quote or an unescaped interior quote?
                // Look ahead: skip whitespace, then check for structural JSON char
                let j = i + 1;
                while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t' || raw[j] === '\r' || raw[j] === '\n')) j++;
                const next = raw[j];
                if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') {
                    // Looks like a real closing quote
                    inString = false;
                    out.push(ch);
                } else {
                    // Interior unescaped quote — escape it
                    out.push('\\"');
                }
            } else {
                out.push(ch);
            }
        } else {
            if (ch === '"') {
                inString = true;
            }
            out.push(ch);
        }
    }

    return out.join('');
};

export const safeJsonParse = <T>(text: string | undefined, fallback: T): T => {
    if (!text) return fallback;
    try {
        // Strip markdown code fences if present
        let cleaned = text.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        // First attempt: parse as-is
        try {
            return JSON.parse(cleaned);
        } catch (_firstErr) {
            // Second attempt: sanitize control characters inside string values
            const sanitized = sanitizeJsonString(cleaned);
            try {
                return JSON.parse(sanitized);
            } catch (_secondErr) {
                // Third attempt: repair unescaped quotes + sanitize control chars
                const repaired = repairJsonQuotes(sanitizeJsonString(cleaned));
                try {
                    return JSON.parse(repaired);
                } catch (thirdErr) {
                    console.error("safeJsonParse failed after all repair attempts:", thirdErr, "Input:", text?.substring(0, 300));
                    return fallback;
                }
            }
        }
    } catch (e) {
        console.error("safeJsonParse failed:", e, "Input:", text?.substring(0, 300));
        return fallback;
    }
};

// Schema type constants (matching Google AI SDK conventions)
export const Type = {
    STRING: "STRING" as const,
    NUMBER: "NUMBER" as const,
    INTEGER: "INTEGER" as const,
    BOOLEAN: "BOOLEAN" as const,
    ARRAY: "ARRAY" as const,
    OBJECT: "OBJECT" as const,
};

// --- AI Singleton ---
// In backend mode, ModelManager is accessed via getModelManager()
import { getModelManager } from "./model-manager";

class AIModels {
    async generateContent(args: {
        model: string;
        contents: any;
        config?: any;
    }): Promise<GenerateContentResponse> {
        const mm = getModelManager();
        return mm.generateContent(args);
    }

    async generateVideos(args: any) {
        const mm = getModelManager();
        return mm.generateVideos(args);
    }
}

class AIOperations {
    async getVideosOperation(args: any) {
        const mm = getModelManager();
        return mm.getVideosOperation(args);
    }
}

class AIAudio {
    async speech(body: any): Promise<ArrayBuffer> {
        const mm = getModelManager();
        return mm.speech(body);
    }
}

export const ai = {
    models: new AIModels(),
    operations: new AIOperations(),
    audio: new AIAudio(),
};
