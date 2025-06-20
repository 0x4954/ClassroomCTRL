// --- Configuration & State Management ---
// Default values if nothing is found in localStorage
const DEFAULT_SETTINGS = {
    sessionDurationMins: 25,
    breakDurationMins: 5,
    // Add default modalMessage for each checklist item
    checklistItems: [
        { id: 'slides', text: 'Open presentation slides', completed: false, modalMessage: 'Please ensure your **presentation slides** are open and ready for display.' },
        { id: 'audio', text: 'Check audio & microphone', completed: false, modalMessage: 'Verify that your **audio output and microphone** are working correctly for clear communication.' },
        { id: 'handouts', text: 'Distribute handouts (if any)', completed: false, modalMessage: 'If you have any **handouts**, please distribute them to the students now.' },
        { id: 'board', text: 'Write agenda on whiteboard', completed: false, modalMessage: 'Write today\'s session **agenda or key topics** on the whiteboard.' },
    ]
};

let appSettings = {}; // This will hold our current loaded settings

// --- DOM Elements ---
const timerDisplay = document.getElementById('timerDisplay');
const currentModeDisplay = document.getElementById('currentMode');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');
const switchToSessionBtn = document.getElementById('switchToSessionBtn');
const switchToBreakBtn = document.getElementById('switchToBreakBtn');
const extendMinutesInput = document.getElementById('extendMinutesInput');
const extendTimeBtn = document.getElementById('extendTimeBtn');
const endCurrentBtn = document.getElementById('endCurrentBtn');
const checklistItemsUl = document.getElementById('checklistItems');
const startSessionOverrideBtn = document.getElementById('startSessionOverrideBtn');

// Settings Modal Elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const defaultSessionDurationInput = document.getElementById('defaultSessionDuration');
const defaultBreakDurationInput = document.getElementById('defaultBreakDuration');
const editableChecklistItemsUl = document.getElementById('editableChecklistItems');
const newChecklistItemText = document.getElementById('newChecklistItemText');
const addChecklistItemBtn = document.getElementById('addChecklistItemBtn');

// Generic Message Modal Elements
const messageModal = document.getElementById('messageModal');
const messageModalTitle = document.getElementById('messageModalTitle');
const messageModalContent = document.getElementById('messageModalContent');
const messageModalConfirmBtn = document.getElementById('messageModalConfirmBtn');
let messageModalCallback = null; // Function to execute when modal is confirmed


// --- State Variables ---
let currentMode = 'ready'; // 'ready', 'session', 'break'
let timeLeft = 0; // in seconds
let timerInterval;
let isPaused = false;
let checklistInProgress = false; // Flag to indicate if checklist modal sequence is active

// --- Helper Functions ---
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// --- Local Storage Functions ---
function loadSettings() {
    const storedSettings = localStorage.getItem('classroomAppSettings');
    if (storedSettings) {
        appSettings = JSON.parse(storedSettings);
        // Merge with defaults to ensure new properties are added
        appSettings = { ...DEFAULT_SETTINGS, ...appSettings };
        // Ensure checklist items have modalMessage, add if missing or update default
        appSettings.checklistItems = appSettings.checklistItems.map(item => ({
            ...item,
            modalMessage: item.modalMessage || `Please confirm you have completed "**${item.text}**".`
        }));

    } else {
        appSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); // Deep copy defaults
    }
    // For checklist on main display, ensure 'completed' status is reset when loaded for a new session
    appSettings.checklistItems.forEach(item => item.completed = false);
    console.log('Settings loaded:', appSettings);
}

function saveSettings() {
    localStorage.setItem('classroomAppSettings', JSON.stringify(appSettings));
    console.log('Settings saved:', appSettings);
}

// --- Generic Message Modal Functions ---
function showMessageModal(title, message, callback = null, buttonText = "OK") {
    messageModalTitle.innerHTML = title; // Use innerHTML to allow bold tags
    messageModalContent.innerHTML = message; // Use innerHTML to allow bold tags
    messageModalConfirmBtn.textContent = buttonText;
    messageModalCallback = callback;
    messageModal.classList.add('show');
}

function hideMessageModal() {
    messageModal.classList.remove('show');
    messageModalCallback = null; // Clear callback
}

// --- Checklist Management (Main Display) ---
function renderChecklist(checklistData) {
    checklistItemsUl.innerHTML = ''; // Clear existing items
    checklistData.forEach(item => {
        const li = document.createElement('li');
        li.className = `checklist-item ${item.completed ? 'completed' : ''}`;
        li.dataset.id = item.id; // Store ID for easy lookup

        // The checkbox is only visual, actual completion is via modal
        li.innerHTML = `
            <label>
                <input type="checkbox" class="checklist-checkbox" ${item.completed ? 'checked' : ''} disabled>
                <span class="checkmark"></span>
                ${item.text}
            </label>
        `;
        checklistItemsUl.appendChild(li);
    });
    checkPreSessionReadiness();
}

