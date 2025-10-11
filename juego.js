// Variables de configuración del juego
let GAME_DURATION;
let SCORE_CORRECT;
let SCORE_INCORRECT;
let FALL_SPEED;
let WORD_CREATION_INTERVAL;
let GAME_DATA;

// --- Configuración de la API ---
const API_CONFIG = {
    BASE_URL: 'https://puramentebackend.onrender.com/api/gamedata/game/7/category/ciencias'
};

// =========================================================
// 1. ESTADO DEL JUEGO Y VARIABLES GLOBALES
// =========================================================
const state = {
    score: 0,
    timeLeft: 0,
    isRunning: false,
    isPaused: false,
    timerInterval: null,
    animationFrame: null, 
    draggedItem: null, 
    touchItem: null, 
    currentWords: [], 
    availableWords: [], 
    categories: [],
    targetCategory: null, 
    dropZoneRect: null, 
};

// Instancias de la API de Audio
const sound = {
    // Música de fondo (durante la partida)
    music: new Audio('./src/gamer-music.mp3'),
    // Ganar puntos (acierto)
    correct: new Audio('./src/Acertar.mp3'),
    // Perder puntos/Caída (error/penalización)
    incorrect: new Audio('./src/error.mp3'),
    // Ganar el juego (victoria)
    win: new Audio('./src/gano.mp3'),
    // Perder el juego (derrota/tiempo agotado)
    lose: new Audio('./src/Perdio.mp3'),
};

// Configuración de la música
sound.music.loop = true; // La música se repite durante la partida
sound.music.volume = 0.4; // Volumen un poco más bajo

// Función de utilidad para reproducir FX (efectos de sonido)
function playSoundFX(audioElement) {
    audioElement.currentTime = 0; // Reinicia el sonido FX si ya se estaba reproduciendo
    audioElement.volume = 1.0;
    // Usamos .catch para manejar posibles errores de reproducción en el navegador
    audioElement.play().catch(e => console.log("Error al reproducir sonido FX:", e)); 
}


// =========================================================
// 2. FUNCIONES PARA CARGAR DATOS DE LA API
// =========================================================

