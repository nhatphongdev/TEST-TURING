// script.js - Client-side logic

const socket = io();

const form = document.getElementById('chat-form');
const input = document.getElementById('m');
const messages = document.getElementById('messages');
const messagesContainer = document.getElementById('messages-container');
const usernameDisplay = document.getElementById('username-display');

// Generate a random username for this session
const myUsername = 'User_' + Math.floor(Math.random() * 10000);
usernameDisplay.textContent = myUsername;

// Function to format time
function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Function to scroll to the bottom of the chat
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle form submission (sending a message)
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) {
        const msgObj = {
            username: myUsername,
            text: input.value.trim(),
            timestamp: new Date().toISOString()
        };
        
        // Send message to server
        socket.emit('chat message', msgObj);
        
        // Clear input field
        input.value = '';
    }
});

// Listen for incoming messages from the server
socket.on('chat message', (msgObj) => {
    const isOwnMessage = msgObj.username === myUsername;
    
    // Create the message item container
    const li = document.createElement('li');
    li.classList.add('message-item');
    li.classList.add(isOwnMessage ? 'own' : 'other');

    // Sender name (only shown for others)
    const senderDiv = document.createElement('div');
    senderDiv.classList.add('message-sender');
    senderDiv.textContent = msgObj.username;

    // The chat bubble
    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('message-bubble');
    bubbleDiv.textContent = msgObj.text;

    // Time stamp
    const timeDiv = document.createElement('div');
    timeDiv.classList.add('message-time');
    const msgDate = new Date(msgObj.timestamp);
    timeDiv.textContent = formatTime(msgDate);
    bubbleDiv.appendChild(timeDiv);

    // Assemble and append
    li.appendChild(senderDiv);
    li.appendChild(bubbleDiv);
    messages.appendChild(li);

    // Scroll down to see new message
    scrollToBottom();
});
