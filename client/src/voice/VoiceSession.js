const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const STT_ENGINE = process.env.STT_ENGINE || 'whisper.cpp';
const TTS_ENGINE = process.env.TTS_ENGINE || 'piper';
const VOICE_MODEL = process.env.TTS_VOICE || 'es_MX-ald-medium.onnx';
const ENABLE_THINKING = process.env.ENABLE_THINKING === 'true';

let instance = null;

class VoiceSession {
    static getInstance(ws, llamaUrl) {
        if (!instance) {
            instance = new VoiceSession(ws, llamaUrl);
        } else {
            instance.ws = ws; // Update ws connection if reconnected
        }
        return instance;
    }

    constructor(ws, llamaUrl) {
        this.ws = ws;
        this.llamaUrl = llamaUrl;
        this.isProcessing = false;
        
        // Context history for voice
        this.history = [];
        this.maxContext = parseInt(process.env.MAX_CONTEXT_MESSAGES || '12', 10);
        
        // Audio buffers
        this.audioBuffer = [];
        
        // Load personality
        this.systemPrompt = 'Eres un asistente conversacional rápido y amigable.';
        try {
            this.systemPrompt = fs.readFileSync(path.join(__dirname, '../../prompts/personality.txt'), 'utf8');
        } catch (e) {
            console.warn('Personality file not found, using default.');
        }
    }

    handleBinary(data) {
        // Collect incoming audio chunks from frontend
        this.audioBuffer.push(data);
    }

    handleCommand(msg) {
        switch(msg.type) {
            case 'voice.start':
                this.isProcessing = true;
                this.audioBuffer = [];
                // Cancel any ongoing TTS/LLM here if barge-in
                this.interrupt();
                break;
            
            case 'voice.end':
                this.processAudio();
                break;
                
            case 'voice.interrupt':
                this.interrupt();
                break;
        }
    }

    interrupt() {
        // Kill Piper, kill Whisper if running
        console.log('🎙️ Voice interrupted by user.');
        // TODO: Implement killing child processes
    }

    async processAudio() {
        if (this.audioBuffer.length === 0) return;
        
        console.log('🎙️ Processing audio with STT...');
        // Combine buffers (raw PCM Int16)
        const combined = Buffer.concat(this.audioBuffer);
        this.audioBuffer = [];
        
        // Write to temp file
        const tmpFile = path.join(process.cwd(), 'temp_voice.raw');
        fs.writeFileSync(tmpFile, combined);
        
        // Convert to WAV and run whisper (Mocked for now since actual whisper.cpp setup takes termux specifics)
        // Let's assume we get text from STT:
        const transcript = "Hola, ¿qué haces?"; // MOCK
        console.log(`🗣️ STT Transcript: ${transcript}`);
        
        this.ws.send(JSON.stringify({ type: 'voice.transcript', text: transcript }));
        
        // Add to history
        this.history.push({ role: 'user', content: transcript });
        if (this.history.length > this.maxContext) this.history.shift();
        
        // Call Llama
        await this.generateResponse();
    }
    
    async generateResponse() {
        console.log('🧠 Generating response with LLM...');
        
        const messages = [
            { role: 'system', content: this.systemPrompt },
            ...this.history
        ];
        
        const body = JSON.stringify({
            messages: messages,
            stream: true,
            temperature: 0.7,
            top_p: 0.8,
            top_k: 20
        });
        
        const url = new URL('/v1/chat/completions', this.llamaUrl);
        const req = http.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let fullResponse = '';
            
            res.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                const text = data.choices[0].delta.content;
                                fullResponse += text;
                                
                                // TO-DO: Stream this text to Piper TTS directly using stdin
                                // For now, we simulate Piper output
                            }
                        } catch(e) {}
                    }
                }
            });
            
            res.on('end', () => {
                this.history.push({ role: 'assistant', content: fullResponse });
                
                // MOCK PIPER TTS
                this.ws.send(JSON.stringify({ type: 'assistant.speaking' }));
                
                // In reality, Piper would output raw audio which we send as binary WS frames.
                // For demonstration, we just send a mock completion
                
                this.ws.send(JSON.stringify({ type: 'assistant.done' }));
            });
        });
        
        req.write(body);
        req.end();
    }
}

module.exports = VoiceSession;