function showLoadingMessage(message) {
    // Crear o actualizar mensaje de carga
    let loadingElement = document.getElementById('loading-message');
    if (!loadingElement) {
        loadingElement = document.createElement('div');
        loadingElement.id = 'loading-message';
        loadingElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 10000;
            text-align: center;
        `;
        document.body.appendChild(loadingElement);
    }
    loadingElement.textContent = message;
    loadingElement.style.display = 'block';
}

function hideLoadingMessage() {
    const loadingElement = document.getElementById('loading-message');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

async function loadGameDataFromAPI() {
    const response = await fetch(API_CONFIG.BASE_URL);
    const apiData = await response.json();
    
    // Transformar la estructura de la API al formato que usa el juego
    const gameTopics = {};
    
    apiData.data.forEach(item => {
        // Extraer los datos de cada subcategoría
        Object.keys(item.gamedata).forEach(subject => {
            gameTopics[subject] = item.gamedata[subject];
        });
    });
    
    return gameTopics;
}

// --- Función principal para cargar datos del juego ---
async function loadGameData() {
    const gameData = await loadGameDataFromAPI();
    return gameData;
}

// =========================================================
// 3. FUNCIONES PARA ENVIAR DATOS AL API
// =========================================================

// --- Función para extraer user_id de la URL ---
function getUserIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('user_id');
    return userId ? parseInt(userId) : null;
}

// --- Función para mostrar indicador de envío de datos ---


// --- Función para ocultar indicador de envío de datos ---
function hideDataSendingIndicator() {
    hideLoadingMessage();
}

// --- Función para actualizar texto del indicador ---
function updateLoadingText(message) {
    const loadingElement = document.getElementById('loading-message');
    if (loadingElement) {
        loadingElement.textContent = message;
    }
}

// --- Función para guardar datos del juego ---
function saveGameData(data) {
    // Verificar que exista user_id antes de proceder
    if (!data.user_id) {
        console.log('No hay user_id disponible. No se enviarán datos al servidor.');
        return;
    }
    
    console.log("Datos del juego guardados:", JSON.stringify(data, null, 2));
    
    // Guardar en localStorage como respaldo
    localStorage.setItem('lastGameData', JSON.stringify(data));
    
    
    
    // Enviar datos a la API
    fetch('https://puramentebackend.onrender.com/api/game-attempts/from-game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        console.log('Datos enviados exitosamente:', data);
    })
    .catch(error => {
        console.error('Error enviando datos:', error); // Ocultar después de 3 segundos
    });
    
    return data; // Retorna los datos para que puedas usarlos si necesitas
}

// =========================================================
// 4. SELECCIÓN DE ELEMENTOS DEL DOM
// =========================================================
const dropZone = document.getElementById('drop-zone');
const classificationContainer = document.getElementById('classification-container');
const scoreDisplay = document.getElementById('score-display');
const timerDisplay = document.getElementById('timer-display');
const startScreen = document.getElementById('start-screen');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const finalScore = document.getElementById('final-score');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const endIcon = document.getElementById('end-icon');
const pauseButton = document.getElementById('pause-button');
const homeButton = document.getElementById('home-button');
const startTimeDisplay = document.getElementById('start-time-display');
const startRecordDisplay = document.getElementById('start-record-display');

let wordCreationTimeout;

// =========================================================
// 5. FUNCIONES DE LÓGICA DEL JUEGO
// =========================================================

function initializeWords() {
    state.availableWords = [];
    for (const category in GAME_DATA) {
        GAME_DATA[category].forEach(word => {
            state.availableWords.push({ word: word, category: category });
        });
    }
    state.availableWords.sort(() => Math.random() - 0.5);
    state.dropZoneRect = dropZone.getBoundingClientRect();
}

function updateScore(points) {
    state.score += points;
    scoreDisplay.textContent = `Puntos: ${state.score}`;
    showFeedback(points);
}

function showFeedback(points) {
    const feedback = document.createElement('div');
    feedback.classList.add('feedback');
    feedback.textContent = points > 0 ? `+${points}` : `${points}`;
    feedback.classList.add(points > 0 ? 'correct' : 'incorrect');

    const x = dropZone.offsetWidth / 2;
    const y = dropZone.offsetHeight * 0.8;
    feedback.style.left = `${x}px`;
    feedback.style.top = `${y}px`;
    feedback.style.transform = `translateX(-50%)`;
    
    dropZone.appendChild(feedback);

    setTimeout(() => {
        feedback.style.opacity = '1';
        feedback.style.transform = 'translate(-50%, -40px) scale(1.2)'; 
    }, 10); 

    setTimeout(() => {
        feedback.style.opacity = '0';
        try { dropZone.removeChild(feedback); } catch (e) {}
    }, 500);
}

function startTimer() {
    if (!state.isRunning || state.isPaused) return;

    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        timerDisplay.textContent = `Tiempo: ${state.timeLeft}s`;

        if (state.timeLeft <= 0) {
            endGame(true);
        }
    }, 1000);
}

function stopTimerAndAnimation() {
    clearInterval(state.timerInterval);
    cancelAnimationFrame(state.animationFrame);
}

function createNewWord() {
    if (!state.isRunning || state.isPaused) return;

    if (state.availableWords.length === 0) {
        return;
    }

    const itemData = state.availableWords.shift();
    
    const wordElement = document.createElement('div');
    wordElement.classList.add('draggable-word');
    wordElement.textContent = itemData.word;
    wordElement.dataset.correctCategory = itemData.category; 
    wordElement.setAttribute('draggable', true);
    
    // NOTA: wordWidth ajustado a 90px para mejor responsividad móvil
    const wordWidth = 90;
    const xPos = Math.random() * (dropZone.offsetWidth - wordWidth);
    wordElement.style.left = `${Math.max(10, xPos)}px`;
    wordElement.style.top = `0px`;

    dropZone.appendChild(wordElement);
    state.currentWords.push(wordElement);
    
    wordElement.addEventListener('dragstart', handleDragStart);
    wordElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    wordElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    wordElement.addEventListener('touchend', handleTouchEnd);

    wordCreationTimeout = setTimeout(createNewWord, WORD_CREATION_INTERVAL); 
}

function gameLoop() {
    if (!state.isRunning || state.isPaused) {
        state.animationFrame = requestAnimationFrame(gameLoop); 
        return;
    }

    const dropZoneRect = dropZone.getBoundingClientRect();
    const lossLimit = dropZoneRect.height - 10; 
    const wordsToProcess = [...state.currentWords]; 

    wordsToProcess.forEach(wordElement => {
        if (wordElement === state.draggedItem || wordElement === state.touchItem) return;

        let currentTop = parseFloat(wordElement.style.top);
        let newTop = currentTop + FALL_SPEED;
        // NOTA: wordHeight ajustado a 45px para mejor responsividad móvil
        const wordHeight = 45; 
        
        if (newTop + wordHeight > lossLimit) {
            handleValidationAndCleanup('PENALTY', wordElement); 
            return;
        }

        wordElement.style.top = `${newTop}px`;
    });
    
    state.animationFrame = requestAnimationFrame(gameLoop);
    
    if (state.currentWords.length === 0 && state.availableWords.length === 0 && !state.draggedItem && !state.touchItem) {
        endGame(false);
    }
}

function renderClassificationBoxes() {
    classificationContainer.innerHTML = ''; 
    state.categories.forEach(category => {
        const box = document.createElement('div');
        box.classList.add('classification-box');
        box.dataset.category = category; 
        box.innerHTML = `<span>${category}</span>`;
        
        box.addEventListener('dragover', handleDragOver);
        box.addEventListener('dragleave', handleDragLeave);
        box.addEventListener('drop', handleDrop);

        classificationContainer.appendChild(box);
    });
}

function endGame(isTimeUp) {
    if (!state.isRunning) return; 

    state.isRunning = false;
    state.isPaused = false;
    stopTimerAndAnimation();
    clearTimeout(wordCreationTimeout);

    // Detener música de fondo
    sound.music.pause();

    state.currentWords.forEach(word => word.remove());
    state.currentWords = [];
    
    pauseButton.textContent = 'PAUSAR';
    dropZone.style.opacity = 1; 
    dropZone.style.pointerEvents = 'auto'; 

    endScreen.classList.remove('hidden');
    finalScore.textContent = `Puntuación Final: ${state.score}`;
    
    endTitle.classList.remove('text-green-400', 'text-red-400', 'text-yellow-400');
    endIcon.textContent = ' ';

    // Decidir si es victoria o derrota y reproducir el sonido
    const maxWords = Object.values(GAME_DATA).flat().length;
    const requiredScore = Math.floor(maxWords / 2) * SCORE_CORRECT; 
    
    if (state.score >= requiredScore && !isTimeUp) {
        endTitle.textContent = "¡Victoria Impecable!";
        endTitle.classList.add('text-green-400');
        endIcon.textContent = '🏅';
        playSoundFX(sound.win); // Sonido de victoria
    } else {
        if (isTimeUp) {
            endTitle.textContent = "¡Tiempo Agotado!";
            endTitle.classList.add('text-red-400');
            endIcon.textContent = '⌛';
        } else {
            endTitle.textContent = "¡Buen Intento, sigue practicando!";
            endTitle.classList.add('text-yellow-400');
            endIcon.textContent = '📚';
        }
        playSoundFX(sound.lose); // Sonido de derrota
    }

    document.getElementById('game-container').classList.add('hidden');
    
    // --- Enviar datos al API ---
    // Extraer user_id de la URL
    const userId = getUserIdFromURL();
    
    if (userId) {
        // Calcular tiempo transcurrido
        const totalTime = GAME_DURATION - state.timeLeft;
        
        // Los puntos obtenidos (solo puntos positivos)
        const correctChallenges = Math.max(0, state.score);
        
        // Total de puntos que podía obtener si acertaba todas
        const maxWords = Object.values(GAME_DATA).flat().length;
        const totalChallenges = maxWords * SCORE_CORRECT;
        
        const gameData = {
            user_id: userId,
            game_id: 7,
            correct_challenges: correctChallenges,
            total_challenges: totalChallenges,
            time_spent: totalTime
        };

        saveGameData(gameData);
    } else {
        console.log('No se encontró user_id en la URL. No se enviarán datos al servidor.');
    }
}

function handleValidationAndCleanup(droppedCategory, item) {
    if (state.isPaused) return; 

    let points;
    if (droppedCategory && droppedCategory !== 'PENALTY') {
        points = item.dataset.correctCategory === droppedCategory ? SCORE_CORRECT : SCORE_INCORRECT;
    } else {
        // Penalización por caer o soltar en el dropZone (fuera de las cajas)
        points = SCORE_INCORRECT; 
    }
    
    // Reproducir sonido de acierto o error
    if (points > 0) {
        playSoundFX(sound.correct);
    } else {
        playSoundFX(sound.incorrect);
    }
    
    updateScore(points);

    const index = state.currentWords.indexOf(item);
    if (index > -1) {
        state.currentWords.splice(index, 1);
    }
    item.remove();
}

function pauseGame() {
    if (!state.isRunning || state.isPaused) return;

    state.isPaused = true;
    stopTimerAndAnimation();
    clearTimeout(wordCreationTimeout);

    // Pausar música
    sound.music.pause(); 

    pauseButton.textContent = 'REANUDAR';
    dropZone.style.opacity = 0.5; 
    dropZone.style.pointerEvents = 'none';
}

function resumeGame() {
    if (!state.isRunning || !state.isPaused) return;
    
    state.isPaused = false;

    // Reanudar música
    sound.music.play().catch(e => console.log("Música no pudo reanudar: " + e)); 

    startTimer();
    createNewWord();
    gameLoop();
    
    pauseButton.textContent = 'PAUSAR';
    dropZone.style.opacity = 1;
    dropZone.style.pointerEvents = 'auto';
}

function goToStartScreen() {
    state.isRunning = false;
    state.isPaused = false;
    stopTimerAndAnimation();
    clearTimeout(wordCreationTimeout);
    
    // Detener música si está sonando
    sound.music.pause();
    
    state.currentWords.forEach(word => word.remove());
    state.currentWords = [];
    
    document.getElementById('game-container').classList.add('hidden');
    endScreen.classList.add('hidden');

    pauseButton.textContent = 'PAUSAR';
    dropZone.style.opacity = 1;
    dropZone.style.pointerEvents = 'auto';

    startScreen.classList.remove('hidden');
}


// =========================================================
// 7. MANEJO DE EVENTOS DRAG & DROP (Escritorio)
// =========================================================

function handleDragStart(e) {
    if (state.isPaused) { e.preventDefault(); return; }
    state.draggedItem = this;
    setTimeout(() => this.classList.add('dragging'), 0); 
    e.dataTransfer.setData('text/plain', 'dragged'); 
}

function handleDragOver(e) {
    e.preventDefault(); 
    if (state.isPaused) return;
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    if (state.isPaused || !state.draggedItem) return;

    const droppedCategory = this.dataset.category;
    handleValidationAndCleanup(droppedCategory, state.draggedItem);

    state.draggedItem = null;
}

dropZone.addEventListener('dragover', (e) => e.preventDefault());
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (state.isPaused || !state.draggedItem) return;
    
    handleValidationAndCleanup(null, state.draggedItem);

    state.draggedItem = null;
});


// =========================================================
// 8. MANEJO DE EVENTOS TÁCTILES (Móvil)
// =========================================================

function handleTouchStart(e) {
    if (state.isPaused) { e.preventDefault(); return; }
    if (this.classList.contains('dragging')) return;

    e.preventDefault(); 
    
    state.touchItem = this;
    state.touchItem.classList.add('dragging');
    
    const touch = e.touches[0];

    const rect = state.touchItem.getBoundingClientRect();
    state.touchItem.dataset.offsetX = touch.clientX - rect.left;
    state.touchItem.dataset.offsetY = touch.clientY - rect.top;
    state.touchItem.dataset.potentialDrop = ''; 
}

function handleTouchMove(e) {
    e.preventDefault(); 
    if (!state.touchItem || state.isPaused) return;

    state.dropZoneRect = dropZone.getBoundingClientRect();

    const touch = e.touches[0];
    
    const newX = touch.clientX - state.dropZoneRect.left - parseFloat(state.touchItem.dataset.offsetX);
    const newY = touch.clientY - state.dropZoneRect.top - parseFloat(state.touchItem.dataset.offsetY);
    
    state.touchItem.style.left = `${newX}px`;
    state.touchItem.style.top = `${newY}px`;
    
    let isOverBox = false;
    document.querySelectorAll('.classification-box').forEach(box => {
        const boxRect = box.getBoundingClientRect();
        
        if (touch.clientX >= boxRect.left && touch.clientX <= boxRect.right && 
            touch.clientY >= boxRect.top && touch.clientY <= boxRect.bottom) {
            
            box.classList.add('drag-over');
            isOverBox = true;
            state.touchItem.dataset.potentialDrop = box.dataset.category;
        } else {
            box.classList.remove('drag-over');
        }
    });

    if (!isOverBox) {
        state.touchItem.dataset.potentialDrop = '';
    }
}

function handleTouchEnd(e) {
    if (!state.touchItem || state.isPaused) return;

    state.touchItem.classList.remove('dragging');
    
    document.querySelectorAll('.classification-box').forEach(box => box.classList.remove('drag-over'));

    const droppedCategory = state.touchItem.dataset.potentialDrop;
    
    handleValidationAndCleanup(droppedCategory || null, state.touchItem);

    state.touchItem = null;
}

// =========================================================
// 9. FLUJO DE INICIO Y EJECUCIÓN
// =========================================================

function startGame() {
    state.score = 0;
    state.timeLeft = GAME_DURATION;
    state.isRunning = true;
    state.isPaused = false;
    
    scoreDisplay.textContent = `Puntos: ${state.score}`;
    timerDisplay.textContent = `Tiempo: ${state.timeLeft}s`;
    
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');

    clearTimeout(wordCreationTimeout);

    initializeWords();
    
    // Iniciar Música de Fondo (requiere interacción del usuario)
    sound.music.play().catch(e => {
        console.log("Música no inició automáticamente, requiere interacción del usuario.", e);
    });

    startTimer();
    createNewWord();
    gameLoop();
}

async function init() {
    try {
        // Configuración por defecto del juego
        GAME_DURATION = 60;
        SCORE_CORRECT = 10;
        SCORE_INCORRECT = 0;
        FALL_SPEED = 1.5;
        WORD_CREATION_INTERVAL = 1500;

        // Cargar datos del juego desde la API
        try {
            GAME_DATA = await loadGameData();
        } catch (apiError) {
            console.error("Error al cargar datos desde API:", apiError);
            
            // Fallback con datos básicos
            GAME_DATA = {
                "REPTILES": ["Iguana", "Serpiente", "Cocodrilo"],
                "MAMÍFEROS": ["Perro", "Gato", "Elefante"],
                "INSECTOS": ["Mariposa", "Hormiga", "Abeja"],
                "AVES": ["Águila", "Loro", "Pato"]
            };
        }

        state.categories = Object.keys(GAME_DATA);
        startTimeDisplay.textContent = `${GAME_DURATION} Segundos`;
        startRecordDisplay.textContent = `100 Puntos`;
        
        renderClassificationBoxes();
        
        startButton.addEventListener('click', startGame);
        restartButton.addEventListener('click', startGame);
        
        pauseButton.addEventListener('click', () => {
            state.isPaused ? resumeGame() : pauseGame();
        });
        
        homeButton.addEventListener('click', goToStartScreen);

        goToStartScreen();
        
    } catch (error) {
        console.error("Error fatal en la inicialización:", error);
        alert("Error al inicializar el juego. Por favor, recarga la página.");
    }
}

// Ejecutar la función de inicialización al cargar la ventana
window.onload = init;