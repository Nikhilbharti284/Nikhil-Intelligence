const API_KEY = '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';
let conversationHistory = [];
let isProcessing = false;
let isSpeakingEnabled = localStorage.getItem('isSpeakingEnabled') !== 'false'; // Persist speaking preference
let hasWelcomeMessageBeenSpoken = false;
let currentUtterance = null;
let selectedVoice = null;
let typingSpeed = 30; // Configurable typing speed in ms

// Initialize voices when they are loaded
window.speechSynthesis.onvoiceschanged = initializeVoices;

function initializeVoices() {
    const voices = window.speechSynthesis.getVoices();
    console.log("Available voices:", voices.map(v => `${v.name} (${v.lang})`));

    // Prioritize female voices
    selectedVoice = voices.find(voice =>
        (voice.name.includes('Female') ||
            voice.name.includes('Woman') ||
            voice.name.includes('Girl') ||
            voice.name.includes('Samantha') ||
            voice.name.includes('Veena') ||
            voice.name.includes('Kendra') ||
            voice.name.includes('Zira')) &&
        (voice.lang.includes('en') || voice.lang.includes('hi'))
    );

    // Fallback to any English or Hindi voice
    if (!selectedVoice) {
        selectedVoice = voices.find(voice =>
            voice.lang === 'en-US' ||
            voice.lang === 'en-GB' ||
            voice.lang === 'en-IN' ||
            voice.lang === 'hi-IN'
        );
    }

    console.log("Selected voice:", selectedVoice ? selectedVoice.name : "No voice selected");
}

document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            navLinks.style.display = navLinks.classList.contains('active') ? 'flex' : 'none';
        });
    }

    // Initialize UI elements
    setupEventListeners();
    updateSpeakingToggleButton();

    // Show welcome message after a short delay
    setTimeout(showWelcomeMessage, 800);

    // Ensure voices are initialized
    if (window.speechSynthesis.getVoices().length > 0) {
        initializeVoices();
    }
});

function setupEventListeners() {
    const userInput = document.getElementById('user-input');
    userInput.addEventListener('keypress', handleKeyPress);
    document.querySelector('button[type="submit"]').addEventListener('click', sendMessage);
    document.getElementById('file-input').addEventListener('change', handleFileUpload);

    const speakingToggle = document.getElementById('speaking-toggle');
    if (speakingToggle) {
        speakingToggle.addEventListener('click', toggleSpeaking);
    }

    const pauseButton = document.getElementById('pause-button');
    if (pauseButton) {
        pauseButton.addEventListener('click', togglePauseSpeaking);
        setInterval(() => {
            if (speechSynthesis.speaking && !speechSynthesis.paused) {
                pauseButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
                pauseButton.disabled = false;
            } else if (speechSynthesis.paused) {
                pauseButton.innerHTML = '<i class="fas fa-play"></i> Resume';
                pauseButton.disabled = false;
            } else {
                pauseButton.disabled = true;
            }
        }, 300);
    }

    const clearButton = document.getElementById('clear-chat');
    if (clearButton) {
        clearButton.addEventListener('click', clearChat);
    }
}

function showWelcomeMessage() {
    const welcomeMessage = "I am Nikhil AI, how may I help you?";
    addMessage(welcomeMessage, false);

    if (isSpeakingEnabled && !hasWelcomeMessageBeenSpoken) {
        speakText(welcomeMessage);
        hasWelcomeMessageBeenSpoken = true;
    }
}

function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show loading indicator
    addMessage(`Uploading file: ${file.name}...`, true);

    try {
        const content = await readFileContent(file);
        // Replace the loading message with actual file info
        updateLastUser Message(`[Attached File: ${file.name}]`);

        // Add file content to conversation history
        conversationHistory.push({
            role: 'user',
            content: `File: ${file.name}\nContent: ${content.substring(0, 5000)}` // Increased limit
        });

        // Auto-send a prompt about the file
        const userInput = document.getElementById('user-input');
        userInput.value = `I've uploaded a file named "${file.name}". Please analyze its contents.`;
        sendMessage();
    } catch (error) {
        console.error('Error reading file:', error);
        addMessage('Failed to read the file. Please try again.', false);
    } finally {
        event.target.value = ''; // Clear file input
    }
}

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}

function updateLastUser Message(text) {
    const chatHistory = document.getElementById('chat-history');
    const messages = chatHistory.querySelectorAll('.user-message');
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        lastMessage.querySelector('div:first-child').textContent = text;
    }
}

