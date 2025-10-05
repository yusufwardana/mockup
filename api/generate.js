// This file should be placed in a folder named "api" in your project root.
// Vercel will automatically turn this into a serverless function.
// IMPORTANT: This code is for Node.js environment (Vercel's backend).

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
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
                return res.status(400).json({ error: 'Invalid generation type specified.' });
        }
        return res.status(200).json(response);
    } catch (error) {
        console.error('Error processing API request:', error.message);
        return res.status(500).json({ error: 'An internal server error occurred.', details: error.message });
    }
}

async function apiFetch(url, payload) {
    const apiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
        let errorText = `Google API responded with status ${apiResponse.status}`;
        try {
            // Try to parse the error response as JSON, which is the common case
            const errorData = await apiResponse.json();
            errorText += `: ${JSON.stringify(errorData)}`;
        } catch (e) {
            // If it's not JSON (e.g., HTML error page), get the raw text
            errorText += ` and the response was not valid JSON. Response body: ${await apiResponse.text()}`;
        }
        console.error("Google API Error:", errorText);
        throw new Error(errorText);
    }
    
    return apiResponse.json();
}


async function handleImageGeneration(body, apiKey, baseUrl) {
    const {
        productName, productType, photoConcept, modelGender, backgroundOption,
        customBackground, productImage, faceImage
    } = body;
    
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

    if (faceImage) {
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
        throw new Error('Image generation failed, no image data received from API.');
    }

    return { base64Image };
}


async function handleTextGeneration(body, apiKey, baseUrl) {
    const { productName } = body;
    const url = `${baseUrl}gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const prompt = `
        You are an expert TikTok affiliate marketer. Generate promotional content for a product named "${productName}".
        Follow this exact format with clear headers (CAPTION_TIKTOK, NARASI_PROMOSI, IDE_VIDEO) and no extra formatting.

        CAPTION_TIKTOK:
        [Write a 2-3 sentence soft-selling, persuasive caption here. Must include a call-to-action to the yellow basket/bio, 3-5 relevant emojis, and 3-4 trending hashtags.]

        NARASI_PROMOSI:
        [Write a ~20-second voice-over script here. Use a friendly, honest review style. Start with a hook, present a problem, offer the product as the solution, and end with a call-to-action.]

        IDE_VIDEO:
        [Write a 1-2 sentence simple but engaging visual idea for the TikTok video, including a call-to-action gesture.]
    `;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const result = await apiFetch(url, payload);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if(!text) throw new Error('Text generation failed, no text data received from API.');

    const extractContent = (fullText, startMarker, endMarker) => {
        const startIndex = fullText.indexOf(startMarker);
        if (startIndex === -1) return null;
        const contentStart = startIndex + startMarker.length;
        let endIndex = endMarker ? fullText.indexOf(endMarker, contentStart) : fullText.length;
        if (endIndex === -1) endIndex = fullText.length;
        return fullText.substring(contentStart, endIndex).trim().replace(/^\[.*?\]\s*/, '').trim();
    };

    const caption = extractContent(text, "CAPTION_TIKTOK:", "NARASI_PROMOSI");
    const narrative = extractContent(text, "NARASI_PROMOSI:", "IDE_VIDEO");
    const videoPrompt = extractContent(text, "IDE_VIDEO:", null);
    
    return { caption, narrative, videoPrompt };
}


async function handleAudioGeneration(body, apiKey, baseUrl) {
    const { gender, narrative } = body;
    const url = `${baseUrl}gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    
    let voiceStyle, voiceName;
    if (gender === 'male') {
        voiceStyle = "Read this in a relaxed and confident tone";
        voiceName = "Kore";
    } else {
        voiceStyle = "Read this in a gentle and energetic tone";
        voiceName = "Puck";
    }
    const prompt = `${voiceStyle}: ${narrative}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
        },
        model: "gemini-2.5-flash-preview-tts"
    };
    
    const result = await apiFetch(url, payload);
    const part = result?.candidates?.[0]?.content?.parts?.[0];
    
    if (!part?.inlineData?.data) {
        throw new Error('Audio generation failed, no audio data received from API.');
    }
    
    return { audioData: part.inlineData.data, mimeType: "audio/wav" };
}