function areAllChecklistItemsCompleted() {
    return appSettings.checklistItems.every(item => item.completed);
}

function checkPreSessionReadiness() {
    if (currentMode === 'ready' && !areAllChecklistItemsCompleted()) {
        startSessionOverrideBtn.style.display = 'inline-block';
        startButton.disabled = false; // Start button is always enabled to start checklist
        startButton.textContent = 'Start Session'; // Text changed to imply checklist first
        startButton.classList.remove('primary');
        startButton.classList.add('btn');
    } else {
        startSessionOverrideBtn.style.display = 'none'; // No override needed if checklist is done
        startButton.disabled = false; // Ensure it's enabled if all done
        startButton.textContent = 'Start Session';
        startButton.classList.remove('btn');
        startButton.classList.add('primary');
    }
}

// --- Sequential Checklist Modal Flow ---
function triggerNextChecklistItemModal(startIndex = 0) {
    // Hide the main timer/controls while checklist is in progress
    document.querySelector('.status-display').style.display = 'none';
    document.querySelector('.controls').style.display = 'none';
    document.querySelector('.mode-switcher').style.display = 'none';
    document.querySelector('.override-controls').style.display = 'none';
    document.querySelector('.pre-session-checklist').style.display = 'block'; // Ensure checklist is visible

    checklistInProgress = true;

    // Find the first uncompleted item from startIndex
    const firstUncompletedIndex = appSettings.checklistItems.findIndex((item, index) =>
        index >= startIndex && !item.completed
    );

    if (firstUncompletedIndex !== -1) {
        const currentItem = appSettings.checklistItems[firstUncompletedIndex];

        showMessageModal(
            `Pre-Session Task: ${currentItem.text}`,
            currentItem.modalMessage,
            () => { // Callback when user confirms this item
                currentItem.completed = true; // Mark as completed
                renderChecklist(appSettings.checklistItems); // Update main display

                // Trigger next item in sequence
                triggerNextChecklistItemModal(firstUncompletedIndex + 1);
            },
            "I'm Ready / Done!"
        );
    } else {
        // All checklist items are completed
        checklistInProgress = false;
        hideMessageModal(); // Ensure modal is closed
        checkPreSessionReadiness(); // Re-enable start button, it will be primary now
        showMessageModal(
            'Checklist Complete!',
            'All pre-session tasks are completed. The class session will now begin.',
            () => {
                // Restore main display elements
                document.querySelector('.status-display').style.display = 'block';
                document.querySelector('.controls').style.display = 'block';
                document.querySelector('.mode-switcher').style.display = 'block';
                document.querySelector('.override-controls').style.display = 'block';
                // Automatically start the session timer
                setMode('session');
            },
            'Start Session' // Custom button text
        );
    }
}


// --- Timer Logic ---
function updateDisplay() {
    timerDisplay.textContent = formatTime(timeLeft);
    currentModeDisplay.textContent = currentMode === 'session' ? 'Class Session' :
                                   currentMode === 'break' ? 'Break Time' :
                                   'Ready to Start';

    if (currentMode === 'ready' || isPaused) {
        startButton.style.display = 'inline-block';
        pauseButton.style.display = 'none';
    } else {
        startButton.style.display = 'none';
        pauseButton.style.display = 'inline-block';
    }
}

function startTimer() {
    // If in ready mode and checklist isn't done, initiate the checklist flow
    if (currentMode === 'ready' && !areAllChecklistItemsCompleted() && !checklistInProgress) {
        // Hide main elements, show only checklist area and start the sequence
        triggerNextChecklistItemModal(0);
        return; // Don't start timer yet, it will be started by the checklist sequence
    }

    // This part only runs if checklist is completed OR if currentMode is already session/break
    if (timerInterval) clearInterval(timerInterval);

    isPaused = false;
    updateDisplay();

    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
        } else {
            clearInterval(timerInterval);
            timerInterval = null;
            if (currentMode === 'session') {
                showMessageModal(
                    'Session Ended!',
                    'Your class session has ended. The break time will now begin automatically.',
                    () => { // Callback after user acknowledges
                        setMode('break'); // Automatically start break
                    },
                    'OK, Start Break'
                );
            } else if (currentMode === 'break') {
                showMessageModal(
                    'Break Ended!',
                    'Break time has ended. The app is now ready for the next session.',
                    () => { // Callback after user acknowledges
                        setMode('ready'); // Return to ready state
                    },
                    'OK, Ready'
                );
            }
        }
        updateDisplay();
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    isPaused = true;
    updateDisplay();
}

