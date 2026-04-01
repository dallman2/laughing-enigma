import * as tf from "@tensorflow/tfjs";
import { gradientAscentStep } from "./gradient-ascent";
import { buildDreamModel } from "../models/layer-inspector";

export interface StyleTransferOptimConfig {
  iterations: number;
  learningRate: number;
  contentWeight: number;
  styleWeight: number;
  tvWeight: number;
  /** Per-layer weights for the style loss (same length as styleLayerNames) */
  styleLayerWeights?: number[];
  onProgress: (
    iteration: number,
    losses: { content: number; style: number; tv: number; total: number },
    image: tf.Tensor3D,
  ) => void | Promise<void>;
  progressInterval?: number;
}

/**
 * Compute the Gram matrix of a feature map.
 * Input shape: [1, H, W, C] → output shape: [C, C]
 */
function gramMatrix(featureMap: tf.Tensor): tf.Tensor {
  return tf.tidy(() => {
    const shape = featureMap.shape;
    const h = shape[1] as number;
    const w = shape[2] as number;
    const c = shape[3] as number;
    const reshaped = featureMap.reshape([h * w, c]);
    const gram = reshaped.transpose().matMul(reshaped);
    return gram.div(tf.scalar(h * w));
  });
}

/**
 * Total variation loss — encourages spatial smoothness.
 */
function totalVariation(image: tf.Tensor3D): tf.Scalar {
  return tf.tidy(() => {
    const [h, w] = image.shape;
    const dx = image
      .slice([0, 0, 0], [h, w - 1, -1])
      .sub(image.slice([0, 1, 0], [h, w - 1, -1]));
    const dy = image
      .slice([0, 0, 0], [h - 1, w, -1])
      .sub(image.slice([1, 0, 0], [h - 1, w, -1]));
    return dx.square().mean().add(dy.square().mean()) as tf.Scalar;
  });
}

/**
 * Build a style transfer loss function closure.
 *
 * The returned function is compatible with gradientAscentStep's lossFn interface.
 * It returns a NEGATED total loss so that gradient ascent (adding gradients)
 * effectively performs gradient descent (minimizing loss).
 *
 * @param contentTarget Pre-computed content layer activations
 * @param styleGramTargets Pre-computed Gram matrices for each style layer
 * @param config Weight parameters
 * @param image The tf.Variable being optimized (needed for TV loss)
 */
function buildStyleTransferLoss(
  contentTarget: tf.Tensor,
  styleGramTargets: tf.Tensor[],
  config: {
    contentWeight: number;
    styleWeight: number;
    tvWeight: number;
    styleLayerWeights?: number[];
  },
  image: tf.Variable,
): (activations: tf.Tensor | tf.Tensor[]) => tf.Scalar {
  // Default to equal weights if not provided
  const layerWeights =
    config.styleLayerWeights ??
    new Array(styleGramTargets.length).fill(1 / styleGramTargets.length);

  return (activations: tf.Tensor | tf.Tensor[]): tf.Scalar => {
    const acts = Array.isArray(activations) ? activations : [activations];

    // First activation = content layer, rest = style layers
    const contentFeatures = acts[0];
    const styleFeatures = acts.slice(1);

    // Content loss: MSE between generated and target content features
    const contentLoss = contentFeatures
      .sub(contentTarget)
      .square()
      .mean() as tf.Scalar;

    // Style loss: weighted sum of MSE between Gram matrices
    const styleLosses = styleFeatures.map((feat, i) => {
      const gram = gramMatrix(feat);
      return gram.sub(styleGramTargets[i]).square().mean().mul(layerWeights[i]);
    });
    const styleLoss = (
      styleLosses.length > 0 ? tf.addN(styleLosses) : tf.scalar(0)
    ) as tf.Scalar;

    // TV loss
    const tvLoss = totalVariation(image as unknown as tf.Tensor3D);

    // Total loss (negated for gradient ascent → descent)
    const total = contentLoss
      .mul(config.contentWeight)
      .add(styleLoss.mul(config.styleWeight))
      .add(tvLoss.mul(config.tvWeight));

    return total.neg() as tf.Scalar;
  };
}

/**
 * Run optimization-based style transfer (Gatys et al. 2015).
 *
 * Uses the existing gradientAscentStep with a negated loss function
 * to perform gradient descent, minimizing content + style + TV loss.
 */
export async function styleTransferOptimize(
  baseModel: tf.LayersModel,
  contentImage: tf.Tensor3D,
  styleImage: tf.Tensor3D,
  contentLayerName: string,
  styleLayerNames: string[],
  config: StyleTransferOptimConfig,
  abortSignal?: AbortSignal,
): Promise<tf.Tensor3D> {
  const progressInterval = config.progressInterval ?? 10;

  // Freeze model weights so tf.variableGrads only differentiates the image
  baseModel.trainable = false;
  for (const layer of baseModel.layers) {
    layer.trainable = false;
  }

  // Build sub-model that outputs [contentLayer, ...styleLayers]
  const allLayerNames = [contentLayerName, ...styleLayerNames];
  const featureModel = buildDreamModel(baseModel, allLayerNames);

  // Pre-compute content target activations
  const contentActivations = tf.tidy(() => {
    const acts = featureModel.predict(
      contentImage.expandDims(0) as tf.Tensor,
    );
    const actArray = Array.isArray(acts) ? acts : [acts];
    return actArray[0].clone();
  });

  // Pre-compute style Gram matrix targets
  const styleGramTargets = tf.tidy(() => {
    const acts = featureModel.predict(
      styleImage.expandDims(0) as tf.Tensor,
    );
    const actArray = Array.isArray(acts) ? acts : [acts];
    return actArray.slice(1).map((a) => gramMatrix(a).clone());
  });

  // Initialize generated image as clone of content
  const generated = tf.variable(contentImage.clone());

  // VGG19 imagenet preprocessing range: approx [-2.12, 2.64]
  const clipRange: [number, number] = [-2.12, 2.64];

  const lossFn = buildStyleTransferLoss(
    contentActivations,
    styleGramTargets,
    config,
    generated,
  );

  for (let iter = 0; iter < config.iterations; iter++) {
    if (abortSignal?.aborted) break;

    const { loss } = gradientAscentStep({
      model: featureModel,
      image: generated,
      lossFn,
      stepSize: config.learningRate,
      normalize: "mean_abs",
      clipRange,
    });

    // The loss is negated inside lossFn, so negate it back for reporting
    const reportedLoss = -loss;

    if (iter % progressInterval === 0) {
      await config.onProgress(
        iter,
        {
          content: 0,
          style: 0,
          tv: 0,
          total: reportedLoss,
        },
        generated as unknown as tf.Tensor3D,
      );
      await tf.nextFrame();
    }
  }

  // Cleanup
  contentActivations.dispose();
  styleGramTargets.forEach((t) => t.dispose());
  featureModel.dispose();

  return generated as unknown as tf.Tensor3D;
}
