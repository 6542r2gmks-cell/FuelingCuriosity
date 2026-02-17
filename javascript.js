// --- Game State Management ---
const gameState = {
    phase: 1,
    product: null,
    clicks: 0,
    minigameComplete: false,
    tempInterval: null
};

// Elements
const screens = document.querySelectorAll('.screen');

// --- Navigation Helpers ---
function showPhase(phaseNum) {
    screens.forEach(screen => {
        screen.classList.remove('active');
        setTimeout(() => screen.classList.add('hidden'), 500); // Wait for fade out
    });
    
    setTimeout(() => {
        const nextScreen = document.getElementById(`phase-${phaseNum}`) || document.getElementById('finale');
        nextScreen.classList.remove('hidden');
        // Small delay to allow display block to apply before changing opacity
        setTimeout(() => nextScreen.classList.add('active'), 50);
    }, 500);
}

// --- Phase 1: Extraction ---
const pumpBtn = document.getElementById('pump-btn');
const oilLevel = document.getElementById('oil-level');

pumpBtn.addEventListener('click', () => {
    if (gameState.clicks < 5) {
        gameState.clicks++;
        oilLevel.style.height = `${(gameState.clicks / 5) * 100}%`;
        pumpBtn.innerText = `Pump to Refinery! (${gameState.clicks}/5)`;
        
        if (gameState.clicks === 5) {
            pumpBtn.disabled = true;
            pumpBtn.innerText = "Tank Full!";
            setTimeout(() => showPhase(2), 1000);
        }
    }
});

// --- Phase 2: Choosing Product ---
function chooseProduct(product) {
    gameState.product = product;
    setupMinigame();
    showPhase(3);
}

// --- Phase 3: Processing Minigames ---
function setupMinigame() {
    const container = document.getElementById('minigame-container');
    const labCheck = document.getElementById('lab-check');
    const testBtn = document.getElementById('test-btn');
    container.innerHTML = ''; // Clear previous
    labCheck.classList.add('hidden');
    gameState.minigameComplete = false;

    if (gameState.product === 'gasoline') {
        container.innerHTML = `
            <h3>The Blender</h3>
            <p>Tap both ingredients to drop them into the mixing tank!</p>
            <span class="ingredient" id="ing-1" onclick="addIngredient('ing-1')">💧 Boost</span>
            <span class="ingredient" id="ing-2" onclick="addIngredient('ing-2')">✨ Cleaner</span>
            <div class="mixing-tank" id="mix-tank"></div>
        `;
        testBtn.innerText = "Run Test 🧪";
        testBtn.onclick = () => runLabTest("green", "Gasoline is pure and ready!");

    } else if (gameState.product === 'jetfuel') {
        container.innerHTML = `
            <h3>The Purifier</h3>
            <p>Tap the floating impurities to clean the fuel!</p>
            <div class="fuel-box" id="fuel-box"></div>
        `;
        // Spawn 5 impurities
        for (let i = 0; i < 5; i++) {
            let dot = document.createElement('span');
            dot.className = 'impurity';
            dot.innerText = '🦠';
            dot.style.top = Math.random() * 150 + 'px';
            dot.style.left = Math.random() * 150 + 'px';
            dot.onclick = function() {
                this.remove();
                checkImpurities();
            };
            document.getElementById('fuel-box').appendChild(dot);
        }
        testBtn.innerText = "Freeze Test ❄️";
        testBtn.onclick = () => runLabTest("#bbdefb", "Won't freeze in the sky!");

    } else if (gameState.product === 'asphalt') {
        container.innerHTML = `
            <h3>The Heater</h3>
            <p>Hold the button to keep the temperature in the GREEN zone for 3 seconds!</p>
            <div class="temp-gauge">
                <div class="temp-target"></div>
                <div class="temp-fill" id="temp-fill"></div>
            </div>
            <button class="btn" id="heat-btn" style="width: 80%;">🔥 Hold to Heat</button>
            <p>Time in zone: <span id="time-in-zone">0</span>s</p>
        `;
        setupAsphaltGame();
        testBtn.innerText = "Stretch Test 🛣️";
        testBtn.onclick = () => runLabTest("#795548", "Flexible and strong!");
    }
}

// Gasoline Minigame Logic
let ingredientsAdded = 0;
function addIngredient(id) {
    document.getElementById(id).style.visibility = 'hidden';
    document.getElementById('mix-tank').innerText += document.getElementById(id).innerText.split(' ')[0]; // just emoji
    ingredientsAdded++;
    if (ingredientsAdded === 2) {
        document.getElementById('lab-check').classList.remove('hidden');
    }
}

// Jet Fuel Minigame Logic
function checkImpurities() {
    const remaining = document.querySelectorAll('.impurity').length;
    if (remaining === 0) {
        document.getElementById('fuel-box').style.background = '#e0f2fe'; // Make it look clear
        document.getElementById('lab-check').classList.remove('hidden');
    }
}

