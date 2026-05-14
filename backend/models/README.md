# IntelliCrowd Models

## YOLOv8

The YOLOv8 model (`yolov8n.pt`) will download automatically on first run via the Ultralytics library. No manual action is needed.

## CSRNet (Dense Crowd Heatmaps)

We use the ShanghaiA pretrained weights for CSRNet, which works best for extremely dense crowds.

**Instructions:**
1. Download the pretrained `ShanghaiA` weights from the [CSRNet PyTorch Repo](https://github.com/leeyeehoo/CSRNet-pytorch) or [HuggingFace](https://huggingface.co/rootstrap-org/crowd-counting).
2. Rename the downloaded file to `csrnet_shanghaiA.pth`.
3. Place it in this `models/` directory.

The expected path is: `backend/models/csrnet_shanghaiA.pth`.

If the weights are not found, the pipeline will gracefully fall back to a simulated heatmap mode.
