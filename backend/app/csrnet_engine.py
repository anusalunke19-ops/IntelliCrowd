"""
IntelliCrowd — CSRNet Density Engine
Generates density maps and heatmaps for dense crowds.
"""
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional, Tuple
import numpy as np

try:
    import torch
    import torch.nn as nn
    from torchvision import transforms
    import cv2
    from PIL import Image
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("[csrnet] PyTorch not available. Heatmaps will be simulated.")


BaseClass = nn.Module if TORCH_AVAILABLE else object

class CSRNet(BaseClass):
    def __init__(self, load_weights=False):
        super(CSRNet, self).__init__()
        if not TORCH_AVAILABLE: return
        self.seen = 0
        self.frontend_feat = [64, 64, 'M', 128, 128, 'M', 256, 256, 256, 'M', 512, 512, 512]
        self.backend_feat  = [512, 512, 512, 256, 128, 64]
        self.frontend = make_layers(self.frontend_feat)
        self.backend = make_layers(self.backend_feat, in_channels=512, dilation=True)
        self.output_layer = nn.Conv2d(64, 1, kernel_size=1)
        
    def forward(self, x):
        x = self.frontend(x)
        x = self.backend(x)
        x = self.output_layer(x)
        return x

def make_layers(cfg, in_channels=3, batch_norm=False, dilation=False):
    if not TORCH_AVAILABLE: return None
    layers = []
    d_rate = 2 if dilation else 1
    for v in cfg:
        if v == 'M':
            layers += [nn.MaxPool2d(kernel_size=2, stride=2)]
        else:
            conv2d = nn.Conv2d(in_channels, v, kernel_size=3, padding=d_rate, dilation=d_rate)
            if batch_norm:
                layers += [conv2d, nn.BatchNorm2d(v), nn.ReLU(inplace=True)]
            else:
                layers += [conv2d, nn.ReLU(inplace=True)]
            in_channels = v
    return nn.Sequential(*layers)


# ─── Engine Wrapper ──────────────────────────────────────────────────────────

class CSRNetEngine:
    def __init__(self, weights_filename="csrnet_shanghaiA.pth"):
        self.available = False
        self.model = None
        self.device = None
        self.transform = None
        
        if not TORCH_AVAILABLE:
            return

        weights_path = Path(__file__).parent.parent / "models" / weights_filename
        
        if not weights_path.exists():
            print(f"[csrnet] Weights not found at {weights_path}. Running in simulation mode.")
            return

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[csrnet] Loading CSRNet on {self.device}...")
        
        try:
            self.model = CSRNet()
            # Handle possible dataparallel state dicts
            state_dict = torch.load(weights_path, map_location=self.device)
            # if weights were saved with DataParallel, strip 'module.'
            new_state_dict = {}
            for k, v in state_dict.items():
                name = k[7:] if k.startswith('module.') else k
                new_state_dict[name] = v
            self.model.load_state_dict(new_state_dict)
            self.model.to(self.device)
            self.model.eval()
            
            self.transform = transforms.Compose([
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                     std=[0.229, 0.224, 0.225]),
            ])
            self.available = True
            print("[csrnet] Model loaded successfully.")
        except Exception as e:
            print(f"[csrnet] Failed to load model: {e}")

    def predict_density(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """Runs the image through CSRNet and returns a density map resized to match input."""
        if not self.available or frame is None:
            return None
        
        try:
            # Convert BGR to RGB
            img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(img)
            
            img_tensor = self.transform(pil_img).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                output = self.model(img_tensor)
            
            # The output density map is 1/8 the size of the input image due to max pooling
            density_map = output.squeeze().cpu().numpy()
            
            # Resize density map back to original frame size
            h, w = frame.shape[:2]
            # When resizing up by 8x, density values drop by 64x per pixel to maintain same sum
            density_map = cv2.resize(density_map, (w, h), interpolation=cv2.INTER_CUBIC) / 64.0
            
            # Avoid negative values
            density_map = np.clip(density_map, 0, None)
            
            return density_map
            
        except Exception as e:
            print(f"[csrnet] Inference error: {e}")
            return None

    def get_zone_density(self, density_map: np.ndarray, polygon: list[list[float]]) -> float:
        """Sums the density values within a specific polygon zone."""
        if density_map is None:
            return 0.0
            
        h, w = density_map.shape
        mask = np.zeros((h, w), dtype=np.uint8)
        
        pts = np.array(polygon, np.int32)
        pts = pts.reshape((-1, 1, 2))
        cv2.fillPoly(mask, [pts], 255)
        
        return float(np.sum(density_map[mask == 255]))

    def render_heatmap(self, density_map: np.ndarray, alpha=0.6) -> Optional[bytes]:
        """Renders the density map as a color-mapped JPEG image."""
        if density_map is None:
            return None
            
        try:
            # Normalize for visualization (adjust max_val depending on expected density)
            max_val = np.percentile(density_map, 99.9)
            if max_val == 0: max_val = 1.0
            
            norm_map = np.clip(density_map / max_val, 0, 1)
            norm_map = (norm_map * 255).astype(np.uint8)
            
            # Apply JET colormap (blue -> green -> red)
            heatmap = cv2.applyColorMap(norm_map, cv2.COLORMAP_JET)
            
            # Create a transparent background where density is zero
            # Set alpha channel based on density
            # Since we need to return JPEG, we'll return the RGB heatmap and the frontend can blend it,
            # OR we can just return a color-mapped image where zero density is black.
            
            # Zero out areas with very low density
            heatmap[norm_map < 5] = [0, 0, 0]
            
            _, buf = cv2.imencode('.jpg', heatmap, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return buf.tobytes()
        except Exception as e:
            print(f"[csrnet] Heatmap render error: {e}")
            return None
