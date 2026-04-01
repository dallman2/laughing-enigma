import * as tf from "@tensorflow/tfjs";

export type PreprocessingMode = "imagenet" | "inception" | "none";

/**
 * Preprocess an image tensor for model input.
 *
 * - "inception": scale pixels from [0, 255] to [-1, 1]  (TF Keras MobileNetV2, InceptionV3)
 * - "imagenet": subtract ImageNet mean, divide by std   (PyTorch convention, VGG19)
 * - "none": pass through as-is
 */
export function preprocess(
  image: tf.Tensor3D,
  mode: PreprocessingMode,
): tf.Tensor3D {
  return tf.tidy(() => {
    switch (mode) {
      case "inception":
        // [0, 255] → [-1, 1]
        return image.div(127.5).sub(1) as tf.Tensor3D;

      case "imagenet": {
        // [0, 255] → [0, 1] → subtract mean → divide by std
        const normalized = image.div(255);
        const mean = tf.tensor1d([0.485, 0.456, 0.406]);
        const std = tf.tensor1d([0.229, 0.224, 0.225]);
        return normalized.sub(mean).div(std) as tf.Tensor3D;
      }

      case "none":
        return image;
    }
  });
}

/**
 * Reverse preprocessing to [0, 1] float range for tf.browser.toPixels().
 */
export function deprocess(
  image: tf.Tensor3D,
  mode: PreprocessingMode,
): tf.Tensor3D {
  return tf.tidy(() => {
    switch (mode) {
      case "inception":
        // [-1, 1] → [0, 1]
        return image.add(1).mul(0.5).clipByValue(0, 1) as tf.Tensor3D;

      case "imagenet": {
        // Undo normalization → [0, 1]
        const mean = tf.tensor1d([0.485, 0.456, 0.406]);
        const std = tf.tensor1d([0.229, 0.224, 0.225]);
        return image
          .mul(std)
          .add(mean)
          .clipByValue(0, 1) as tf.Tensor3D;
      }

      case "none":
        // Assume [0, 255], scale to [0, 1]
        return image.div(255).clipByValue(0, 1) as tf.Tensor3D;
    }
  });
}
