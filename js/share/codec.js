export const MAX_SHARE_URL_LENGTH = 12_000;
export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024;
export const SHARE_FALLBACK_MESSAGE =
  "Este simulado é grande demais para compartilhar por link. Baixe o HTML para compartilhar offline.";

const FRAGMENT_PREFIX = "#quiz=v2.";

async function transformBytes(bytes, stream) {
  const transformed = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(transformed).arrayBuffer());
}

async function decompressBytes(bytes) {
  const transformed = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = transformed.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_DECOMPRESSED_BYTES) {
        await reader.cancel("Limite de descompressão excedido.").catch(() => {});
        throw new Error(
          `Conteúdo descompactado excede o limite seguro de ${MAX_DECOMPRESSED_BYTES} bytes.`
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Fragmento de simulado inválido.");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodedPayload(fragment) {
  const hash = fragment.includes("#") ? fragment.slice(fragment.indexOf("#")) : fragment;
  if (!hash.startsWith(FRAGMENT_PREFIX)) {
    throw new Error("Versão de link de simulado não reconhecida.");
  }
  const payload = hash.slice(FRAGMENT_PREFIX.length);
  if (payload.length > MAX_SHARE_URL_LENGTH) {
    throw new Error(`Payload compartilhado excede o limite de ${MAX_SHARE_URL_LENGTH} caracteres.`);
  }
  if (fragment.length > MAX_SHARE_URL_LENGTH) {
    throw new Error(
      `Link ou fragmento compartilhado excede o limite de ${MAX_SHARE_URL_LENGTH} caracteres.`
    );
  }
  return payload;
}

export async function encodeQuizFragment(quiz) {
  if (typeof CompressionStream !== "function") {
    throw new Error("Compressão nativa indisponível.");
  }
  const json = JSON.stringify(quiz);
  const compressed = await transformBytes(
    new TextEncoder().encode(json),
    new CompressionStream("deflate-raw")
  );
  return `${FRAGMENT_PREFIX}${bytesToBase64Url(compressed)}`;
}

export async function decodeQuizFragment(fragment) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Descompressão nativa indisponível.");
  }
  const compressed = base64UrlToBytes(encodedPayload(String(fragment || "")));
  const bytes = await decompressBytes(compressed);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function getShareDecision(quiz, baseUrl) {
  if (
    typeof CompressionStream !== "function" ||
    typeof DecompressionStream !== "function"
  ) {
    return { mode: "html", message: SHARE_FALLBACK_MESSAGE };
  }

  try {
    const fragment = await encodeQuizFragment(quiz);
    const url = `${String(baseUrl || "").split("#", 1)[0]}${fragment}`;
    if (url.length <= MAX_SHARE_URL_LENGTH) {
      return { mode: "link", url, fragment };
    }
  } catch {
    // HTML remains available when native compression is unsupported or fails.
  }

  return { mode: "html", message: SHARE_FALLBACK_MESSAGE };
}
