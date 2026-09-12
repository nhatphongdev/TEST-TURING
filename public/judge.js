const socket = io();
let isVotingPending = false;

const statusDisplay = document.getElementById('status-display');
const form = document.getElementById('judge-form');
const input = document.getElementById('m');
const sendBtn = document.getElementById('send-btn');
const messagesA = document.getElementById('messages-a');
const messagesB = document.getElementById('messages-b');

const votingOverlay = document.getElementById('voting-overlay');
const resultOverlay = document.getElementById('result-overlay');

// Register as judge
// NHATPHONG.XYZ
socket.emit('register_role', 'judge');

function appendMessage(list, text, type) {
    const li = document.createElement('li');
    li.className = `message-item ${type}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    li.appendChild(bubble);
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
}

socket.on('game_state_update', (data) => {
    const state = data.status;
    if (state === 'waiting') {
        statusDisplay.textContent = 'Đang chờ Người Trả Lời...';
        input.disabled = true;
        sendBtn.disabled = true;
        messagesA.innerHTML = '';
        messagesB.innerHTML = '';
        votingOverlay.classList.add('hidden');
        resultOverlay.classList.add('hidden');
    } else if (state === 'playing') {
        statusDisplay.textContent = 'Đang chơi! Hãy đặt câu hỏi.';
        input.disabled = false;
        sendBtn.disabled = false;
    } else if (state === 'voting') {
        isVotingPending = true;
        input.disabled = true;
        sendBtn.disabled = true;
        // 5-second countdown before showing voting overlay
        let countdown = 5;
        statusDisplay.textContent = `Đang tổng kết... ${countdown}s`;
        const timer = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                statusDisplay.textContent = `Đang tổng kết... ${countdown}s`;
            } else {
                clearInterval(timer);
                statusDisplay.textContent = 'Hết vòng! Hãy bình chọn ai là AI.';
                votingOverlay.classList.remove('hidden');
                isVotingPending = false;
            }
        }, 1000);
    }
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) {
        const question = input.value.trim();
        socket.emit('judge_ask', question);
        
        // Show own question on both columns for context
        appendMessage(messagesA, question, 'own');
        appendMessage(messagesB, question, 'own');
        
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        statusDisplay.textContent = 'Đang chờ trả lời...';
    }
});

socket.on('receive_answers', (answers) => {
    appendMessage(messagesA, answers.A, 'other');
    appendMessage(messagesB, answers.B, 'other');
    
    // Only re-enable input if we're not about to go into voting
    if (!isVotingPending) {
        input.disabled = false;
        sendBtn.disabled = false;
        statusDisplay.textContent = 'Đã có câu trả lời. Mời bạn hỏi tiếp.';
    }
});

document.getElementById('vote-a').addEventListener('click', () => {
    socket.emit('judge_vote', 'A');
});

document.getElementById('vote-b').addEventListener('click', () => {
    socket.emit('judge_vote', 'B');
});

socket.on('vote_result', (data) => {
    votingOverlay.classList.add('hidden');
    resultOverlay.classList.remove('hidden');
    
    document.getElementById('result-title').textContent = data.isCorrect ? "Chính xác!" : "Sai rồi!";
    document.getElementById('result-desc').textContent = `AI thực sự là Người ${data.correctAI}.`;
});

document.getElementById('restart-btn').addEventListener('click', () => {
    socket.emit('restart_game');
    resultOverlay.classList.add('hidden');
});
socket.on('judge_reveal', (data) => {
    // Hide any voting overlay if visible
    votingOverlay.classList.add('hidden');
    // Show result overlay with AI identity
    resultOverlay.classList.remove('hidden');
    document.getElementById('result-title').textContent = 'Kết quả';
    document.getElementById('result-desc').textContent = `AI thực sự là Người ${data.correctAI}.`;
});
