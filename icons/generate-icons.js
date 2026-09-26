const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Minimal Pi symbol SVG - matches the app logo
function createSVG(size) {
    const strokeWidth = Math.max(2, size / 14);
    const circleR = size * 0.43;
    const centerX = size / 2;
    const centerY = size / 2;
    const handLength = circleR * 0.85;
    const handAngle = -Math.PI / 2.5;

    const handX = centerX + Math.cos(handAngle) * handLength;
    const handY = centerY + Math.sin(handAngle) * handLength;

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0a0a0f"/>
  <circle cx="${centerX}" cy="${centerY}" r="${circleR}" stroke="#818cf8" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>
  <path d="M ${centerX} ${centerY - circleR * 0.45} L ${handX} ${handY}" stroke="#818cf8" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

// Write SVG files first (can be used as fallback)
sizes.forEach(size => {
    const svgContent = createSVG(size);
    fs.writeFileSync(path.join(__dirname, `icon-${size}.svg`), svgContent);
    console.log(`Generated icon-${size}.svg`);
});

console.log('\nSVG icons created. For PWA, you need actual PNG files.');
console.log('You can convert SVGs to PNGs using an image editor or online tool.');
console.log('The manifest.json references .png files - rename .svg to .png after conversion.');