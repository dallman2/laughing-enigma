import * as tf from "@tensorflow/tfjs";

/**
 * Run arbitrary feedforward style transfer using the Magenta model pair.
 *
 * This is real-time (<1s) — no gradients, just two forward passes.
 * The style predictor encodes any style image into a 100-dim vector,
 * and the transformer applies that style to the content image.
 *
 * Style interpolation: blending the content and style vectors by
 * stylizationStrength controls how strongly the style is applied.
 */
export async function arbitraryStyleTransfer(
  stylePredictor: tf.GraphModel | tf.LayersModel,
  transformer: tf.GraphModel | tf.LayersModel,
  contentImage: tf.Tensor3D,
  styleImage: tf.Tensor3D,
  stylizationStrength: number,
): Promise<tf.Tensor3D> {
  return tf.tidy(() => {
    // Preprocess: scale to [0, 1] (Magenta normalization)
    const preprocessed = (img: tf.Tensor3D) => img.div(255) as tf.Tensor3D;

    const contentProcessed = preprocessed(contentImage);
    const styleProcessed = preprocessed(styleImage);

    // Extract style vector from style image
    const styleVector = stylePredictor.predict(
      styleProcessed.expandDims(0) as tf.Tensor,
    ) as tf.Tensor;

    // Extract style vector from content image (for interpolation baseline)
    const contentStyleVector = stylePredictor.predict(
      contentProcessed.expandDims(0) as tf.Tensor,
    ) as tf.Tensor;

    // Interpolate based on stylization strength
    const blendedStyle = contentStyleVector
      .mul(1 - stylizationStrength)
      .add(styleVector.mul(stylizationStrength));

    // Run transformer: produces stylized output in [0, 1] (Sigmoid)
    const output = transformer.predict([
      contentProcessed.expandDims(0) as tf.Tensor,
      blendedStyle,
    ]) as tf.Tensor;

    // Output is already [0, 1] from Sigmoid — squeeze batch dim for toPixels
    return output.squeeze() as tf.Tensor3D;
  });
}
