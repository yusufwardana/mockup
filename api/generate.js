// Final, production-ready backend for Google AI.
// This version generates 4 images by making 4 sequential calls to the API.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
        console.error("CRITICAL: GOOGLE_API_KEY environment variable is not set!");
        return res.status(500).json({ error: 'Kunci API Google tidak dikonfigurasi di server.' });
    }

    const { type } = req.body;
    const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

    try {
        let response;
        switch (type) {
            case 'image':
                response = await handleImageGeneration(req.body, GOOGLE_API_KEY, API_BASE_URL);
                break;
            case 'text':
                response = await handleTextGeneration(req.body, GOOGLE_API_KEY, API_BASE_URL);
                break;
            case 'audio':
                response = await handleAudioGeneration(req.body, GOOGLE_API_KEY, API_BASE_URL);
                break;
            default:
                return res.status(400).json({ error: 'Tipe generasi tidak valid.' });
        }
        return res.status(200).json(response);
    } catch (error) {
        console.error('Full error object:', error);
        return res.status(500).json({ error: 'Terjadi kesalahan saat berkomunikasi dengan Google AI.', details: error.message });
    }
}

async function apiFetch(url, payload) {
    const apiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
        let errorText = `Google API merespons dengan status ${apiResponse.status}`;
        try {
            const errorData = await apiResponse.json();
            errorText = errorData.error?.message || JSON.stringify(errorData);
        } catch (e) {
            errorText += ` dan respons bukan JSON yang valid.`;
        }
        console.error("Google API Error:", errorText);
        throw new Error(errorText);
    }
    
    return apiResponse.json();
}


async function handleImageGeneration(body, apiKey, baseUrl) {
    const { productName, productType, productImage } = body;
    if (!productName || !productType || !productImage || !productImage.base64) {
        throw new Error("Data produk tidak lengkap. Pastikan nama, tipe, dan gambar produk telah terkirim.");
    }

    const { photoConcept, modelGender, customBackground, faceImage } = body;
    const url = `${baseUrl}gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;

    let backgroundPrompt = "";
    switch(photoConcept) {
        case "Golden Hour Glow": backgroundPrompt = "beautiful golden hour lighting, cinematic"; break;
        case "Retro Analog Film": backgroundPrompt = "90s analog film aesthetic, grainy, vintage"; break;
        case "Cyberpunk Nightscape": backgroundPrompt = "futuristic cyberpunk city at night, neon lights"; break;
        case "Cozy Coffee Shop": backgroundPrompt = "warm and cozy coffee shop"; break;
        case "Nature Explorer": backgroundPrompt = "beautiful natural landscape, forest"; break;
        case "Studio Minimalis": backgroundPrompt = "clean minimalist studio background"; break;
    }
    if (customBackground) {
        backgroundPrompt = `at ${customBackground}`;
    }

    const basePrompt = `A magazine-quality fashion photograph, 9:16 aspect ratio, of an attractive Indonesian ${modelGender === 'Pria' ? 'man' : 'woman'} model. The model is wearing a stylish ${productName} (${productType}). The setting is ${backgroundPrompt}. High detail, sharp focus, professional photography.`;

    const images = [];

    // --- NEW: Generate 4 images sequentially ---
    for (let i = 0; i < 4; i++) {
        const parts = [];
        let finalPrompt = basePrompt;
        
        // Add variation prompts for each image except the first
        if (i === 1) finalPrompt += " (different pose, full body shot)";
        if (i === 2) finalPrompt += " (slightly different angle, medium shot)";
        if (i === 3) finalPrompt += " (different subtle expression, close-up shot on the product)";

        if (faceImage && faceImage.base64) {
            const promptWithFace = `CRITICAL PRIORITY: Use the face from the FIRST provided image (face reference) and accurately place it onto the model. SECOND, dress the model in the product from the SECOND provided image (product image). The final image should follow this description: ${finalPrompt}`;
            parts.push({ text: promptWithFace });
            parts.push({ inlineData: { mimeType: faceImage.mimeType, data: faceImage.base64 } });
            parts.push({ inlineData: { mimeType: productImage.mimeType, data: productImage.base64 } });
        } else {
            const promptWithoutFace = `The model in the photo must be wearing the product from the provided image. The final image should follow this description: ${finalPrompt}`;
            parts.push({ text: promptWithoutFace });
            parts.push({ inlineData: { mimeType: productImage.mimeType, data: productImage.base64 } });
        }
        
        const payload = {
            contents: [{ parts }],
            generationConfig: { 
                responseModalities: ['IMAGE'],
                // candidateCount is now 1 (default)
            }
        };
        
        const result = await apiFetch(url, payload);
        const base64Image = result.candidates[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (base64Image) {
            images.push(base64Image);
        } else {
            // If one image fails, we can choose to stop or continue. Let's continue.
            console.warn(`Image generation failed for variation ${i+1}`);
        }
    }

    if (images.length === 0) {
        throw new Error('Semua 4 percobaan generasi gambar gagal.');
    }

    return { images };
}


async function handleTextGeneration(body, apiKey, baseUrl) {
    const { productName } = body;
    if (!productName) throw new Error("Nama produk tidak terkirim.");
    const url = `${baseUrl}gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `Anda adalah seorang content creator TikTok dan affiliate marketer profesional dari Indonesia. Tugas Anda adalah membuat konten viral untuk produk bernama "${productName}". Bahasa yang digunakan harus 100% Bahasa Indonesia gaul, kasual, dan sangat persuasif. IKUTI FORMAT INI DENGAN TEPAT: CAPTION_TIKTOK: [Buat 2-3 kalimat caption. Mulai dengan "hook" yang bikin penasaran. Gunakan storytelling singkat. Akhiri dengan CTA yang kuat ke keranjang kuning. Wajib sertakan 3-5 emoji dan 3 hashtag viral seperti #RacunTikTok #TikTokShop #FYP.] NARASI_PROMOSI: [Buat naskah voice over ~20 detik. Gaya bicara natural seperti sedang "spill" produk. Struktur: 1. Hook. 2. Sebutkan 1-2 "pain point". 3. Perkenalkan "${productName}" sebagai solusi. 4. Ciptakan urgensi/FOMO. 5. Tutup dengan CTA yang sangat jelas.]`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const result = await apiFetch(url, payload);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Generasi teks gagal.');
    const extractContent = (fullText, start, end) => { const regex = new RegExp(`${start}:\\s*\\n?([\\s\\S]*?)(?=\\n*${end}|$)`); const match = fullText.match(regex); return match ? match[1].trim() : `Gagal mengekstrak bagian: ${start}`; };
    return { caption: extractContent(text, "CAPTION_TIKTOK", "NARASI_PROMOSI"), narrative: extractContent(text, "NARASI_PROMOSI", null) };
}

async function handleAudioGeneration(body, apiKey, baseUrl) {
    const { gender, narrative } = body;
    if (!gender || !narrative) throw new Error("Data audio tidak lengkap.");
    const url = `${baseUrl}gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    const voiceStyle = gender === 'male' ? "Read this in a relaxed and confident tone in Indonesian" : "Read this in a gentle and energetic tone in Indonesian";
    const voiceName = gender === 'male' ? "Kore" : "Puck";
    const prompt = `${voiceStyle}: ${narrative}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }, model: "gemini-2.5-flash-preview-tts" };
    const result = await apiFetch(url, payload);
    const part = result?.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) throw new Error('Generasi audio gagal.');
    return { audioData: part.inlineData.data, mimeType: "audio/wav" };
}