async function sendMessage() {
    if (isProcessing) return;

    const userInput = document.getElementById('user-input');
    const message = userInput.value.trim();
    if (!message) return;

    // Add user message
    addMessage(message, true);
    conversationHistory.push({ role: 'user', content: message });
    userInput.value = '';
    userInput.style.height = 'auto'; // Reset textarea height if it was expanded

    // Show thinking indicator
    isProcessing = true;
    setStatus('AI is thinking...');
    const thinkingIndicator = addThinkingIndicator();

    try {
        const response = await fetchAIResponse();

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error || response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        // Display AI response with typing effect
        typeResponse(aiResponse, () => {
            conversationHistory.push({
                role: 'assistant',
                content: aiResponse
            });

            // Speak the AI response if enabled
            if (isSpeakingEnabled) {
                speakText(aiResponse);
            }
        });
    } catch (error) {
        console.error('Error:', error);
        addMessage(`Sorry, an error occurred: ${error.message}. Please try again.`, false);
    } finally {
        isProcessing = false;
        removeThinkingIndicator(thinkingIndicator);
        setStatus('');
    }
}

function fetchAIResponse() {
    return fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href, // Required by some APIs
            'X-Title': 'Nikhil AI Assistant'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo', // Can be configurable
            messages: getConversationContext(),
            temperature: 0.7,
            max_tokens: 2000
        })
    });
}

// Get the most relevant conversation context (last 10 messages)
function getConversationContext() {
    return conversationHistory.slice(-10);
}