function resetTimer() {
    pauseTimer();
    setMode('ready'); // Go back to 'ready' state
    timeLeft = 0;
    updateDisplay();
    // Reset checklist completed status for the next session
    appSettings.checklistItems.forEach(item => item.completed = false);
    renderChecklist(appSettings.checklistItems);
    // Restore main display elements if they were hidden by checklist flow
    document.querySelector('.status-display').style.display = 'block';
    document.querySelector('.controls').style.display = 'block';
    document.querySelector('.mode-switcher').style.display = 'block';
    document.querySelector('.override-controls').style.display = 'block';
    document.querySelector('.pre-session-checklist').style.display = 'block'; // Ensure checklist is visible
    checklistInProgress = false; // Ensure flag is reset
}

function setMode(mode) {
    currentMode = mode;
    isPaused = false; // Always unpause when switching mode
    if (mode === 'session') {
        timeLeft = appSettings.sessionDurationMins * 60;
    } else if (mode === 'break') {
        timeLeft = appSettings.breakDurationMins * 60;
    } else { // 'ready'
        timeLeft = 0;
        pauseTimer(); // Ensure timer is stopped
    }
    updateDisplay();
    // Only auto-start timer if we're moving into a session or break,
    // and not if we're just setting to 'ready'
    if (mode !== 'ready') {
        startTimer();
    }
}

// --- Teacher Override Functions ---
function extendTime() {
    const minutesToAdd = parseInt(extendMinutesInput.value);
    if (!isNaN(minutesToAdd) && minutesToAdd > 0) {
        timeLeft += minutesToAdd * 60;
        updateDisplay();
        showMessageModal('Time Extended', `Added ${minutesToAdd} minutes to the current ${currentMode} time.`);
    } else {
        showMessageModal('Invalid Input', 'Please enter a valid positive number of minutes to extend.', null, 'Got It');
    }
}

function endCurrentSegment() {
    pauseTimer(); // Stop current timer
    if (currentMode === 'session') {
        showMessageModal(
            'Session Ended Early',
            'The current session has been ended. Switching to Break Time.',
            () => { // User confirmed override
                setMode('break');
            },
            'OK, Start Break'
        );
    } else if (currentMode === 'break') {
        showMessageModal(
            'Break Ended Early',
            'The current break has been ended. Ready for the next session.',
            () => { // User confirmed override
                setMode('ready');
            },
            'OK, Ready'
        );
    } else {
        showMessageModal('No Active Segment', 'There is no active session or break to end.');
    }
}

// --- Settings UI Logic ---
function openSettings() {
    settingsModal.classList.add('show');
    // Populate settings inputs with current values
    defaultSessionDurationInput.value = appSettings.sessionDurationMins;
    defaultBreakDurationInput.value = appSettings.breakDurationMins;
    renderEditableChecklist();
}

function closeSettings() {
    settingsModal.classList.remove('show');
}

function saveCurrentSettings() {
    const newSessionDuration = parseInt(defaultSessionDurationInput.value);
    const newBreakDuration = parseInt(defaultBreakDurationInput.value);

    if (isNaN(newSessionDuration) || newSessionDuration <= 0 ||
        isNaN(newBreakDuration) || newBreakDuration <= 0) {
        showMessageModal('Invalid Settings', 'Please enter valid positive numbers for session and break durations.', null, 'Fix It');
        return;
    }

    appSettings.sessionDurationMins = newSessionDuration;
    appSettings.breakDurationMins = newBreakDuration;
    // Checklist items are managed directly via renderEditableChecklist / delete / add functions

    saveSettings(); // Save to localStorage
    showMessageModal('Settings Saved!', 'Your application settings have been successfully updated.', () => {
        closeSettings();
        // Re-render main checklist if we're in ready mode, to reflect any changes
        if (currentMode === 'ready') {
            appSettings.checklistItems.forEach(item => item.completed = false); // Reset completion status for next session
            renderChecklist(appSettings.checklistItems);
        }
    });
}

function renderEditableChecklist() {
    editableChecklistItemsUl.innerHTML = '';
    appSettings.checklistItems.forEach(item => {
        const li = document.createElement('li');
        li.dataset.id = item.id;
        li.innerHTML = `
            <span>${item.text}</span>
            <button class="delete-btn">Delete</button>
        `;
        editableChecklistItemsUl.appendChild(li);
    });
}

function addChecklistItem() {
    const newItemText = newChecklistItemText.value.trim();
    if (newItemText) {
        const newItem = {
            id: `item-${Date.now()}`, // Simple unique ID
            text: newItemText,
            completed: false, // Always start as not completed
            modalMessage: `Please confirm you have completed "**${newItemText}**".` // Default modal message with bolding
        };
        appSettings.checklistItems.push(newItem);
        newChecklistItemText.value = ''; // Clear input
        renderEditableChecklist();
        saveSettings();
        showMessageModal('Item Added', `"${newItemText}" has been added to your checklist.`);
    } else {
        showMessageModal('Input Required', 'Please enter text for the new checklist item.', null, 'OK');
    }
}

