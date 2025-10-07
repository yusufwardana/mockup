// This is the final, production-ready backend.
// It uses the powerful Google AI ecosystem for all generation tasks.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // We only need the Google API Key now.
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
        console.error("CRITICAL: GOOGLE_API_KEY environment variable is not set!");
        return res.status(500).json({ error: 'Kunci API Google tidak dikonfigurasi di server. Harap periksa pengaturan Vercel.' });
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

    const { photoConcept, modelGender, backgroundOption, customBackground, faceImage } = body;
    const url = `${baseUrl}gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;

    let backgroundPrompt = "";
    switch(photoConcept) {
        case "Golden Hour Glow": backgroundPrompt = " bathed in the warm, soft light of the golden hour at sunset"; break;
        case "Retro Analog Film": backgroundPrompt = " with the aesthetic of a 90s analog film photo, slightly grainy"; break;
        case "Cyberpunk Nightscape": backgroundPrompt = " against a futuristic cyberpunk city background at night, with vibrant neon lights"; break;
        case "Cozy Coffee Shop": backgroundPrompt = " inside a warm and cozy coffee shop"; break;
        case "Nature Explorer": backgroundPrompt = " in a beautiful natural landscape like a lush forest"; break;
        case "Studio Minimalis": backgroundPrompt = " with a clean, minimalist studio background"; break;
    }
    if (backgroundOption === 'kustom' && customBackground) {
        backgroundPrompt = ` with a background of ${customBackground}`;
    }

    const parts = [];
    let promptText;

    if (faceImage && faceImage.base64) {
        promptText = `CRITICAL PRIORITY: Use the face from the FIRST provided image (face reference) and accurately place it onto a ${modelGender} Indonesian model. Ensure a high degree of facial similarity. SECOND, dress the model in the product (${productName}, type: ${productType}) from the SECOND provided image (product image). The photo style is '${photoConcept}'${backgroundPrompt}. Create a high-resolution, 9:16 aspect ratio, magazine-quality photograph.`;
        parts.push({ text: promptText });
        parts.push({ inlineData: { mimeType: faceImage.mimeType, data: faceImage.base64 } });
        parts.push({ inlineData: { mimeType: productImage.mimeType, data: productImage.base64 } });
    } else {
        promptText = `Create a high-resolution, 9:16 aspect ratio fashion photograph. A ${modelGender} Indonesian model is wearing the product (${productName}, type: ${productType}) from the provided image. The product must be clearly visible. The photo style is '${photoConcept}'${backgroundPrompt}.`;
        parts.push({ text: promptText });
        parts.push({ inlineData: { mimeType: productImage.mimeType, data: productImage.base64 } });
    }
    
    const payload = {
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] }
    };
    
    const result = await apiFetch(url, payload);
    const base64Image = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

    if (!base64Image) {
        throw new Error('Generasi gambar gagal, tidak ada data gambar yang diterima dari API.');
    }

    return { base64Image };
}


async function handleTextGeneration(body, apiKey, baseUrl) {
    const { productName } = body;
    if (!productName) throw new Error("Nama produk tidak terkirim.");
    
    const url = `${baseUrl}gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `You are an expert TikTok affiliate marketer. Generate promotional content for a product named "${productName}". Follow this exact format with clear headers (CAPTION_TIKTOK, NARASI_PROMOSI, IDE_VIDEO) and no extra formatting. CAPTION_TIKTOK: [Write a 2-3 sentence soft-selling, persuasive caption here.] NARASI_PROMOSI: [Write a ~20-second voice-over script here in an honest review style.] IDE_VIDEO: [Write a 1-2 sentence simple visual idea for the TikTok video.]`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const result = await apiFetch(url, payload);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Generasi teks gagal.');
    const extractContent = (fullText, start, end) => {
        const regex = new RegExp(`${start}:\\s*\\n?([\\s\\S]*?)(?=\\n*${end}|$)`);
        const match = fullText.match(regex);
        return match ? match[1].replace(/^\[.*?\]\s*/, '').trim() : null;
    };
    return { caption: extractContent(text, "CAPTION_TIKTOK", "NARASI_PROMOSI"), narrative: extractContent(text, "NARASI_PROMOSI", "IDE_VIDEO"), videoPrompt: extractContent(text, "IDE_VIDEO", null) };
}

async function handleAudioGeneration(body, apiKey, baseUrl) {
    const { gender, narrative } = body;
    if (!gender || !narrative) throw new Error("Data audio tidak lengkap.");
    const url = `${baseUrl}gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    const voiceStyle = gender === 'male' ? "Read this in a relaxed and confident tone" : "Read this in a gentle and energetic tone";
    const voiceName = gender === 'male' ? "Kore" : "Puck";
    const prompt = `${voiceStyle}: ${narrative}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }, model: "gemini-2.5-flash-preview-tts" };
    const result = await apiFetch(url, payload);
    const part = result?.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) throw new Error('Generasi audio gagal.');
    return { audioData: part.inlineData.data, mimeType: "audio/wav" };
}