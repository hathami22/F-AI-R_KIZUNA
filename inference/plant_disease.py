
import json
from pathlib import Path
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms
from torchvision.models import mobilenet_v3_large


class PlantDiseaseClassifier:
    # Loads model_dir/{model_config,class_to_idx,plant_to_classes,class_info}.json and the weights file.
    def __init__(self, model_dir, device=None):
        d = Path(model_dir)
        self.cfg = json.loads((d / "model_config.json").read_text(encoding="utf-8"))
        self.class_to_idx = json.loads((d / "class_to_idx.json").read_text(encoding="utf-8"))
        self.plant_to_classes = json.loads((d / "plant_to_classes.json").read_text(encoding="utf-8"))
        self.class_info = json.loads((d / "class_info.json").read_text(encoding="utf-8"))
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        model = mobilenet_v3_large(weights=None)
        model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(self.class_to_idx))
        model.load_state_dict(torch.load(d / self.cfg["weights_file"], map_location="cpu", weights_only=True))
        self.model = model.to(self.device).eval()
        self.tf = transforms.Compose([transforms.Resize(self.cfg["resize_size"]), transforms.CenterCrop(self.cfg["img_size"]),
                                      transforms.ToTensor(), transforms.Normalize(self.cfg["mean"], self.cfg["std"])])
        self._plants = {p.lower(): p for p in self.plant_to_classes}

    def predict(self, image_path, plant, topk=3):
        key = self._plants.get(str(plant).strip().lower())
        if key is None:
            raise ValueError("Unknown plant '%s'. Supported: %s" % (plant, sorted(self.plant_to_classes)))
        names = self.plant_to_classes[key]
        ids = [self.class_to_idx[c] for c in names]
        with Image.open(image_path) as im:
            x = self.tf(im.convert("RGB")).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits = self.model(x)[0].float()
        probs = torch.softmax(logits[ids] / float(self.cfg.get("temperature", 1.0)), dim=0).cpu().tolist()
        order = sorted(range(len(names)), key=lambda k: -probs[k])
        best = order[0]
        info = self.class_info[names[best]]
        conf = probs[best]
        thr = self.cfg.get("confidence_threshold", 0.7)
        return {
            "plant": key,
            "disease": info["condition"],
            "class_name": names[best],
            "status": "Healthy" if info["healthy"] else "Diseased",
            "confidence": conf,
            "reliable": conf >= thr,
            "warning": None if conf >= thr else "Low confidence (%.2f < %.2f): verify manually." % (conf, thr),
            "top_predictions": [(self.class_info[names[k]]["condition"], probs[k]) for k in order[:topk]],
        }
