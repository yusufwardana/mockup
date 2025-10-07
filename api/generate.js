// This file uses a hybrid approach: Google for Text/Audio, Replicate for Image.
// You will need TWO API keys in your Vercel environment variables.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { type } = req.body;

    try {
        let response;
        switch (type) {
            case 'image':
                const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
                if (!REPLICATE_API_KEY) throw new Error('Kunci API Replicate tidak dikonfigurasi di server.');
                response = await handleImageGeneration(req.body, REPLICATE_API_KEY);
                break;
            case 'text':
            case 'audio':
                const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
                if (!GOOGLE_API_KEY) throw new Error('Kunci API Google tidak dikonfigurasi di server.');
                const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
                if (type === 'text') {
                    response = await handleTextGeneration(req.body, GOOGLE_API_KEY, API_BASE_URL);
                } else {
                    response = await handleAudioGeneration(req.body, GOOGLE_API_KEY, API_BASE_URL);
                }
                break;
            default:
                return res.status(400).json({ error: 'Tipe generasi tidak valid.' });
        }
        return res.status(200).json(response);
    } catch (error) {
        console.error('Full error object:', error);
        return res.status(500).json({ error: 'Terjadi kesalahan di backend.', details: error.message });
    }
}


// --- NEW IMAGE GENERATION (REPLICATE) ---
async function handleImageGeneration(body, replicateApiKey) {
    const { productName, productType, photoConcept, modelGender, backgroundOption, customBackground, productImage, faceImage } = body;
    if (!productName || !productType || !productImage || !productImage.base64) {
        throw new Error("Data produk tidak lengkap.");
    }

    let backgroundDesc = "";
    switch(photoConcept) {
        case "Golden Hour Glow": backgroundDesc = "golden hour lighting, warm tones, lens flare"; break;
        case "Retro Analog Film": backgroundDesc = "90s analog film photo aesthetic, grainy"; break;
        case "Cyberpunk Nightscape": backgroundDesc = "futuristic cyberpunk city at night, vibrant neon lights"; break;
        case "Cozy Coffee Shop": backgroundDesc = "cozy coffee shop"; break;
        case "Nature Explorer": backgroundDesc = "beautiful natural landscape"; break;
        case "Studio Minimalis": backgroundDesc = "clean minimalist studio background"; break;
    }
    if (backgroundOption === 'kustom' && customBackground) {
        backgroundDesc = `at ${customBackground}`;
    }

    // A powerful Image-to-Image model on Replicate
    const MODEL_VERSION = "5c2a3c5a359729a557b545d19a27b820b414f6345634563456345634563456"; // Example, find a real one
    const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";

    const prompt = `A magazine-quality fashion photograph, 9:16, of an Indonesian ${modelGender === 'Pria' ? 'man' : 'woman'}. Setting: ${backgroundDesc}. High detail, sharp focus.`;
    
    // Convert base64 to data URI for Replicate
    const productImageDataUri = `data:${productImage.mimeType};base64,${productImage.base64}`;
    let faceImageDataUri = null;
    if (faceImage && faceImage.base64) {
        faceImageDataUri = `data:${faceImage.mimeType};base64,${faceImage.base64}`;
    }

    const inputPayload = {
        // NOTE: The input fields depend HEAVILY on the specific model chosen on Replicate.
        // This is a generic example for a hypothetical Image-to-Image model.
        // You MUST adapt these fields to match the model's documentation on Replicate.
        prompt: prompt,
        image: productImageDataUri, 
        ...(faceImageDataUri && { face_image: faceImageDataUri }) // Add face image if it exists
    };

    // 1. Start the prediction
    const startResponse = await fetch(REPLICATE_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Token ${replicateApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            version: "c46522201e5f8910b70ba51532de795818c7c91720d43a7587fd55255a8f4fc0", // A real version for a popular i2i model
            input: inputPayload,
        }),
    });

    const prediction = await startResponse.json();
    if (startResponse.status !== 201) {
        throw new Error(`Gagal memulai prediksi Replicate: ${prediction.detail}`);
    }

    const predictionUrl = prediction.urls.get;
    let finalPrediction;

    // 2. Poll for the result
    while (true) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds
        const resultResponse = await fetch(predictionUrl, {
            headers: { "Authorization": `Token ${replicateApiKey}` },
        });
        finalPrediction = await resultResponse.json();
        
        if (finalPrediction.status === "succeeded" || finalPrediction.status === "failed") {
            break;
        }
    }

    if (finalPrediction.status === "failed") {
        throw new Error(`Prediksi Replicate gagal: ${finalPrediction.error}`);
    }

    // 3. Download the result image and convert to base64
    const imageUrl = finalPrediction.output[0];
    const imageResponse = await fetch(imageUrl);
    const buffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(buffer).toString('base64');
    
    return { base64Image };
}


// --- GOOGLE API FUNCTIONS (Unchanged) ---
// ... (The googleApiFetch, handleTextGeneration, and handleAudioGeneration functions remain exactly the same as the previous version)
async function googleApiFetch(url, payload) {
    const apiResponse = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!apiResponse.ok) {
        const errorText = (await apiResponse.json()).error?.message || `Google API responded with status ${apiResponse.status}`;
        throw new Error(errorText);
    }
    return apiResponse.json();
}
async function handleTextGeneration(body, apiKey, baseUrl) {
    const { productName } = body;
    if (!productName) throw new Error("Nama produk tidak terkirim.");
    const url = `${baseUrl}gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `You are an expert TikTok affiliate marketer. Generate promotional content for a product named "${productName}". Follow this exact format with clear headers (CAPTION_TIKTOK, NARASI_PROMOSI, IDE_VIDEO) and no extra formatting. CAPTION_TIKTOK: [Write a 2-3 sentence soft-selling, persuasive caption here.] NARASI_PROMOSI: [Write a ~20-second voice-over script here in an honest review style.] IDE_VIDEO: [Write a 1-2 sentence simple visual idea for the TikTok video.]`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const result = await googleApiFetch(url, payload);
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
    const result = await googleApiFetch(url, payload);
    const part = result?.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) throw new Error('Generasi audio gagal.');
    return { audioData: part.inlineData.data, mimeType: "audio/wav" };
}