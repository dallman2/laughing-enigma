import * as tf from "@tensorflow/tfjs";

export interface GradientAscentConfig {
  /** Sub-model that outputs activations from target dream layers */
  model: tf.LayersModel;
  /** Mutable image tensor — the thing being optimized */
  image: tf.Variable;
  /** Loss function applied to layer activations */
  lossFn: (activations: tf.Tensor | tf.Tensor[]) => tf.Scalar;
  /** Learning rate for gradient ascent */
  stepSize: number;
  /** Gradient normalization strategy */
  normalize: "std" | "mean_abs" | "none";
  /** Pixel value clamp range after each step */
  clipRange: [number, number];
}

export interface StepResult {
  loss: number;
}

/**
 * Single gradient ascent step: forward pass → compute loss → backward pass → update image.
 *
 * Uses tf.variableGrads() which requires the image to be a tf.Variable.
 * This is the atomic unit of computation for both Deep Dream and optimization-based Style Transfer.
 */
export function gradientAscentStep(config: GradientAscentConfig): StepResult {
  return tf.tidy(() => {
    console.log("[gradient-ascent] image variable name:", config.image.name, "shape:", config.image.shape);

    const { value, grads } = tf.variableGrads(() => {
      console.log("[gradient-ascent] running forward pass...");
      const activations = config.model.predict(
        config.image.expandDims(0) as tf.Tensor,
      );
      console.log("[gradient-ascent] activations:", Array.isArray(activations) ? `array[${activations.length}]` : activations.shape);
      const loss = config.lossFn(activations as tf.Tensor | tf.Tensor[]);
      console.log("[gradient-ascent] loss value:", loss.dataSync()[0]);
      return loss;
    });

    console.log("[gradient-ascent] grad keys:", Object.keys(grads));
    const gradient = grads[config.image.name];
    if (!gradient) {
      console.error("[gradient-ascent] NO GRADIENT FOUND. Variable name:", config.image.name, "Available grads:", Object.keys(grads));
      throw new Error(
        "No gradient computed for image variable. Ensure the model is a LayersModel (not GraphModel).",
      );
    }
    console.log("[gradient-ascent] gradient stats - min:", gradient.min().dataSync()[0], "max:", gradient.max().dataSync()[0]);

    // Normalize gradient to prevent dead/exploding gradients
    let normalizedGrad: tf.Tensor;
    switch (config.normalize) {
      case "std": {
        const { variance } = tf.moments(gradient);
        normalizedGrad = gradient.div(variance.sqrt().add(1e-8));
      }
        break;
      case "mean_abs":
        normalizedGrad = gradient.div(
          gradient.abs().mean().maximum(1e-6),
        );
        break;
      default:
        normalizedGrad = gradient;
    }

    // Gradient ascent: move image in direction that increases loss
    config.image.assign(
      config.image
        .add(normalizedGrad.mul(config.stepSize))
        .clipByValue(config.clipRange[0], config.clipRange[1]) as tf.Tensor,
    );

    return { loss: value.dataSync()[0] };
  });
}
