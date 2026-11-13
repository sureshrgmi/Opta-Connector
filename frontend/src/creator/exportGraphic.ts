export type GraphicFormat = "png" | "jpg" | "svg";

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportGraphic(
  svg: SVGSVGElement,
  format: GraphicFormat,
  fileName: string,
) {
  const serialized = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  if (format === "svg") {
    saveBlob(svgBlob, `${fileName}.svg`);
    return;
  }

  const sourceUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = sourceUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 3840;
    canvas.height = 2160;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not create the PNG export canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
    const extension = format === "jpg" ? "jpg" : "png";
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`The browser could not encode the ${format.toUpperCase()} export.`));
      }, mimeType, format === "jpg" ? 0.94 : undefined);
    });
    saveBlob(imageBlob, `${fileName}-4k.${extension}`);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
