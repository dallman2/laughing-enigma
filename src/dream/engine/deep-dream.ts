import * as tf from "@tensorflow/tfjs";
import { gradientAscentStep } from "./gradient-ascent";

export interface DeepDreamConfig {
  /** Number of octaves (scales), typically 3-5 */
  numOctaves: number;
  /** Scale factor between octaves, typically 1.3-1.4 */
  octaveScale: number;
  /** Gradient ascent steps per octave, typically 20-100 */
  stepsPerOctave: number;
  /** Learning rate for gradient ascent */
  stepSize: number;
  /** Early stopping: stop octave if loss exceeds this (null = disabled) */
  maxLoss: number | null;
  /** Called every N steps with the current dream image for live preview */
  onProgress: (
    octave: number,
    step: number,
    loss: number,
    image: tf.Tensor3D,
  ) => void | Promise<void>;
  /** How often to call onProgress (every N steps). Default 5. */
  progressInterval?: number;
}

/**
 * Default loss: maximize mean activation across all target layers.
 * This produces the classic "enhance patterns the network already sees" effect.
 */
function defaultDreamLoss(activations: tf.Tensor | tf.Tensor[]): tf.Scalar {
  const actArray = Array.isArray(activations) ? activations : [activations];
  return tf.addN(actArray.map((a) => a.mean())) as tf.Scalar;
}

/**
 * Run Deep Dream with multi-scale octave processing.
 *
 * Each octave creates a fresh tf.variable at that scale's resolution
 * (tf.Variable.assign requires same shape, so we can't resize in-place).
 */
export async function deepDreamWithOctaves(
  dreamModel: tf.LayersModel,
  originalImage: tf.Tensor3D,
  config: DeepDreamConfig,
  abortSignal?: AbortSignal,
): Promise<tf.Tensor3D> {
  // Freeze all model weights so tf.variableGrads only differentiates
  // with respect to the image variable, not the millions of model params.
  dreamModel.trainable = false;
  for (const layer of dreamModel.layers) {
    layer.trainable = false;
  }
  console.log("[deep-dream] model frozen. Trainable weights:", dreamModel.trainableWeights.length);

  const progressInterval = config.progressInterval ?? 5;
  const [origH, origW] = originalImage.shape;
  console.log("[deep-dream] original image shape:", originalImage.shape, "octaves:", config.numOctaves, "steps/octave:", config.stepsPerOctave);

  // Compute octave shapes (smallest → largest)
  const shapes: [number, number][] = [];
  for (let i = config.numOctaves - 1; i >= 0; i--) {
    const scale = config.octaveScale ** i;
    shapes.push([Math.round(origH / scale), Math.round(origW / scale)]);
  }
  console.log("[deep-dream] octave shapes:", shapes);

  // Track current image as a plain tensor between octaves (not a Variable,
  // since Variable.assign requires same shape and octaves change resolution).
  let currentImage = tf.tidy(() =>
    tf.image
      .resizeBilinear(originalImage.expandDims(0) as tf.Tensor4D, shapes[0])
      .squeeze() as tf.Tensor3D,
  );

  let shrunkOriginal = currentImage.clone();

  for (let octave = 0; octave < shapes.length; octave++) {
    if (abortSignal?.aborted) { console.log("[deep-dream] aborted before octave", octave); break; }

    const [h, w] = shapes[octave];
    console.log("[deep-dream] starting octave", octave, "size:", [h, w]);

    // Resize current image to this octave's scale
    const resized = tf.tidy(() =>
      tf.image
        .resizeBilinear(currentImage.expandDims(0) as tf.Tensor4D, [h, w])
        .squeeze() as tf.Tensor3D,
    );
    currentImage.dispose();

    // Create a fresh Variable at this octave's resolution for gradient computation
    const img = tf.variable(resized);
    resized.dispose();

    // Run gradient ascent at this scale
    for (let step = 0; step < config.stepsPerOctave; step++) {
      if (abortSignal?.aborted) break;

      try {
        const { loss } = gradientAscentStep({
          model: dreamModel,
          image: img,
          lossFn: defaultDreamLoss,
          stepSize: config.stepSize,
          normalize: "std",
          clipRange: [-1, 1],
        });

        if (config.maxLoss && loss > config.maxLoss) break;

        // Yield to UI thread and report progress
        if (step % progressInterval === 0) {
          await config.onProgress(octave, step, loss, img as unknown as tf.Tensor3D);
          await tf.nextFrame();
        }
      } catch (e) {
        console.error("[deep-dream] gradient step failed at octave", octave, "step", step, e);
        break;
      }
    }

    // Extract the result as a plain tensor for the next octave
    currentImage = tf.tidy(() => img.clone() as tf.Tensor3D);

    // Reinject lost detail between octaves
    if (octave < shapes.length - 1) {
      const nextShape = shapes[octave + 1];

      const withDetail = tf.tidy(() => {
        const upscaledShrunk = tf.image
          .resizeBilinear(
            shrunkOriginal.expandDims(0) as tf.Tensor4D,
            [h, w],
          )
          .squeeze() as tf.Tensor3D;
        const sameSizeOriginal = tf.image
          .resizeBilinear(originalImage.expandDims(0) as tf.Tensor4D, [h, w])
          .squeeze() as tf.Tensor3D;
        const lostDetail = sameSizeOriginal.sub(upscaledShrunk);
        return currentImage.add(lostDetail) as tf.Tensor3D;
      });
      currentImage.dispose();
      currentImage = withDetail;

      // Prepare shrunk original for next octave
      const oldShrunk = shrunkOriginal;
      shrunkOriginal = tf.tidy(() =>
        tf.image
          .resizeBilinear(
            originalImage.expandDims(0) as tf.Tensor4D,
            nextShape,
          )
          .squeeze() as tf.Tensor3D,
      );
      oldShrunk.dispose();
    }

    img.dispose();
  }

  shrunkOriginal.dispose();

  // Return final image as a Variable (caller may want to continue dreaming)
  const result = tf.variable(currentImage);
  currentImage.dispose();
  return result as unknown as tf.Tensor3D;
}
