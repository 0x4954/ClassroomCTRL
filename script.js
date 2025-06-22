// Ensure Firebase is initialized before the main app logic runs
window.initApp = async (db, auth, userId, appId, firebaseFirestore) => {
    // DOM Elements
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const currentSessionDisplay = document.getElementById('currentSessionDisplay');
    const sessionHistoryList = document.getElementById('sessionHistoryList');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const sessionNameInput = document.getElementById('sessionNameInput');
    const sharingToggle = document.getElementById('sharingToggle');
    const userIdDisplay = document.getElementById('userIdDisplay');

    let timerInterval;
    let startTime;
    let elapsedTime = 0;
    let isRunning = false;
    let isPublicSession = false; // Default to private
    let currentSessionId = null;
    let sessionName = "Unnamed Session"; // Default session name

    // Helper function to show custom message box
    const showMessage = (message) => {
        window.showMessage(message);
    };

    // Destructure Firestore functions from the passed object
    const { doc, getDoc, setDoc, onSnapshot, collection, query, addDoc, serverTimestamp, orderBy } = firebaseFirestore;


    // Update the UI with the user ID
    userIdDisplay.textContent = `User ID: ${userId}`;

    // Function to format time for display
    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(unit => unit < 10 ? '0' + unit : unit)
            .join(':');
    }

    // Function to start the timer
    function startTimer() {
        if (isRunning) return; // Prevent multiple starts
        isRunning = true;
        startTime = Date.now() - elapsedTime; // Adjust start time for pauses
        timerInterval = setInterval(() => {
            elapsedTime = Date.now() - startTime;
            currentSessionDisplay.textContent = formatTime(elapsedTime);
        }, 1000); // Update every second
        startBtn.disabled = true; // Disable start button
        pauseBtn.disabled = false; // Enable pause button
        resetBtn.disabled = false; // Enable reset button

        // Save session start time if it's a new session
        if (!currentSessionId) {
            saveSession("started");
        }
    }

    // Function to pause the timer
    function pauseTimer() {
        if (!isRunning) return; // Only pause if running
        isRunning = false;
        clearInterval(timerInterval); // Stop the interval
        startBtn.disabled = false; // Enable start button
        pauseBtn.disabled = true; // Disable pause button
        resetBtn.disabled = false; // Enable reset button
        saveSession("paused"); // Save current state as paused
    }

    // Function to reset the timer
    function resetTimer() {
        if (currentSessionId && isRunning) {
             saveSession("ended"); // Save final state if session was active
        } else if (currentSessionId && !isRunning && elapsedTime > 0) {
             saveSession("ended"); // Save final state if paused and had time
        }

        isRunning = false;
        clearInterval(timerInterval); // Clear any running interval
        elapsedTime = 0; // Reset elapsed time
        currentSessionDisplay.textContent = "00:00:00"; // Reset display
        startBtn.disabled = false; // Enable start button
        pauseBtn.disabled = true; // Disable pause button
        resetBtn.disabled = true; // Disable reset button
        currentSessionId = null; // Clear current session ID

    }

    // Function to save session data to Firestore
    async function saveSession(status) {
        try {
            const sessionData = {
                name: sessionName,
                duration: elapsedTime,
                status: status, // 'started', 'paused', 'ended'
                timestamp: serverTimestamp(),
                userId: userId,
                isPublic: isPublicSession
            };

            const collectionRef = getSessionCollectionRef(isPublicSession);

            if (currentSessionId) {
                // Update existing session
                const sessionDocRef = doc(collectionRef, currentSessionId);
                await setDoc(sessionDocRef, sessionData, { merge: true }); // Merge to avoid overwriting other fields
                console.log(`Session ${status}: ${currentSessionId}`);
            } else {
                // Create new session
                const docRef = await addDoc(collectionRef, sessionData);
                currentSessionId = docRef.id;
                console.log(`New session ${status} with ID: ${currentSessionId}`);
            }
        } catch (e) {
            console.error("Error saving session: ", e);
            showMessage("Error saving session data.");
        }
    }

    // Determine the Firestore path based on sharing settings
    const getSessionCollectionRef = (isPublic) => {
        if (isPublic) {
            return collection(db, `artifacts/${appId}/public/data/sessions`);
        } else {
            return collection(db, `artifacts/${appId}/users/${userId}/sessions`);
        }
    };

    // Function to load and display session history
    async function loadSessionHistory() {
        try {
            sessionHistoryList.innerHTML = ''; // Clear existing list
            // Fetch both private and public sessions for the current user to display history
            // Note: For actual multi-user public display, you'd likely have a separate public sessions view.
            // Here, we just display what the current user has access to or created.

            const privateSessionsQuery = query(
                getSessionCollectionRef(false),
                // orderBy("timestamp", "desc") // Removed orderBy to avoid index issues
            );

            // Listen for real-time updates for private sessions
            onSnapshot(privateSessionsQuery, (snapshot) => {
                const privateSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Process and display only private sessions, then merge with public if needed
                renderSessionHistory(privateSessions.sort((a, b) => b.timestamp?.toDate() - a.timestamp?.toDate())); // Client-side sort
            }, (error) => {
                console.error("Error listening to private sessions: ", error);
                showMessage("Error loading private session history.");
            });

            // Listen for real-time updates for public sessions (if feature is enabled/relevant for display)
            // For simplicity, we'll assume a user only sees public sessions they created,
            // or we'd need more complex logic to show *all* public sessions globally.
            // For this app, public means *this user's* sessions are public.
            if (isPublicSession) { // Only listen to public if the setting is on for the user
                 const publicSessionsQuery = query(
                    getSessionCollectionRef(true),
                    // orderBy("timestamp", "desc") // Removed orderBy to avoid index issues
                );
                 onSnapshot(publicSessionsQuery, (snapshot) => {
                    const publicSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    // This might cause duplicate entries if a session is both private and public
                    // For this simple app, we're assuming a session is either one or the other.
                    renderSessionHistory(publicSessions.sort((a, b) => b.timestamp?.toDate() - a.timestamp?.toDate())); // Client-side sort
                }, (error) => {
                    console.error("Error listening to public sessions: ", error);
                    showMessage("Error loading public session history.");
                });
            }


        } catch (e) {
            console.error("Error loading session history: ", e);
            showMessage("Error loading session history.");
        }
    }

    // Helper to render sessions to the UI, avoiding duplicates
    function renderSessionHistory(sessions) {
        // Simple deduplication based on session ID and update existing entries
        const existingSessionIds = new Set(Array.from(sessionHistoryList.children).map(li => li.dataset.sessionId));
        const fragment = document.createDocumentFragment();

        sessions.forEach(session => {
            const formattedDuration = formatTime(session.duration || 0);
            const date = session.timestamp ? new Date(session.timestamp.toDate()).toLocaleString() : 'N/A';

            let listItem = document.querySelector(`li[data-session-id="${session.id}"]`);
            if (listItem) {
                // Update existing item
                listItem.querySelector('.session-duration').textContent = formattedDuration;
                listItem.querySelector('.session-name').textContent = session.name;
                listItem.querySelector('.session-date').textContent = date;
                listItem.querySelector('.session-status').textContent = `Status: ${session.status}`;
            } else {
                // Create new item
                listItem = document.createElement('li');
                listItem.dataset.sessionId = session.id; // Store session ID for updates

                listItem.classList.add('flex', 'flex-col', 'sm:flex-row', 'justify-between', 'items-start', 'sm:items-center', 'bg-gray-100', 'p-3', 'rounded-lg', 'shadow-sm', 'text-gray-700', 'border-l-5', 'border-indigo-500', 'mb-2', 'transition-all', 'duration-200', 'ease-in-out');

                listItem.innerHTML = `
                    <div class="session-info flex-grow">
                        <span class="session-name font-semibold text-lg">${session.name}</span>
                        <span class="text-sm text-gray-500 ml-2 session-status">Status: ${session.status}</span>
                        <p class="session-date text-xs text-gray-500">${date}</p>
                    </div>
                    <div class="flex items-center space-x-2 mt-2 sm:mt-0">
                        <span class="session-duration text-indigo-600 font-bold text-xl">${formattedDuration}</span>
                    </div>
                `;
                fragment.appendChild(listItem);
            }
        });

        // Add new items to the list at the top to reflect reverse chronological order
        sessionHistoryList.prepend(fragment);
    }


    // Event Listeners for main controls
    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Event Listeners for Settings Modal
    openSettingsBtn.addEventListener('click', () => {
        // Load current settings from potentially saved user preferences or defaults
        sessionNameInput.value = sessionName;
        sharingToggle.checked = isPublicSession;
        settingsModal.classList.remove('hidden');
        settingsModal.querySelector('.modal-content').classList.add('scale-100', 'opacity-100');
        settingsModal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.querySelector('.modal-content').classList.remove('scale-100', 'opacity-100');
        settingsModal.querySelector('.modal-content').classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            settingsModal.classList.add('hidden');
        }, 300); // Allow time for transition
    });

    saveSettingsBtn.addEventListener('click', async () => {
        sessionName = sessionNameInput.value.trim() || "Unnamed Session";
        const previousPublicState = isPublicSession;
        isPublicSession = sharingToggle.checked;

        // If sharing state changed, we might need to re-save the current session
        // or ensure future sessions use the new path.
        if (currentSessionId && previousPublicState !== isPublicSession) {
            await saveSession(isRunning ? "started" : (elapsedTime > 0 ? "paused" : "ended"));
            // Reload history to reflect potential path change (e.g., from private to public collection)
            loadSessionHistory();
        }

        // Save preferences to Firestore (e.g., in a user-specific document)
        try {
            const userPreferencesRef = doc(db, `artifacts/${appId}/users/${userId}/preferences/settings`);
            await setDoc(userPreferencesRef, {
                sessionName: sessionName,
                isPublicSession: isPublicSession,
                lastUpdated: serverTimestamp()
            }, { merge: true });
            showMessage("Settings saved successfully!");
        } catch (e) {
            console.error("Error saving preferences: ", e);
            showMessage("Error saving settings.");
        }

        settingsModal.querySelector('.modal-content').classList.remove('scale-100', 'opacity-100');
        settingsModal.querySelector('.modal-content').classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            settingsModal.classList.add('hidden');
        }, 300); // Allow time for transition
    });

    // Load user preferences on app start
    async function loadUserPreferences() {
        try {
            const userPreferencesRef = doc(db, `artifacts/${appId}/users/${userId}/preferences/settings`);
            const docSnap = await getDoc(userPreferencesRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                sessionName = data.sessionName || "Unnamed Session";
                isPublicSession = data.isPublicSession || false;
                sessionNameInput.value = sessionName;
                sharingToggle.checked = isPublicSession;
            }
        } catch (e) {
            console.error("Error loading user preferences: ", e);
            // Continue without preferences, using defaults
        }
    }

    // Initial setup
    pauseBtn.disabled = true; // Pause button is disabled initially
    resetBtn.disabled = true; // Reset button is disabled initially

    // Load preferences and then session history
    await loadUserPreferences();
    loadSessionHistory();
};