function addMessage(message, isUser ) {
    const chatHistory = document.getElementById('chat-history');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser  ? 'user-message' : 'bot-message'}`;

    // Support for basic markdown-like formatting
    const formattedMessage = isUser  ? message : formatMessage(message);

    messageDiv.innerHTML = `
        <div>${formattedMessage}</div>
        <div class="message-timestamp">${timestamp}</div>
    `;

    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function formatMessage(text) {
    // Convert code blocks
    text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Convert inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Convert bold text
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Convert italic text
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Convert URLs to links
    text = text.replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Convert newlines to <br>
    text = text.replace(/\n/g, '<br>');

    return text;
}

function addThinkingIndicator() {
    const chatHistory = document.getElementById('chat-history');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message bot-message thinking';
    thinkingDiv.innerHTML = `
        <div class="thinking-indicator">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    `;
    chatHistory.appendChild(thinkingDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return thinkingDiv;
}

function removeThinkingIndicator(element) {
    if (element && element.parentNode) {
        element.parentNode.removeChild(element);
    }
}

function setStatus(text) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = text;

        // Clear status after 5 seconds if it's not an ongoing process message
        if (text && !text.includes('thinking') && !text.includes('typing') && !text.includes('Speaking')) {
            setTimeout(() => {
                if (statusElement.textContent === text) {
                    statusElement.textContent = '';
                }
            }, 5000);
        }
    }
}

function clearChat() {
    if (confirm('Are you sure you want to clear the chat history?')) {
        const chatHistory = document.getElementById('chat-history');
        chatHistory.innerHTML = '';
        conversationHistory = [{
            role: 'system',
            content: "You are Nikhil AI, a helpful and friendly assistant with a female personality."
        }];
        showWelcomeMessage();
    }
}

// Toggle speaking functionality with state persistence
function toggleSpeaking() {
    isSpeakingEnabled = !isSpeakingEnabled;

    // Persist speaking preference
    localStorage.setItem('isSpeakingEnabled', isSpeakingEnabled);

    // Stop speech if turned off
    if (!isSpeakingEnabled && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    updateSpeakingToggleButton();
    setStatus(`Speaking ${isSpeakingEnabled ? 'Enabled' : 'Disabled'}`);
}

// Update the speaking toggle button with an icon
function updateSpeakingToggleButton() {
    const speakingToggle = document.getElementById('speaking-toggle');
    if (speakingToggle) {
        speakingToggle.innerHTML = isSpeakingEnabled
            ? '<i class="fas fa-volume-up"></i> <span>On</span>'
            : '<i class="fas fa-volume-mute"></i> <span>Off</span>';

        speakingToggle.className = isSpeakingEnabled ? 'toggle on' : 'toggle off';
    }
}

// Toggle pause/resume speaking
function togglePauseSpeaking() {
    if (speechSynthesis.speaking) {
        if (speechSynthesis.paused) {
            speechSynthesis.resume();
            setStatus('🔊'); // Speaking Resumed
        } else {
            speechSynthesis.pause();
            setStatus('⏸️'); // Speaking Paused
        }
    } else {
        setStatus('⚠️'); // No active speech
    }
}

// Type response word by word with configurable speed
function typeResponse(response, callback) {
    const chatHistory = document.getElementById('chat-history');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    chatHistory.appendChild(messageDiv);

    const contentDiv = document.createElement('div');
    messageDiv.appendChild(contentDiv);

    // Add timestamp
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.appendChild(timestampDiv);

    const words = response.split(' ');
    let index = 0;

    setStatus('AI is typing...');

    const interval = setInterval(() => {
        if (index < words.length) {
            contentDiv.textContent += (index > 0 ? ' ' : '') + words[index];
            chatHistory.scrollTop = chatHistory.scrollHeight;
            index++;
        } else {
            clearInterval(interval);

            // Apply formatting after typing is complete
            contentDiv.innerHTML = formatMessage(contentDiv.textContent);

            setStatus('');
            if (callback) callback();
        }
    }, typingSpeed);
}

// Improved speech synthesis with better voice selection and error handling
function speakText(text) {
    if (!speechSynthesis || !isSpeakingEnabled) return;
    speakTextWithFemaleVoice(text);
}

// Function specifically for speaking with a female voice when Listen button is clicked
function speakTextWithFemaleVoice(text) {
    if (!speechSynthesis) return;

    try {
        // Cancel any ongoing speech
        speechSynthesis.cancel();

        // Create utterance with lady-like voice settings
        currentUtterance = new SpeechSynthesisUtterance(text);

        // Try to use a female voice
        if (selectedVoice) {
            currentUtterance.voice = selectedVoice;
        }

        // Female voice characteristics
        currentUtterance.lang = 'en-US';
        currentUtterance.rate = 0.95;    // Slightly slower for clarity
        currentUtterance.pitch = 1.2;    // Higher pitch for female-like voice
        currentUtterance.volume = 1.0;   // Full volume

        // Speech events
        currentUtterance.onstart = () => setStatus('Speaking...');
        currentUtterance.onend = () => {
            setStatus('');
            currentUtterance = null;
        };
        currentUtterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            setStatus('Speech error occurred');
            currentUtterance = null;
        };

        // Start speaking
        speechSynthesis.speak(currentUtterance);
    } catch (error) {
        console.error('Speech synthesis error:', error);
        setStatus('Speech functionality unavailable');
    }
}

// Word-by-word animation for welcome text
document.addEventListener('DOMContentLoaded', function () {
    const welcomeContainer = document.getElementById('animated-welcome');
    const welcomeText = "Welcome to Nikhil Intelligence";
    const words = welcomeText.split(' ');
    const animationDelay = 300; // Delay between words (milliseconds)

    // Clear existing content
    welcomeContainer.innerHTML = '';

    // Create span for each word and append to the container
    words.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'animated-word';
        wordSpan.textContent = word;

        // Add space between words (except last one)
        if (index < words.length - 1) {
            wordSpan.innerHTML += '&nbsp;';
        }

        welcomeContainer.appendChild(wordSpan);
    });

    // Animate words with delay
    const animatedWords = document.querySelectorAll('.animated-word');
    animatedWords.forEach((word, index) => {
        setTimeout(() => {
            word.classList.add('visible');
        }, animationDelay * index);
    });
});

// Add some CSS for the listen button
const style = document.createElement('style');
style.textContent = `
.listen-button {
    position: absolute;
    right: 8px;
    bottom: 8px;
    background-color: rgba(17, 20, 20, 0.2);
    border: none;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    opacity: 0.7;
}

.listen-button:hover {
    background-color: rgba(20, 24, 144, 0.5);
    opacity: 1;
}

.bot-message {
    position: relative;
    padding-bottom: 24px;
}

/* Additional CSS for better UI */
.message {
    margin: 10px;
    padding: 10px;
    
    border-radius: 10px;
    max-width: 100%;
    word-wrap: break-word;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.user-message {
    background-color:rgb(217, 227, 234);
    color: black;
    align-self: flex-end;
}

.bot-message {
    background-color:rgb(224, 236, 236);
    color: #333333;
    align-self: flex-start;
}

.message-timestamp {
    font-size: 0.8em;
    color: #666;
    margin-top: 5px;
}

.thinking-indicator {
    display: flex;
    justify-content: center;
    align-items: center;
}

.thinking-indicator .dot {
    width: 8px;
    height: 8px;
    margin: 0 4px;
    background-color: #007bff;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out;
}

.thinking-indicator .dot:nth-child(2) {
    animation-delay: 0.2s;
}

.thinking-indicator .dot:nth-child(3) {
    animation-delay: 0.4s;
}

@keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
}
`;

document.head.appendChild(style);