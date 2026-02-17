document.addEventListener('DOMContentLoaded', () => {

    // --- Game State Management ---
    const gameState = {
        phase: 1,
        product: null,
        clicks: 0,
        minigameComplete: false,
        sulfurLeft: 5
    };

    const screens = document.querySelectorAll('.screen');

    // --- Navigation Helpers ---
    function showPhase(phaseNum) {
        screens.forEach(screen => {
            screen.classList.remove('active');
            setTimeout(() => screen.classList.add('hidden'), 400); 
        });
        
        setTimeout(() => {
            const nextScreen = document.getElementById(`phase-${phaseNum}`) || document.getElementById('finale');
            nextScreen.classList.remove('hidden');
            setTimeout(() => nextScreen.classList.add('active'), 50);
        }, 400);
    }

    // --- Phase 1: Extraction ---
    const pumpBtn = document.getElementById('pump-btn');
    const oilLevel = document.getElementById('oil-level');
    const pumpjack = document.getElementById('pumpjack');
    const tankContainer = document.querySelector('.tank-container');

    function handlePump(e) {
        if(e) e.preventDefault(); 
        
        if (gameState.clicks < 5) {
            gameState.clicks++;
            oilLevel.style.height = `${(gameState.clicks / 5) * 100}%`;
            pumpBtn.innerText = `Pump to Refinery! (${gameState.clicks}/5)`;
            
            pumpjack.classList.remove('pumping');
            void pumpjack.offsetWidth; 
            pumpjack.classList.add('pumping');
            
            if (gameState.clicks === 5) {
                pumpBtn.disabled = true;
                pumpBtn.innerText = "Tank Full!";
                setTimeout(() => showPhase(2), 1000); 
            }
        }
    }

    [pumpBtn, pumpjack, tankContainer].forEach(el => {
        if(el) {
            el.addEventListener('click', handlePump);
            el.addEventListener('touchstart', handlePump, {passive: false});
        }
    });

    // --- Phase 2: Choose Product (Distillation) ---
    window.chooseProduct = function(product) {
        gameState.product = product;
        setupSulfurGame();
        showPhase(3); 
    };

    // --- Phase 3: Cleaning (Desulfurization) ---
    function setupSulfurGame() {
        const container = document.getElementById('sulfur-container');
        const textDisplay = document.getElementById('cleaning-text');
        
        let productName = '';
        if (gameState.product === 'gasoline') productName = 'Gasoline';
        if (gameState.product === 'jetfuel') productName = 'Jet Fuel';
        if (gameState.product === 'diesel') productName = 'Diesel';
        
        textDisplay.innerHTML = `The raw <strong>${productName}</strong> has stinky sulfur! We need to clean it out before it goes to processing.`;
        
        container.innerHTML = '';
        gameState.sulfurLeft = 5;
        document.getElementById('to-processing-btn').classList.add('hidden');

        for (let i = 0; i < 5; i++) {
            let blob = document.createElement('div');
            blob.className = 'sulfur-blob interactive-element';
            blob.innerText = '🟡';
            
            blob.style.top = (Math.random() * 120 + 20) + 'px';
            blob.style.left = (Math.random() * 120 + 20) + 'px';
            
            const popSulfur = function(e) {
                if(e) e.preventDefault();
                this.innerText = '💨';
                this.style.transform = 'translateY(-100px)';
                this.style.opacity = '0';
                
                setTimeout(() => this.remove(), 500);
                
                gameState.sulfurLeft--;
                if (gameState.sulfurLeft === 0) {
                    setTimeout(() => document.getElementById('to-processing-btn').classList.remove('hidden'), 500);
                }
            };
            
            blob.addEventListener('click', popSulfur);
            blob.addEventListener('touchstart', popSulfur, {passive: false});
            container.appendChild(blob);
        }
    }

    window.startProcessing = function() {
        setupMinigame();
        showPhase(4);
    };

    // --- Phase 4: Processing Minigames ---
    let itemsAdded = 0;

    // The New Visual Liquid Blending Function
    window.addLiquid = function(btnId, color) {
        const btn = document.getElementById(btnId);
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';

        const vat = document.getElementById('gasoline-vat');
        const layer = document.createElement('div');
        layer.className = 'liquid-layer';
        layer.style.backgroundColor = color;
        vat.appendChild(layer);
        
        // Brief timeout allows the DOM to render the div before applying height (triggers the CSS animation)
        setTimeout(() => {
            layer.style.height = '25%';
        }, 50);

        itemsAdded++;
        
        if (itemsAdded === 4) {
            // Once all 4 are added, wait a second, then blend them!
            setTimeout(() => {
                const allLayers = document.querySelectorAll('.liquid-layer');
                allLayers.forEach(l => {
                    l.style.backgroundColor = '#eab308'; // Turns golden yellow
                });
                
                // Show the Lab Check button
                setTimeout(() => document.getElementById('lab-check').classList.remove('hidden'), 1200);
            }, 800);
        }
    };

    window.addDieselDrop = function() {
        const tank = document.getElementById('mix-tank');
        tank.innerText += '💧';
        itemsAdded++;
        if (itemsAdded >= 3) {
            document.getElementById('diesel-btn').classList.add('hidden');
            setTimeout(() => document.getElementById('lab-check').classList.remove('hidden'), 300);
        }
    };

    function checkImpurities() {
        const remaining = document.querySelectorAll('.impurity').length;
        if (remaining === 0) {
            document.getElementById('fuel-box').style.background = '#e0f2fe';
            document.getElementById('lab-check').classList.remove('hidden');
        }
    }

    function setupMinigame() {
        const container = document.getElementById('minigame-container');
        const labCheck = document.getElementById('lab-check');
        const testBtn = document.getElementById('test-btn');
        container.innerHTML = ''; 
        labCheck.classList.add('hidden');
        gameState.minigameComplete = false;
        itemsAdded = 0;

        if (gameState.product === 'gasoline') {
            container.innerHTML = `
                <h3>The Blender</h3>
                <p>Tap the components to pour them in and blend your gasoline!</p>
                <div class="ingredient-grid">
                    <button class="component-btn interactive-element" id="btn-naphtha" onclick="addLiquid('btn-naphtha', '#fde047')">Naphtha</button>
                    <button class="component-btn interactive-element" id="btn-butane" onclick="addLiquid('btn-butane', '#bae6fd')">Butane</button>
                    <button class="component-btn interactive-element" id="btn-reformate" onclick="addLiquid('btn-reformate', '#fca5a5')">Reformate</button>
                    <button class="component-btn interactive-element" id="btn-alkylate" onclick="addLiquid('btn-alkylate', '#d8b4fe')">Alkylate</button>
                </div>
                <div class="blend-vat" id="gasoline-vat"></div>
            `;
            testBtn.innerText = "Engine Test 🏎️";
            testBtn.onclick = () => runLabTest("Perfectly blended and ready to race!");

        } else if (gameState.product === 'jetfuel') {
            container.innerHTML = `
                <h3>The Purifier</h3>
                <p>Tap the floating impurities to clean the jet fuel!</p>
                <div class="fuel-box" id="fuel-box"></div>
            `;
            const fuelBox = document.getElementById('fuel-box');
            for (let i = 0; i < 5; i++) {
                let dot = document.createElement('span');
                dot.className = 'impurity interactive-element';
                dot.innerText = '🦠';
                dot.style.top = (Math.random() * 140 + 10) + 'px';
                dot.style.left = (Math.random() * 140 + 10) + 'px';
                
                const removeDot = function(e) {
                    if(e) e.preventDefault();
                    this.remove();
                    checkImpurities();
                };
                dot.addEventListener('click', removeDot);
                dot.addEventListener('touchstart', removeDot, {passive: false});
                fuelBox.appendChild(dot);
            }
            testBtn.innerText = "Freeze Test ❄️";
            testBtn.onclick = () => runLabTest("Clean! Won't freeze up high in the sky!");

        } else if (gameState.product === 'diesel') {
            container.innerHTML = `
                <h3>The Winterizer</h3>
                <p>Diesel gets thick in the cold! Tap to add 3 drops of Cold Flow Improver so it flows smoothly.</p>
                <div class="additive-btn interactive-element" id="diesel-btn" onclick="addDieselDrop()">➕ Add Cold Flow Improver</div>
                <div class="mixing-tank" id="mix-tank"></div>
            `;
            testBtn.innerText = "Cold Flow Test 🥶";
            testBtn.onclick = () => runLabTest("Flows perfectly, even in winter!");
        }
    }

    function runLabTest(successMessage) {
        document.getElementById('test-btn').disabled = true;
        const container = document.getElementById('test-progress-container');
        const bar = document.getElementById('test-progress');
        const result = document.getElementById('test-result');
        
        container.classList.remove('hidden');
        
        let width = 0;
        let loadInterval = setInterval(() => {
            width += 10;
            bar.style.width = width + '%';
            if (width >= 100) {
                clearInterval(loadInterval);
                result.classList.remove('hidden');
                result.innerText = `PASS! ✅ ${successMessage}`;
                setTimeout(() => {
                    showPhase(5); 
                    const display = document.getElementById('product-display');
                    if (gameState.product === 'gasoline') display.innerText = '🚗';
                    if (gameState.product === 'jetfuel') display.innerText = '✈️';
                    if (gameState.product === 'diesel') display.innerText = '🚛';
                }, 1800);
            }
        }, 100); 
    }

    // --- Phase 5: Logistics ---
    window.chooseLogistics = function(transport) {
        let finalMsg = '';

        if (transport === 'truck') {
            finalMsg = "Great choice! 🚛 Tanker Trucks are perfect for short trips. They deliver fuel directly to local gas stations and businesses in your town!";
        } else if (transport === 'pipeline') {
            finalMsg = "Awesome! 🚰 Pipelines are the hidden highways of fuel. They safely move huge amounts of liquid underground across the whole country!";
        } else if (transport === 'barge') {
            finalMsg = "Smart pick! 🚢 Barges carry massive amounts of fuel down rivers and along the coast. One barge can hold as much fuel as 100 trucks!";
        }

        document.getElementById('finale-message').innerText = finalMsg;
        showPhase('finale'); 
        
        // Wait 500ms for the screen fade transition to finish before dropping confetti
        setTimeout(triggerConfetti, 500);
    };

    window.resetGame = function() {
        gameState.phase = 1;
        gameState.product = null;
        gameState.clicks = 0;
        itemsAdded = 0;
        
        document.getElementById('oil-level').style.height = '0%';
        const pBtn = document.getElementById('pump-btn');
        pBtn.disabled = false;
        pBtn.innerText = "Pump to Refinery! (0/5)";
        document.getElementById('test-progress-container').classList.add('hidden');
        document.getElementById('test-progress').style.width = '0%';
        document.getElementById('test-result').classList.add('hidden');
        document.getElementById('test-btn').disabled = false;
        
        const canvas = document.getElementById('confetti-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        showPhase(1);
    };

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

}); // End DOMContentLoaded
