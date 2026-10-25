const sharp = require("sharp");
const path = require("path");

const src = path.join(__dirname, "public", "brand", "icon-512.png");
const out = path.join(__dirname, "public", "brand", "og-200.png");

sharp(src)
  .resize(200, 200, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png({ palette: true, quality: 80, compressionLevel: 9 })
  .toFile(out)
  .then((info) => {
    console.log("Wrote", out);
    console.log("Size:", (info.size / 1024).toFixed(1), "KB");
    console.log(info);
  })
  .catch((err) => {
    console.error("FAILED:", err.message);
  });
