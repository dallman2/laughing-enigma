import * as tf from "@tensorflow/tfjs";

/**
 * Encode a [0, 255] float tensor as a base64 JPEG string for WebSocket transfer.
 */
export async function tensorToBase64Jpeg(
  img: tf.Tensor3D,
): Promise<string> {
  // Scale to [0, 1] for toPixels
  const normalized = tf.tidy(
    () => img.div(255).clipByValue(0, 1) as tf.Tensor3D,
  );
  const canvas = document.createElement("canvas");
  await tf.browser.toPixels(normalized, canvas);
  normalized.dispose();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95),
  );
  if (!blob) return "";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    raw += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + 8192, bytes.length)),
    );
  }
  return btoa(raw);
}
