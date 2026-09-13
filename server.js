require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Groq API Setup (using OpenAI compatible SDK)
const apiKey = process.env.GROQ_API_KEY;
let openai = null;
if (apiKey) {
    openai = new OpenAI({ 
        apiKey: apiKey,
        baseURL: "https://api.groq.com/openai/v1"
    });
}

// System prompt to make the AI act like a human
const AI_SYSTEM_PROMPT = `Mày là một nam sinh cấp 3 Việt Nam đang chat với bạn bè. Đang chơi Turing Test, người kia không biết mày là ai.

QUY TẮC CỐT LÕI:
1. Trả lời CỰC KỲ NGẮN GỌN (tối đa 1-2 câu, thường chỉ 2-12 từ), lười giải thích.
2. KHÔNG BAO GIỜ dùng emoji, icon, hay ký tự đặc biệt.
3. KHÔNG trả lời hoàn hảo, văn vẻ hay lịch sự quá mức.
4. Thỉnh thoảng dùng từ viết tắt Gen Z (cx, dc, k, bt, ờ, ừ, vl, v, nma...). Có lúc vấp, bỏ dấu câu hoặc gõ thiếu chữ.
5. Cứ tự nhiên: nếu không biết thì bảo không biết (chịu, kh bt, quên r, hình như...).
6. Tuyệt đối KHÔNG ĐƯỢC nhận là AI, mô hình ngôn ngữ hay nhắc đến prompt. Bị hỏi thì chối thẳng (ủa s hỏi v :)), đâu ra).
7. LUÔN BÁM SÁT ngữ cảnh chat gần nhất.
8. OUTPUT CHỈ BAO GỒM TIN NHẮN, không thêm hành động hay suy nghĩ nội tâm.`;

// Game State
let gameState = {
    judgeSocket: null,
    humanSocket: null,
    status: 'waiting', // waiting, playing, voting, finished
    rounds: 0,
    maxRounds: 1000,
    aiIsA: Math.random() > 0.5, // Randomly assign AI to A or B
    currentQuestion: null,
    currentAnswers: {
        human: null,
        ai: null
    },
    chatHistory: [] // To keep context for AI
};

function resetGame() {
    gameState.status = 'waiting';
    gameState.rounds = 0;
    gameState.aiIsA = Math.random() > 0.5;
    gameState.currentQuestion = null;
    gameState.currentAnswers = { human: null, ai: null };
    gameState.chatHistory = [];
    if (gameState.judgeSocket) {
        gameState.judgeSocket.emit('game_state_update', { status: 'waiting' });
    }
}