// Asphalt Minigame Logic
function setupAsphaltGame() {
    let temp = 0;
    let timeInZone = 0;
    let isHeating = false;
    const fill = document.getElementById('temp-fill');
    const heatBtn = document.getElementById('heat-btn');
    const timeDisplay = document.getElementById('time-in-zone');

    // Mobile & Desktop event listeners
    heatBtn.addEventListener('mousedown', () => isHeating = true);
    heatBtn.addEventListener('mouseup', () => isHeating = false);
    heatBtn.addEventListener('mouseleave', () => isHeating = false);
    heatBtn.addEventListener('touchstart', (e) => { e.preventDefault(); isHeating = true; });
    heatBtn.addEventListener('touchend', () => isHeating = false);

    gameState.tempInterval = setInterval(() => {
        if (gameState.minigameComplete) return;

        if (isHeating) temp += 2;
        else temp -= 1.5;

        // Clamp temp between 0 and 100
        if (temp < 0) temp = 0;
        if (temp > 100) temp = 100;
        
        fill.style.height = `${temp}%`;

        // Check if in target zone (40% to 60%)
        if (temp >= 40 && temp <= 60) {
            timeInZone += 0.1; 
            timeDisplay.innerText = Math.floor(timeInZone);
            if (timeInZone >= 3) {
                clearInterval(gameState.tempInterval);
                gameState.minigameComplete = true;
                heatBtn.disabled = true;
                document.getElementById('lab-check').classList.remove('hidden');
            }
        } else {
            timeInZone = 0; // Reset if they fall out of zone
            timeDisplay.innerText = "0";
        }
    }, 100);
}

// Generic Lab Test
function runLabTest(colorCode, successMessage) {
    document.getElementById('test-btn').disabled = true;
    const container = document.getElementById('test-progress-container');
    const bar = document.getElementById('test-progress');
    const result = document.getElementById('test-result');
    
    container.classList.remove('hidden');
    
    // Simulate loading bar
    let width = 0;
    let loadInterval = setInterval(() => {
        width += 10;
        bar.style.width = width + '%';
        if (width >= 100) {
            clearInterval(loadInterval);
            result.classList.remove('hidden');
            result.innerText = `PASS! ✅ ${successMessage}`;
            setTimeout(() => setupPhase4(), 1500);
        }
    }, 150);
}

// --- Phase 4: Logistics ---
function setupPhase4() {
    showPhase(4);
    const display = document.getElementById('product-display');
    if (gameState.product === 'gasoline') display.innerText = '🚗 Gasoline';
    if (gameState.product === 'jetfuel') display.innerText = '✈️ Jet Fuel';
    if (gameState.product === 'asphalt') display.innerText = '🛣️ Asphalt';
}

function checkTransport(transport) {
    const feedback = document.getElementById('transport-feedback');
    let isCorrect = false;
    let finalMsg = '';

    if (gameState.product === 'gasoline' && transport === 'truck') {
        isCorrect = true;
        finalMsg = "Gasoline loaded into Tanker Truck -> Driving to Gas Station -> Family Car is fueled!";
    } else if (gameState.product === 'jetfuel' && transport === 'pipeline') {
        isCorrect = true;
        finalMsg = "Jet Fuel flowing through Pipeline -> Reaches Airport -> Jumbo Jet is fueled!";
    } else if (gameState.product === 'asphalt' && transport === 'dumptruck') {
        isCorrect = true;
        finalMsg = "Asphalt loaded into Heated Truck -> Driven to Construction Site -> New Road Paved!";
    }

    if (isCorrect) {
        document.getElementById('finale-message').innerText = finalMsg;
        showPhase('finale'); // 'finale' is the ID
        triggerConfetti();
    } else {
        feedback.innerText = "Oops! That's not the right transport for this product. Try again!";
        setTimeout(() => feedback.innerText = "", 2000);
    }
}

// --- Finale & Reset ---
function resetGame() {
    gameState.phase = 1;
    gameState.product = null;
    gameState.clicks = 0;
    ingredientsAdded = 0;
    clearInterval(gameState.tempInterval);
    
    // Reset UI
    document.getElementById('oil-level').style.height = '0%';
    document.getElementById('pump-btn').disabled = false;
    document.getElementById('pump-btn').innerText = "Pump to Refinery! (0/5)";
    document.getElementById('test-progress-container').classList.add('hidden');
    document.getElementById('test-progress').style.width = '0%';
    document.getElementById('test-result').classList.add('hidden');
    document.getElementById('test-btn').disabled = false;
    document.getElementById('transport-feedback').innerText = "";
    
    // Clear canvas
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    showPhase(1);
}

// Simple Confetti Function
function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = document.getElementById('game-container').offsetWidth;
    canvas.height = document.getElementById('game-container').offsetHeight;

    const pieces = [];
    for (let i = 0; i < 100; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 10 + 5,
            h: Math.random() * 10 + 5,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            vy: Math.random() * 3 + 2
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let active = false;
        pieces.forEach(p => {
            p.y += p.vy;
            if (p.y < canvas.height) active = true;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
        });
        if (active && document.getElementById('finale').classList.contains('active')) {
            requestAnimationFrame(draw);
        }
    }
    draw();
}
