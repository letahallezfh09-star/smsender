// DOM elements
const smsForm = document.getElementById('smsForm');
const senderInput = document.getElementById('sender');
const phoneInput = document.getElementById('phone');
const messageInput = document.getElementById('message');
const senderError = document.getElementById('senderError');
const phoneError = document.getElementById('phoneError');
const messageError = document.getElementById('messageError');
const charCount = document.getElementById('charCount');
const sendButton = document.getElementById('sendButton');
const responseContainer = document.getElementById('responseContainer');
const responseText = document.getElementById('responseText');

// Phone number validation regex - Israeli numbers (972-XXXXXXXXX or 972XXXXXXXXX)
const phoneRegex = /^972-?\d{9}$/;

// Real-time phone number validation
phoneInput.addEventListener('input', function() {
    const phone = phoneInput.value.trim();
    if (phone && !phoneRegex.test(phone)) {
        phoneError.classList.remove('hidden');
        phoneInput.classList.add('error');
    } else {
        phoneError.classList.add('hidden');
        phoneInput.classList.remove('error');
    }
});

// Character count
messageInput.addEventListener('input', function() {
    const length = messageInput.value.length;
    charCount.textContent = `${length} / 612 characters`;
    
    if (length > 580) {
        charCount.classList.add('warning');
    } else {
        charCount.classList.remove('warning');
    }
});

// Form submission
smsForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const sender = senderInput.value.trim();
    const phone = phoneInput.value.trim();
    const message = messageInput.value.trim();
    
    // Clear previous errors
    senderError.classList.add('hidden');
    phoneError.classList.add('hidden');
    messageError.classList.add('hidden');
    senderInput.classList.remove('error');
    phoneInput.classList.remove('error');
    messageInput.classList.remove('error');
    
    // Validate input
    let hasError = false;
    
    if (!sender) {
        senderError.classList.remove('hidden');
        senderInput.classList.add('error');
        hasError = true;
    }
    
    if (!phoneRegex.test(phone)) {
        phoneError.classList.remove('hidden');
        phoneInput.classList.add('error');
        hasError = true;
    }
    
    if (!message) {
        messageError.classList.remove('hidden');
        messageInput.classList.add('error');
        hasError = true;
    }
    
    if (hasError) {
        return;
    }
    
    // Prepare to send
    sendButton.disabled = true;
    sendButton.innerHTML = '<span class="loading"></span>Sending...';
    responseContainer.classList.add('hidden');
    
    try {
        // Prepare API request
        const requestBody = {
            to: phone,
            message: message,
            sender: sender
        };
        
        // Call the local API endpoint
        const response = await fetch('/api/sms/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const responseData = await response.json();
        
        // Display response
        responseContainer.classList.remove('hidden');
        responseText.textContent = JSON.stringify(responseData, null, 2);
        
        if (response.ok && responseData.ok) {
            responseText.className = 'success';
            // Clear form
            smsForm.reset();
            charCount.textContent = '0 / 612 characters';
            charCount.classList.remove('warning');
        } else {
            responseText.className = 'error';
        }
        
    } catch (error) {
        // Display error
        responseContainer.classList.remove('hidden');
        responseText.textContent = `Network error: ${error.message}`;
        responseText.className = 'error';
    } finally {
        // Restore button state
        sendButton.disabled = false;
        sendButton.innerHTML = 'Send SMS';
    }
});
