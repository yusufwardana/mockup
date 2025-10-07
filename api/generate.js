// Final, production-ready backend for Google AI.
// This version implements the user-provided, proven-working logic for Text-to-Speech.

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
    // This function is correct and remains unchanged.
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
    // This function is correct and remains unchanged.
    const { productName, productType } = body;
    if (!productName || !productType) { throw new Error("Nama dan tipe produk harus disertakan."); }
    const url = `${baseUrl}gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const prompt = `
        Anda adalah seorang content creator TikTok dan affiliate marketer profesional dari Indonesia. Tugas Anda adalah membuat 4 jenis teks berbeda untuk mempromosikan produk **${productType}** bernama **"${productName}"**. Bahasa harus 100% Bahasa Indonesia yang menjual dan viral.
        IKUTI FORMAT INI DENGAN TEPAT MENGGUNAKAN HEADER YANG JELAS:
        DESKRIPSI_KONTEN:
        [Buat deskripsi umum yang informatif tentang produk ini dalam 2-3 kalimat.]
        CAPTION_KONTEN:
        [Buat caption TikTok yang sangat singkat dan menarik (1-2 baris). Fokus pada "hook" yang kuat dan CTA yang pendek. Wajib sertakan 3 hashtag viral.]
        NARASI_KONTEN:
        [Buat naskah voice over ~20 detik dengan gaya "spill produk". Gunakan bahasa gaul dan persuasif. Struktur: 1. Hook. 2. Masalah. 3. Solusi ("${productName}"). 4. Keunggulan. 5. Urgensi/FOMO. 6. CTA ("checkout di keranjang kuning!").]
        PROMPT_VIDEO:
        [In ENGLISH, write a short, dynamic prompt for an image-to-video AI. Describe a 3-second scene with movement. Example: "A stylish model wearing the '${productName}' ${productType}, slow-motion turn, cinematic lighting, subtle wind blowing, hyperrealistic.".]
    `;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const result = await apiFetch(url, payload);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Generasi teks gagal.');
    const extractContent = (fullText, start, end) => { const regex = new RegExp(`${start}:\\s*\\n?([\\s\\S]*?)(?=\\n*${end}|$)`); const match = fullText.match(regex); return match ? match[1].trim().replace(/^\[|\]$/g, '') : null; };
    return { 
        description: extractContent(text, "DESKRIPSI_KONTEN", "CAPTION_KONTEN"),
        caption: extractContent(text, "CAPTION_KONTEN", "NARASI_KONTEN"), 
        narrative: extractContent(text, "NARASI_KONTEN", "PROMPT_VIDEO"),
        videoPrompt: extractContent(text, "PROMPT_VIDEO", null) 
    };
}

async function handleAudioGeneration(body, apiKey, baseUrl) {
    // --- PERBAIKAN FINAL DI SINI ---
    const { gender, narrative } = body;
    if (!gender || !narrative) {
        throw new Error("Data narasi untuk audio tidak lengkap.");
    }

    const url = `${baseUrl}gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    
    // Mengadopsi logika dari referensi Anda yang terbukti berhasil.
    const voiceName = gender === 'male' ? 'Kore' : 'Puck'; // Kore (Firm Male), Puck (Upbeat Female)
    const prompt = `Ucapkan dengan gaya pencerita yang menarik: ${narrative}`;

    const payload = { 
        contents: [{ parts: [{ text: prompt }] }], 
        generationConfig: { 
            responseModalities: ["AUDIO"], 
            speechConfig: { 
                voiceConfig: { 
                    prebuiltVoiceConfig: { voiceName: voiceName } 
                } 
            } 
        }, 
        model: "gemini-2.5-flash-preview-tts" 
    };
    
    const result = await apiFetch(url, payload);
    const part = result?.candidates?.[0]?.content?.parts?.[0];
    if (!part?.inlineData?.data) {
        throw new Error('Generasi audio gagal. API tidak mengembalikan data audio. Pastikan API Text-to-Speech aktif di Google Cloud.');
    }
    return { audioData: part.inlineData.data, mimeType: "audio/wav" };
}

async function handleGenerateVoiceOver() {
    const narration = narrationOutput.value.trim();
    if (!narration) {
        showError("Tidak ada narasi untuk diubah menjadi suara.");
        return;
    }

    voiceLoader.classList.remove('hidden');
    audioContainer.classList.add('hidden');
    generateVoiceBtn.disabled = true;
    errorMessage.classList.add('hidden');

    try {
        const selectedVoice = document.querySelector('input[name="voice"]:checked').value;
        const voiceName = selectedVoice === 'male' ? 'Kore' : 'Puck'; // Kore (Firm Male), Puck (Upbeat Female)

        const payload = {
            contents: [{ parts: [{ text: `Ucapkan dengan gaya pencerita yang menarik: ${narration}` }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
                }
            },
            model: TTS_MODEL
        };
        
        const result = await makeApiCall(TTS_API_URL, payload);
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            const sampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);
            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);
            audioPlayer.src = audioUrl;
            audioContainer.classList.remove('hidden');
        } else {
            throw new Error("Gagal mendapatkan data audio dari API.");
        }

    } catch (error) {
        console.error("Error generating voice over:", error);
        showError("Maaf, terjadi kesalahan saat membuat suara. Coba lagi.");
    } finally {
        voiceLoader.classList.add('hidden');
        generateVoiceBtn.disabled = false;
    }
}

// --- Audio Helper Functions ---
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function pcmToWav(pcmData, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.length * 2; // 16-bit samples are 2 bytes
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Audio format (1 is PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
        view.setInt16(offset, pcmData[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
}
