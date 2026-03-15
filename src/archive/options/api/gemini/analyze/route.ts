import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // 1. Validate Input
        if (!body.model || !body.active_position || !body.live_market_context) {
            return NextResponse.json({ error: "Missing required payload fields." }, { status: 400 });
        }

        // 2. Read System Prompt from file
        let promptFileName = 'pro_prompt.txt';
        if (body.model === 'flash') promptFileName = 'flash_prompt.txt';
        if (body.model === 'suggest') promptFileName = 'suggest_prompt.txt';
        const promptPath = path.join(process.cwd(), 'src', 'prompts', promptFileName);
        
        let system_directive = '';
        try {
            system_directive = fs.readFileSync(promptPath, 'utf-8');
        } catch (err) {
            console.error(`Failed to read prompt file ${promptFileName}:`, err);
            return NextResponse.json({ error: "Failed to load system directive." }, { status: 500 });
        }

        // 3. Initialize Gemini SDK
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "GEMINI_API_KEY environment variable is not set." }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const reqModel = body.model === 'flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
        const model = genAI.getGenerativeModel({ model: reqModel });

        // 4. Construct Prompt
        const prompt = `
${system_directive}

ACTIVE POSITION:
${JSON.stringify(body.active_position, null, 2)}

LIVE MARKET CONTEXT (QUANT DASHBOARD STATE):
${JSON.stringify(body.live_market_context, null, 2)}
`;

        // 5. Execute Analysis
        if (body.model === 'pro' || body.model === 'suggest') {
            const result = await model.generateContentStream(prompt);
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of result.stream) {
                            const chunkText = chunk.text();
                            if (chunkText) {
                                controller.enqueue(encoder.encode(chunkText));
                            }
                        }
                        controller.close();
                    } catch (error) {
                        controller.error(error);
                    }
                }
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                },
            });
        }

        // Default blocking behavior for flash
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        return NextResponse.json({ analysis: responseText });

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return NextResponse.json({ error: error.message || "Failed to generate analysis" }, { status: 500 });
    }
}
