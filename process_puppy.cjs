const Jimp = require('jimp');

async function processSprite() {
    try {
        const img = await Jimp.read('/Users/scottkaufman/.gemini/antigravity/brain/4ae61f0f-8f0f-4766-9c96-6fe0056d5e31/animatronic_dog_sprite_1772129640934.png');

        // The image is a 2x2 grid
        const w = img.getWidth();
        const h = img.getHeight();
        const w_mid = Math.floor(w / 2);
        const h_mid = Math.floor(h / 2);

        // We only want the top 85% of each quadrant to cut off the numbers
        const crop_w = w_mid;
        const crop_h = Math.floor(h_mid * 0.85);

        console.log(`Original size: ${w}x${h}`);
        console.log(`Cropped size per frame: ${crop_w}x${crop_h}`);

        // Create 4 separate cropped images
        const q1 = img.clone().crop(0, 0, crop_w, crop_h);
        const q2 = img.clone().crop(w_mid, 0, crop_w, crop_h);
        const q3 = img.clone().crop(0, h_mid, crop_w, crop_h);
        const q4 = img.clone().crop(w_mid, h_mid, crop_w, crop_h);

        // Create a new wide image to hold the 4 frames horizontally
        const finalImg = new Jimp(crop_w * 4, crop_h);

        finalImg.composite(q1, 0, 0);
        finalImg.composite(q2, crop_w, 0);
        finalImg.composite(q3, crop_w * 2, 0);
        finalImg.composite(q4, crop_w * 3, 0);

        // Remove green background
        finalImg.scan(0, 0, finalImg.getWidth(), finalImg.getHeight(), function (x, y, idx) {
            const red = this.bitmap.data[idx + 0];
            const green = this.bitmap.data[idx + 1];
            const blue = this.bitmap.data[idx + 2];

            // If it's a very vibrant green (chromakey)
            if (green > 120 && red < 120 && blue < 120) {
                // Set alpha to 0 for transparent
                this.bitmap.data[idx + 3] = 0;
            }
        });

        // Resize down to something manageable for animation (e.g. 150px height)
        finalImg.resize(Jimp.AUTO, 150);

        await finalImg.writeAsync('/Users/scottkaufman/Developer/Developer/symphonyOS/public/puppy_sprite.png');
        console.log('Successfully wrote puppy sprite!');
    } catch (e) {
        console.error(e);
    }
}

processSprite();