function deleteChecklistItem(id) {
    // Show a confirmation modal before deleting
    showMessageModal(
        'Confirm Deletion',
        'Are you sure you want to delete this checklist item? This cannot be undone.',
        () => { // Callback if user confirms deletion
            appSettings.checklistItems = appSettings.checklistItems.filter(item => item.id !== id);
            renderEditableChecklist();
            saveSettings();
            showMessageModal('Item Deleted', 'The checklist item has been removed.');
        },
        'Yes, Delete' // Button text for confirmation
    );
}

// --- Event Listeners ---
startButton.addEventListener('click', startTimer); // This now triggers checklist sequence or timer directly
pauseButton.addEventListener('click', pauseTimer);
resetButton.addEventListener('click', resetTimer);
switchToSessionBtn.addEventListener('click', () => {
    // Manually switching to session/break should bypass checklist
    setMode('session');
    // Ensure display elements are visible if they were hidden
    document.querySelector('.status-display').style.display = 'block';
    document.querySelector('.controls').style.display = 'block';
    document.querySelector('.mode-switcher').style.display = 'block';
    document.querySelector('.override-controls').style.display = 'block';
    document.querySelector('.pre-session-checklist').style.display = 'block';
    hideMessageModal(); // Close any open checklist modal
    checklistInProgress = false; // Reset flag
});
switchToBreakBtn.addEventListener('click', () => {
    setMode('break');
    // Ensure display elements are visible if they were hidden
    document.querySelector('.status-display').style.display = 'block';
    document.querySelector('.controls').style.display = 'block';
    document.querySelector('.mode-switcher').style.display = 'block';
    document.querySelector('.override-controls').style.display = 'block';
    document.querySelector('.pre-session-checklist').style.display = 'block';
    hideMessageModal(); // Close any open checklist modal
    checklistInProgress = false; // Reset flag
});
extendTimeBtn.addEventListener('click', extendTime);
endCurrentBtn.addEventListener('click', endCurrentSegment);

// Main checklist toggle - REMOVED direct interaction to force sequential modal flow
// The checkboxes are now purely visual feedback and disabled.
checklistItemsUl.addEventListener('change', (event) => {
    // This listener is now effectively disabled by `disabled` attribute on checkbox
    // Any attempt to click an unchecked box will do nothing.
    // Completion is solely through the modal sequence.
});

startSessionOverrideBtn.addEventListener('click', () => {
    if (currentMode === 'ready') {
        showMessageModal(
            'Override Checklist',
            'You are about to start the session without completing the checklist. Proceed?',
            () => { // User confirmed override
                // Restore main display elements
                document.querySelector('.status-display').style.display = 'block';
                document.querySelector('.controls').style.display = 'block';
                document.querySelector('.mode-switcher').style.display = 'block';
                document.querySelector('.override-controls').style.display = 'block';
                document.querySelector('.pre-session-checklist').style.display = 'block'; // Show checklist area
                hideMessageModal(); // Close override confirmation modal

                setMode('session');
                // Also mark all checklist items as completed if overridden
                appSettings.checklistItems.forEach(item => item.completed = true);
                renderChecklist(appSettings.checklistItems);
                checklistInProgress = false; // Reset flag
            },
            'Yes, Start Session'
        );
    }
});

// Settings Event Listeners
openSettingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
saveSettingsBtn.addEventListener('click', saveCurrentSettings);
addChecklistItemBtn.addEventListener('click', addChecklistItem);

editableChecklistItemsUl.addEventListener('click', (event) => {
    if (event.target.classList.contains('delete-btn')) {
        const listItem = event.target.closest('li');
        if (listItem) {
            deleteChecklistItem(listItem.dataset.id);
        }
    }
});

// Generic message modal confirm button listener
messageModalConfirmBtn.addEventListener('click', () => {
    // Execute the stored callback first
    if (messageModalCallback) {
        messageModalCallback();
    }
    // Only hide the modal if the callback didn't trigger a new modal (e.g., for checklist sequence)
    // or if the checklist sequence is not active. This prevents the modal from closing too early
    // during a multi-modal checklist flow.
    if (!checklistInProgress) {
        hideMessageModal();
    }
});


// --- Initialization ---
function initializeApp() {
    loadSettings(); // Load settings from localStorage first
    updateDisplay();
    renderChecklist(appSettings.checklistItems); // Render main checklist with loaded items
    checkPreSessionReadiness();
}

initializeApp();