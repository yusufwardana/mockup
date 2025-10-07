// Final, production-ready backend for Google AI.
// This version fixes text generation context and improves audio prompts.

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
    // This function remains the same as the previous correct version
    const { productName, productType, productImage, photoConcept, modelGender, customBackground, faceImage } = body;
    if (!productName || !productType || !productImage || !productImage.base64) { throw new Error("Data produk tidak lengkap."); }
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
    if (customBackground) { backgroundPrompt = `at ${customBackground}`; }
    const basePrompt = `A magazine-quality fashion photograph, 9:16, of an attractive Indonesian ${modelGender === 'Pria' ? 'man' : 'woman'} model. The model is wearing a stylish ${productName} (${productType}). The setting is ${backgroundPrompt}. High detail, sharp focus.`;
    const images = [];
    for (let i = 0; i < 4; i++) {
        const parts = [];
        let finalPrompt = basePrompt;
        if (i === 1) finalPrompt += " (different pose, full body shot)";
        if (i === 2) finalPrompt += " (slightly different angle, medium shot)";
        if (i === 3) finalPrompt += " (different subtle expression, close-up on the product)";
        if (faceImage && faceImage.base64) {
            const promptWithFace = `CRITICAL PRIORITY: Use the face from the FIRST provided image and accurately place it onto the model. SECOND, dress the model in the product from the SECOND provided image. The final image should follow this description: ${finalPrompt}`;
            parts.push({ text: promptWithFace });
            parts.push({ inlineData: { mimeType: faceImage.mimeType, data: faceImage.base64 } });
            parts.push({ inlineData: { mimeType: productImage.mimeType, data: productImage.base64 } });
        } else {
            const promptWithoutFace = `The model in the photo must be wearing the product from the provided image. The final image should follow this description: ${finalPrompt}`;
            parts.push({ text: promptWithoutFace });
            parts.push({ inlineData: { mimeType: productImage.mimeType, data: productImage.base64 } });
        }
        const payload = { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } };
        const result = await apiFetch(url, payload);
        const base64Image = result.candidates[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (base64Image) { images.push(base64Image); }
    }
    if (images.length === 0) { throw new Error('Semua 4 percobaan generasi gambar gagal.'); }
    return { images };
}


async function handleTextGeneration(body, apiKey, baseUrl) {
    // FIXED: Now receives and uses productType
    const { productName, productType } = body;
    if (!productName || !productType) {
        throw new Error("Nama dan tipe produk harus disertakan.");
    }
    
    const url = `${baseUrl}gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    
    // FIXED: The prompt now includes productType for context
    const prompt = `
        Anda adalah seorang content creator TikTok dan affiliate marketer profesional dari Indonesia. Tugas Anda adalah membuat konten viral untuk sebuah produk **${productType}** bernama **"${productName}"**. Bahasa yang digunakan harus 100% Bahasa Indonesia gaul, kasual, dan sangat persuasif, serta relevan dengan produknya.

        IKUTI FORMAT INI DENGAN TEPAT:

        CAPTION_TIKTOK:
        [Buat 2-3 kalimat caption yang spesifik untuk ${productType} ini. Mulai dengan "hook" yang bikin penasaran. Gunakan storytelling singkat tentang bagaimana ${productType} ini menyelesaikan masalah. Akhiri dengan CTA ke keranjang kuning. Wajib sertakan 3-5 emoji dan 3 hashtag viral yang relevan dengan ${productType}.]

        NARASI_PROMOSI:
        [Buat naskah voice over ~20 detik, dengan gaya natural seperti "spill" produk ke teman.
        Struktur:
        1. Hook yang menarik (cth: "Guys, stop scrolling! Gue nemu ${productType} impian...").
        2. Sebutkan "pain point" yang relevan dengan ${productType} (cth: "Capek kan nyari ${productType} yang nyaman tapi juga keren?").
        3. Perkenalkan "${productName}" sebagai solusinya. Sebutkan 1-2 keunggulan utamanya (cth: "Lihat deh detailnya, premium banget!").
        4. Ciptakan urgensi/FOMO (cth: "Ini limited edition, jangan sampai kehabisan!").
        5. Tutup dengan CTA yang sangat jelas (cth: "Buruan sikat di keranjang kuning!").]
    `;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const result = await apiFetch(url, payload);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Generasi teks gagal.');
    const extractContent = (fullText, start, end) => { const regex = new RegExp(`${start}:\\s*\\n?([\\s\\S]*?)(?=\\n*${end}|$)`); const match = fullText.match(regex); return match ? match[1].trim() : `Gagal mengekstrak bagian: ${start}`; };
    return { caption: extractContent(text, "CAPTION_TIKTOK", "NARASI_PROMOSI"), narrative: extractContent(text, "NARASI_PROMOSI", null) };
}

async function handleAudioGeneration(body, apiKey, baseUrl) {
    const { gender, narrative } = body;
    if (!gender || !narrative) {
        throw new Error("Data audio tidak lengkap.");
    }

    const url = `${baseUrl}gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    
    // FIXED: More explicit prompt for the TTS model
    const voiceStyle = gender === 'male' 
        ? "Bacakan narasi berikut dengan nada santai, percaya diri, dan jelas. Gunakan intonasi seperti seorang teman yang sedang merekomendasikan produk favoritnya." 
        : "Bacakan narasi berikut dengan nada yang lembut, bersemangat, dan enerjik. Gunakan intonasi yang ceria dan persuasif.";
    
    const voiceName = gender === 'male' ? "Kore" : "Puck";
    
    // The prompt is now a clear instruction set
    const prompt = `Tolong bacakan teks berikut dalam Bahasa Indonesia. ${voiceStyle} Teks narasi: "${narrative}"`;

    const payload = { 
        contents: [{ parts: [{ text: prompt }] }], 
        generationConfig: { 
            responseModalities: ["AUDIO"], 
            speechConfig: { 
                voiceConfig: { 
                    prebuiltVoiceConfig: { voiceName } 
                } 
            } 
        }, 
        model: "gemini-2.5-flash-preview-tts" 
    };
    
    const result = await apiFetch(url, payload);
    const part = result?.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) {
        throw new Error('Generasi audio gagal, tidak ada data audio yang diterima dari API.');
    }
    return { audioData: part.inlineData.data, mimeType: "audio/wav" };
}