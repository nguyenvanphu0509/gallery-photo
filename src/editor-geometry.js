// react-easy-crop reports pixels in the rotated bounding box. The API accepts original pixels.
export function originalCropFromArea(area, width, height, rotation, flipped) {
  if (!area) return null;
  const rotatedWidth = rotation % 180 ? height : width;
  const rotatedHeight = rotation % 180 ? width : height;
  const w = Math.max(1, Math.min(rotatedWidth, Math.round(area.width)));
  const h = Math.max(1, Math.min(rotatedHeight, Math.round(area.height)));
  let x = Math.max(0, Math.min(rotatedWidth - w, Math.round(area.x)));
  const y = Math.max(0, Math.min(rotatedHeight - h, Math.round(area.y)));
  if (flipped) x = rotatedWidth - x - w;
  switch (rotation) {
    case 90: return { x: y, y: height - x - w, width: h, height: w };
    case 180: return { x: width - x - w, y: height - y - h, width: w, height: h };
    case 270: return { x: width - y - h, y: x, width: h, height: w };
    default: return { x, y, width: w, height: h };
  }
}

export function drawEditPreview(canvas, image, crop, rotation, flipped) {
  const width = rotation % 180 ? crop.height : crop.width;
  const height = rotation % 180 ? crop.width : crop.height;
  const scale = Math.min(1, 800 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(flipped ? -scale : scale, scale);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
}