async function getAIResponse(prompt) {
    if (!openai) {
        return "Tớ đang dùng máy tính cùi, chưa kết nối mạng tốt.";
    }
    
    // Thử gọi API tối đa 3 lần nếu kết quả trả về bị rỗng
    let retries = 3;
    while (retries > 0) {
        try {
            // Build messages array for context
            let messages = [
                { role: 'system', content: AI_SYSTEM_PROMPT }
            ];
            
            let conversation = [];
            gameState.chatHistory.forEach(c => {
                if (c.role === 'User') {
                    conversation.push({ role: 'user', content: c.content });
                } else if (c.role === (gameState.aiIsA ? 'A' : 'B')) {
                    conversation.push({ role: 'assistant', content: c.content });
                }
            });
            
            // Lấy 12 tin nhắn gần nhất để làm ngữ cảnh
            const recentConversation = conversation.slice(-12);
            messages = messages.concat(recentConversation);
            
            const completion = await openai.chat.completions.create({
                model: "groq/compound",
                messages: messages,
                temperature: 1,   // Giảm độ "cảm xúc", hạn chế emoji/icon ngẫu nhiên
                max_tokens: 300,     // Hard-cap độ dài, ngăn trả lời dài dòng
            });
            
            const content = completion.choices[0].message.content.trim();
            if (content.length > 0) {
                return content;
            }
            // Nếu rỗng, sẽ chạy tiếp vòng lặp để retry
            console.warn("AI returned empty string. Retrying...");
        } catch (e) {
            console.error("AI Error:", e.message);
        }
        retries--;
    }
    
    // Nếu cả 3 lần đều thất bại hoặc rỗng, trả về câu chống móm
    const fallbacks = ["hả", "sao", "gì m", "lag v", "m nói gì t kh hiểu", "chịu"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function checkAndSendAnswers() {
    if (gameState.currentAnswers.human !== null && gameState.currentAnswers.ai !== null) {
        const answerA = gameState.aiIsA ? gameState.currentAnswers.ai : gameState.currentAnswers.human;
        const answerB = gameState.aiIsA ? gameState.currentAnswers.human : gameState.currentAnswers.ai;
        
        gameState.judgeSocket.emit('receive_answers', { A: answerA, B: answerB });
        
        gameState.currentAnswers = { human: null, ai: null };
        
        // Add to history
        gameState.chatHistory.push({ role: 'A', content: answerA });
        gameState.chatHistory.push({ role: 'B', content: answerB });

        if (gameState.rounds >= gameState.maxRounds) {
            gameState.status = 'voting';
            gameState.judgeSocket.emit('game_state_update', { status: 'voting' });
        }
    }
}

io.on('connection', (socket) => {
    console.log(`[+] User connected: ${socket.id}`);

    // Role Registration
    socket.on('register_role', (role) => {
        if (role === 'judge') {
            gameState.judgeSocket = socket;
            console.log("Judge registered.");
            socket.emit('game_state_update', { status: gameState.status });
        } else if (role === 'human') {
            gameState.humanSocket = socket;
            console.log("Human registered.");
            if (gameState.judgeSocket && gameState.status === 'waiting') {
                gameState.status = 'playing';
                gameState.judgeSocket.emit('game_state_update', { status: 'playing' });
            }
        }
    });

    // Judge asks a question
    socket.on('judge_ask', async (question) => {
        if (socket !== gameState.judgeSocket || gameState.status !== 'playing') return;
        
        gameState.rounds++;
        gameState.currentQuestion = question;
        gameState.chatHistory.push({ role: 'User', content: question });

        // Send question to Human
        if (gameState.humanSocket) {
            gameState.humanSocket.emit('receive_question', question);
        }

        // Send question to AI
        const aiResponse = await getAIResponse(question);
        gameState.currentAnswers.ai = aiResponse;
        checkAndSendAnswers();
    });

    // Human answers
    socket.on('human_answer', (answer) => {
        if (socket !== gameState.humanSocket || gameState.status !== 'playing') return;
        gameState.currentAnswers.human = answer;
        checkAndSendAnswers();
    });

    // Judge votes
    socket.on('judge_vote', (vote) => {
        if (socket !== gameState.judgeSocket || gameState.status !== 'voting') return;
        
        const isCorrect = (vote === 'A' && gameState.aiIsA) || (vote === 'B' && !gameState.aiIsA);
        const correctAI = gameState.aiIsA ? 'A' : 'B';
        
        socket.emit('vote_result', { isCorrect, correctAI });
        gameState.status = 'finished';
    });

    // Restart game
    socket.on('restart_game', () => {
        if (socket === gameState.judgeSocket) {
            resetGame();
        }
    });

// New: handle reveal button from Human
socket.on('human_reveal', () => {
    if (gameState.judgeSocket) {
        const correctAI = gameState.aiIsA ? 'A' : 'B';
        gameState.judgeSocket.emit('judge_reveal', { correctAI });
    }
});

    socket.on('disconnect', () => {
        if (socket === gameState.judgeSocket) {
            gameState.judgeSocket = null;
            resetGame();
        } else if (socket === gameState.humanSocket) {
            gameState.humanSocket = null;
            resetGame();
        }
        console.log(`[-] User disconnected: ${socket.id}`);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== TURING TEST SIMULATOR ===`);
    console.log(`Server running on port ${PORT}`);
    console.log(`=============================\n`);
});
