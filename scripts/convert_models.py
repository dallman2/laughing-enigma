"""Convert Keras models to TF.js LayersModel format for browser use.

Prerequisites:
    pip install tensorflow tensorflowjs

Output:
    ./models/mobilenet_v2_tfjs/   (~14 MB)
    ./models/vgg19_tfjs/          (~80 MB)

After conversion, upload the contents to Cloudflare R2.
"""

import os
import tensorflow as tf
import tensorflowjs as tfjs

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def convert_mobilenet_v2():
    print("Converting MobileNetV2 (no top)...")
    model = tf.keras.applications.MobileNetV2(weights="imagenet", include_top=False)
    out = os.path.join(OUT_DIR, "mobilenet_v2_tfjs")
    tfjs.converters.save_keras_model(model, out)
    print(f"  -> {out}")

    # Print layer names for reference
    print("  Dream-relevant layers:")
    for layer in model.layers:
        if "expand_relu" in layer.name or "project_BN" in layer.name:
            print(f"    {layer.name}  {layer.output.shape}")


def convert_vgg19():
    print("Converting VGG19 (no top)...")
    model = tf.keras.applications.VGG19(weights="imagenet", include_top=False)
    out = os.path.join(OUT_DIR, "vgg19_tfjs")
    tfjs.converters.save_keras_model(model, out)
    print(f"  -> {out}")

    # Print layer names for reference
    print("  Style transfer layers:")
    for layer in model.layers:
        if "conv1" in layer.name or "conv2" in layer.name:
            print(f"    {layer.name}  {layer.output.shape}")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    convert_mobilenet_v2()
    convert_vgg19()
    print("\nDone. Upload ./models/* to R2.")
