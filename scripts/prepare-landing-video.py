#!/usr/bin/env python3
"""Prepare the supplied ZUR hero clip; its pale background is connected to the frame edges.

This matte is specific to this dark sculpture on a pale background, not general video segmentation.
Requires ffmpeg, numpy, opencv-python-headless and Pillow.
"""
import argparse
from pathlib import Path
import subprocess
import cv2
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('input')
parser.add_argument('output_dir')
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
output = Path(args.output_dir)
output.mkdir(parents=True, exist_ok=True)
width, height, fps = 500, 540, 20
decode = subprocess.Popen([
    args.ffmpeg, '-v', 'error', '-i', args.input, '-an',
    '-vf', f'fps={fps},scale=960:540,crop={width}:{height}:430:0',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
], stdout=subprocess.PIPE)
encode = subprocess.Popen([
    args.ffmpeg, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', f'{width}x{height}', '-r', str(fps), '-i', 'pipe:0', '-an',
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '34',
    '-g', '6', '-auto-alt-ref', '0', '-deadline', 'realtime', '-cpu-used', '6',
    str(output / 'zur-bust.webm'),
], stdin=subprocess.PIPE)
frames = 0
try:
    while True:
        raw = decode.stdout.read(width * height * 3)
        if not raw:
            break
        if len(raw) != width * height * 3:
            raise RuntimeError('Incomplete decoded frame')
        rgb = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
        # Keep bright reflections inside the sculpture: only edge-connected pale pixels are background.
        candidate = ((rgb.min(axis=2) > 175) & (np.ptp(rgb, axis=2) < 45)).astype(np.uint8)
        _, labels = cv2.connectedComponents(candidate, connectivity=8)
        edge_labels = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
        edge_labels = edge_labels[edge_labels != 0]
        background = np.isin(labels, edge_labels)
        alpha = (~background).astype(np.uint8) * 255
        alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((5, 5), dtype=np.uint8))
        contours, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            alpha.fill(0)
            cv2.drawContours(alpha, [max(contours, key=cv2.contourArea)], -1, 255, cv2.FILLED)
        # Feather just inside the silhouette to avoid a pale fringe.
        alpha = cv2.erode(alpha, np.ones((3, 3), dtype=np.uint8))
        alpha = cv2.GaussianBlur(alpha, (3, 3), .6)
        # Quiet the rainbow reflections to fit ZUR's restrained palette.
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)[..., None]
        color = np.clip(rgb.astype(np.float32) * .18 + gray * .82, 0, 255).astype(np.uint8)
        rgba = np.concatenate((color, alpha[..., None]), axis=2)
        if frames == 0:
            Image.fromarray(rgba).save(output / 'zur-bust-poster.webp', quality=88)
        encode.stdin.write(rgba.tobytes())
        frames += 1
    encode.stdin.close()
    if decode.wait() or encode.wait():
        raise RuntimeError('ffmpeg failed')
finally:
    if decode.poll() is None:
        decode.kill()
    if encode.poll() is None:
        encode.kill()
print(f'{frames} frames, {width}×{height}, {fps} fps')
for path in sorted(output.glob('zur-bust*')):
    print(f'{path}: {path.stat().st_size:,} bytes')
