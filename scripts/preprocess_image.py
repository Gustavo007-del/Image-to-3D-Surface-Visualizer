#!/usr/bin/env python3
"""Create browser-ready height and edge maps from an input image."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Source image path")
    parser.add_argument("--output", type=Path, default=Path("public/generated"), help="Output directory")
    parser.add_argument("--blur", type=int, default=0, help="Gaussian blur radius (0 disables blur)")
    parser.add_argument("--denoise", choices=("none", "gaussian", "median", "bilateral"), default="none")
    parser.add_argument("--clahe", action="store_true", help="Apply local contrast enhancement")
    parser.add_argument("--edges", action="store_true", help="Write a Canny edge map and combined map")
    parser.add_argument("--edge-low", type=int, default=60, help="Canny lower threshold")
    parser.add_argument("--edge-high", type=int, default=150, help="Canny upper threshold")
    return parser.parse_args()


def denoise(gray: np.ndarray, mode: str) -> np.ndarray:
    if mode == "gaussian":
        return cv2.GaussianBlur(gray, (5, 5), 0)
    if mode == "median":
        return cv2.medianBlur(gray, 5)
    if mode == "bilateral":
        return cv2.bilateralFilter(gray, 9, 75, 75)
    return gray


def odd_kernel(value: int) -> int:
    return max(3, value if value % 2 else value + 1)


def main() -> None:
    args = parse_args()
    image = cv2.imread(str(args.input), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"Unable to read image: {args.input}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = denoise(gray, args.denoise)
    if args.blur > 0:
        gray = cv2.GaussianBlur(gray, (odd_kernel(args.blur), odd_kernel(args.blur)), 0)
    if args.clahe:
        gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)

    height_map = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    args.output.mkdir(parents=True, exist_ok=True)
    stem = args.input.stem
    height_path = args.output / f"{stem}_height.png"
    cv2.imwrite(str(height_path), height_map)
    print(f"height map: {height_path} ({height_map.shape[1]}x{height_map.shape[0]})")

    if args.edges:
        edges = cv2.Canny(height_map, args.edge_low, args.edge_high)
        combined = cv2.addWeighted(height_map, 0.84, edges, 0.16, 0)
        edge_path = args.output / f"{stem}_edges.png"
        combined_path = args.output / f"{stem}_height_edges.png"
        cv2.imwrite(str(edge_path), edges)
        cv2.imwrite(str(combined_path), combined)
        print(f"edge map: {edge_path}")
        print(f"combined map: {combined_path}")


if __name__ == "__main__":
    main()
