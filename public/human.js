const socket = io();

const statusDisplay = document.getElementById('status-display');
const form = document.getElementById('human-form');
const input = document.getElementById('m');
const sendBtn = document.getElementById('send-btn');
const messages = document.getElementById('messages');
const messagesContainer = document.getElementById('messages-container');

// Register as human
socket.emit('register_role', 'human');
statusDisplay.textContent = 'Đã kết nối. Đợi Giám khảo hỏi...';

function appendMessage(text, type) {
    const li = document.createElement('li');
    li.className = `message-item ${type}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    li.appendChild(bubble);
    messages.appendChild(li);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

socket.on('receive_question', (question) => {
    appendMessage(question, 'other'); // Judge's question
    
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    statusDisplay.textContent = 'Hãy trả lời!';
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) {
        const answer = input.value.trim();
        socket.emit('human_answer', answer);
        
        appendMessage(answer, 'own');
        
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        statusDisplay.textContent = 'Đã trả lời. Chờ câu hỏi tiếp theo...';
    }
});
// New: handle reveal button click
const revealBtn = document.getElementById('reveal-btn');
if (revealBtn) {
    revealBtn.addEventListener('click', () => {
        socket.emit('human_reveal');
    });
}
