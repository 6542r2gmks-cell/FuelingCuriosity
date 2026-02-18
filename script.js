document.addEventListener('DOMContentLoaded', () => {

    const gameState = {
        phase: 1,
        product: null,
        clicks: 0,
        itemsLeft: 5,
        itemsAdded: 0
    };

    const screens = document.querySelectorAll('.screen');

    window.showPhase = function(phaseId) {
        screens.forEach(screen => {
            screen.classList.remove('active');
            setTimeout(() => screen.classList.add('hidden'), 400); 
        });
        
        setTimeout(() => {
            const nextScreen = document.getElementById(`phase-${phaseId}`) || document.getElementById('finale');
            if(nextScreen) {
                nextScreen.classList.remove('hidden');
                setTimeout(() => nextScreen.classList.add('active'), 50);
            }
        }, 400);
    }

    // --- MAP JUMP ---
    window.mapJump = function(phaseId, defaultProduct = null) {
        if(defaultProduct) gameState.product = defaultProduct;
        
        // Reset minigames safely before jumping
        if(phaseId === 'desalter') setupDesalter();
        if(phaseId === '3') setupSulfurGame();
        if(phaseId === 'alky') setupAlky();
        if(phaseId === 'reformer') setupReformer();
        if(phaseId === 'vac') setupVac();
        if(phaseId === 'coker') setupCoker();
        if(phaseId === 'fcc') setupFCC();
        if(phaseId === '4') setupMinigame();
        if(phaseId === '5') {
            if(!gameState.product) gameState.product = 'gasoline';
            updateProductIcon();
        }

        showPhase(phaseId);
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
                setTimeout(() => {
                    setupDesalter();
                    showPhase('desalter');
                }, 1000); 
            }
        }
    }

    [pumpBtn, pumpjack, tankContainer].forEach(el => {
        if(el) {
            el.addEventListener('click', handlePump);
            el.addEventListener('touchstart', handlePump, {passive: false});
        }
    });

    // --- Phase 1b: Desalter ---
    window.setupDesalter = function() {
        const container = document.getElementById('desalter-container');
        container.innerHTML = '';
        gameState.itemsLeft = 6;
        document.getElementById('to-tower-btn').classList.add('hidden');

        const items = ['💧', '💧', '💧', '🧂', '🧂', '🧂'];
        items.forEach(icon => {
            let drop = document.createElement('div');
            drop.className = 'desalter-drop interactive-element';
            drop.innerText = icon;
            drop.style.top = (Math.random() * 120 + 20) + 'px';
            drop.style.left = (Math.random() * 120 + 20) + 'px';
            
            const zap = function(e) {
                if(e) e.preventDefault();
                this.innerText = '⚡'; 
                setTimeout(() => this.remove(), 400);
                gameState.itemsLeft--;
                if (gameState.itemsLeft === 0) {
                    setTimeout(() => document.getElementById('to-tower-btn').classList.remove('hidden'), 500);
                }
            };
            drop.addEventListener('click', zap);
            drop.addEventListener('touchstart', zap, {passive: false});
            container.appendChild(drop);
        });
    }

    // --- Phase 2: Distillation ---
    window.chooseProduct = function(product) {
        gameState.product = product;
        if (product === 'resid') {
            setupVac();
            showPhase('vac');
        } else {
            // Mapping for desulfurizer text
            if(product === 'gasoline') gameState.product = 'gasoline'; 
            setupSulfurGame();
            showPhase('3'); 
        }
    };

    // --- Phase 3: Sulfur ---
    window.setupSulfurGame = function() {
        const container = document.getElementById('sulfur-container');
        document.getElementById('cleaning-text').innerHTML = `The <strong>${gameState.product.toUpperCase()}</strong> has stinky sulfur! Tap to remove it!`;
        container.innerHTML = '';
        gameState.itemsLeft = 5;
        document.getElementById('to-processing-btn').classList.add('hidden');

        for (let i = 0; i < 5; i++) {
            let blob = document.createElement('div');
            blob.className = 'desalter-drop interactive-element';
            blob.innerText = '🟡';
            blob.style.top = (Math.random() * 120 + 20) + 'px';
            blob.style.left = (Math.random() * 120 + 20) + 'px';
            
            const pop = function(e) {
                if(e) e.preventDefault();
                this.innerText = '💨';
                setTimeout(() => this.remove(), 300);
                gameState.itemsLeft--;
                if (gameState.itemsLeft === 0) {
                    setTimeout(() => document.getElementById('to-processing-btn').classList.remove('hidden'), 300);
                }
            };
            blob.addEventListener('click', pop);
            blob.addEventListener('touchstart', pop, {passive: false});
            container.appendChild(blob);
        }
    }

    window.startProcessing = function() {
        if (gameState.product === 'lpg') {
            setupAlky();
            showPhase('alky');
        } else if (gameState.product === 'naphtha') {
            setupReformer();
            showPhase('reformer');
        } else {
            setupMinigame();
            showPhase('4');
        }
    };

    // --- Phase: HF Alky ---
    window.setupAlky = function() {
        const container = document.getElementById('alky-container');
        container.innerHTML = '';
        gameState.itemsLeft = 3;
        document.getElementById('alky-done-btn').classList.add('hidden');

        for(let i=0; i<3; i++) {
            let mol = document.createElement('div');
            mol.className = 'molecule interactive-element';
            mol.innerText = '🫧🫧';
            mol.style.top = (Math.random() * 120 + 20) + 'px';
            mol.style.left = (Math.random() * 120 + 20) + 'px';
            
            const combine = function(e) {
                if(e) e.preventDefault();
                this.innerText = '🟡'; 
                this.style.fontSize = '3rem';
                this.removeEventListener('click', combine);
                this.removeEventListener('touchstart', combine);
                gameState.itemsLeft--;
                if(gameState.itemsLeft === 0) {
                    document.getElementById('alky-done-btn').classList.remove('hidden');
                }
            }
            mol.addEventListener('click', combine);
            mol.addEventListener('touchstart', combine, {passive: false});
            container.appendChild(mol);
        }
    }

    // --- Phase: Reformer ---
    window.setupReformer = function() {
        const container = document.getElementById('reformer-container');
        container.innerHTML = '';
        gameState.itemsLeft = 3;
        document.getElementById('reformer-done-btn').classList.add('hidden');

        for(let i=0; i<3; i++) {
            let mol = document.createElement('div');
            mol.className = 'molecule interactive-element';
            mol.innerText = '〰️'; 
            mol.style.top = (Math.random() * 120 + 20) + 'px';
            mol.style.left = (Math.random() * 120 + 20) + 'px';
            
            const reform = function(e) {
                if(e) e.preventDefault();
                this.innerText = '⬡'; 
                this.innerHTML += '<span style="position:absolute; font-size:1rem; top:-20px; left:10px;">💦H</span>';
                this.removeEventListener('click', reform);
                this.removeEventListener('touchstart', reform);
                gameState.itemsLeft--;
                if(gameState.itemsLeft === 0) {
                    let msg = document.createElement('p');
                    msg.innerText = "Stronger Gasoline! 💪";
                    msg.style.color = "#1a365d";
                    msg.style.fontWeight = "bold";
                    container.appendChild(msg);
                    setTimeout(() => document.getElementById('reformer-done-btn').classList.remove('hidden'), 500);
                }
            }
            mol.addEventListener('click', reform);
            mol.addEventListener('touchstart', reform, {passive: false});
            container.appendChild(mol);
        }
    }

    window.routeToGasoline = function() {
        gameState.product = 'gasoline';
        setupMinigame();
        showPhase('4');
    }

    // --- Phase: Vacuum Tower ---
    window.setupVac = function() {
        const container = document.getElementById('vac-container');
        container.innerHTML = '';
        gameState.itemsLeft = 4;
        document.getElementById('vac-choices').classList.add('hidden');

        for(let i=0; i<4; i++) {
            let air = document.createElement('div');
            air.className = 'molecule interactive-element';
            air.innerText = '💨'; 
            air.style.top = (Math.random() * 120 + 20) + 'px';
            air.style.left = (Math.random() * 120 + 20) + 'px';
            
            const suckAir = function(e) {
                if(e) e.preventDefault();
                this.remove();
                gameState.itemsLeft--;
                if(gameState.itemsLeft === 0) {
                    document.getElementById('vac-choices').classList.remove('hidden');
                }
            }
            air.addEventListener('click', suckAir);
            air.addEventListener('touchstart', suckAir, {passive: false});
            container.appendChild(air);
        }
    }

    window.chooseVacPath = function(path) {
        if(path === 'vtb') {
            setupCoker();
            showPhase('coker');
        } else {
            setupFCC();
            showPhase('fcc');
        }
    }

    // --- Phase: Coker ---
    window.setupCoker = function() {
        const drum = document.getElementById('coke-drum');
        const fill = document.getElementById('coke-fill');
        document.getElementById('coker-frac').classList.add('hidden');
        fill.style.height = '0%';
        gameState.itemsLeft = 3; 
        
        // Remove old listeners to prevent bugs on reset
        drum.replaceWith(drum.cloneNode(true));
        const newDrum = document.getElementById('coke-drum');
        const newFill = document.getElementById('coke-fill');

        setTimeout(() => {
            newFill.style.height = '100%';
            const cutCoke = function(e) {
                if(e) e.preventDefault();
                if(gameState.itemsLeft > 0) {
                    gameState.itemsLeft--;
                    newFill.style.height = (gameState.itemsLeft * 33) + '%';
                    
                    // Add Flash/Shake animation
                    newFill.classList.remove('cut-flash');
                    void newFill.offsetWidth; // trigger reflow
                    newFill.classList.add('cut-flash');

                    if(gameState.itemsLeft === 0) {
                        setTimeout(() => document.getElementById('coker-frac').classList.remove('hidden'), 400);
                    }
                }
            };
            newDrum.addEventListener('click', cutCoke);
            newDrum.addEventListener('touchstart', cutCoke, {passive: false});
        }, 800);
    }

    // --- Phase: FCC ---
    window.setupFCC = function() {
        const container = document.getElementById('fcc-container');
        container.innerHTML = '';
        document.getElementById('fcc-frac').classList.add('hidden');
        gameState.itemsLeft = 3;

        for(let i=0; i<3; i++) {
            let bigMol = document.createElement('div');
            bigMol.className = 'fcc-molecule interactive-element';
            bigMol.innerText = '🟠🟠🟠'; 
            bigMol.style.top = (Math.random() * 100 + 20) + 'px';
            bigMol.style.left = (Math.random() * 100 + 20) + 'px';
            
            const crack = function(e) {
                if(e) e.preventDefault();
                this.innerText = '';
                // Exploding pieces
                for(let j=0; j<4; j++) {
                    let piece = document.createElement('span');
                    piece.innerText = '🟡';
                    piece.className = 'small-mol';
                    // Random explosion directions
                    piece.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
                    piece.style.setProperty('--dy', (Math.random() * 2 - 1).toFixed(2));
                    this.appendChild(piece);
                }
                this.removeEventListener('click', crack);
                this.removeEventListener('touchstart', crack);
                gameState.itemsLeft--;
                if(gameState.itemsLeft === 0) {
                    setTimeout(()=> document.getElementById('fcc-frac').classList.remove('hidden'), 1000);
                }
            }
            bigMol.addEventListener('click', crack);
            bigMol.addEventListener('touchstart', crack, {passive: false});
            container.appendChild(bigMol);
        }
    }

    // --- Phase 4: Blending & Processing ---
    window.addLiquid = function(btnId, color) {
        const btn = document.getElementById(btnId);
        btn.disabled = true;
        btn.style.opacity = '0.4';

        const vat = document.getElementById('gasoline-vat');
        const layer = document.createElement('div');
        layer.className = 'liquid-layer';
        layer.style.backgroundColor = color;
        vat.appendChild(layer);
        
        setTimeout(() => layer.style.height = '25%', 50);

        gameState.itemsAdded++;
        if (gameState.itemsAdded === 4) {
            setTimeout(() => {
                document.querySelectorAll('.liquid-layer').forEach(l => l.style.backgroundColor = '#eab308');
                setTimeout(() => document.getElementById('lab-check').classList.remove('hidden'), 1000);
            }, 800);
        }
    };

    window.addDieselDrop = function() {
        const tank = document.getElementById('mix-tank');
        tank.innerText += '💧';
        gameState.itemsAdded++;
        if (gameState.itemsAdded >= 3) {
            document.getElementById('diesel-btn').classList.add('hidden');
            setTimeout(() => document.getElementById('lab-check').classList.remove('hidden'), 300);
        }
    };

    window.setupMinigame = function() {
        const container = document.getElementById('minigame-container');
        const labCheck = document.getElementById('lab-check');
        const testBtn = document.getElementById('test-btn');
        const testProgressContainer = document.getElementById('test-progress-container');
        const testProgress = document.getElementById('test-progress');
        const testResult = document.getElementById('test-result');

        container.innerHTML = ''; 
        gameState.itemsAdded = 0;
        
        // STRICT UI RESET to fix map jump bug
        labCheck.classList.add('hidden');
        testProgressContainer.classList.add('hidden');
        testProgress.style.width = '0%';
        testResult.classList.add('hidden');
        testBtn.disabled = false;

        if (gameState.product === 'gasoline' || gameState.product === 'lpg' || gameState.product === 'naphtha') {
            gameState.product = 'gasoline'; // Force gasoline state if coming from lpg/naphtha
            container.innerHTML = `
                <h3>The Blender</h3>
                <p>Tap components to blend your high-octane gasoline!</p>
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
                dot.onclick = function() {
                    this.remove();
                    if (document.querySelectorAll('.impurity').length === 0) {
                        fuelBox.style.background = '#e0f2fe';
                        document.getElementById('lab-check').classList.remove('hidden');
                    }
                };
                fuelBox.appendChild(dot);
            }
            testBtn.innerText = "Freeze Test ❄️";
            testBtn.onclick = () => runLabTest("Clean! Won't freeze up high in the sky!");

        } else if (gameState.product === 'diesel') {
            container.innerHTML = `
                <h3>The Winterizer</h3>
                <p>Add 3 drops of Cold Flow Improver so it flows smoothly.</p>
                <button class="btn interactive-element" id="diesel-btn" onclick="addDieselDrop()" style="margin: 15px;">➕ Add Cold Flow Improver</button>
                <div class="mixing-tank" id="mix-tank"></div>
            `;
            testBtn.innerText = "Cold Flow Test 🥶";
            testBtn.onclick = () => runLabTest("Flows perfectly, even in winter!");
        }
    }

    window.runLabTest = function(successMessage) {
        document.getElementById('test-btn').disabled = true;
        document.getElementById('test-progress-container').classList.remove('hidden');
        let bar = document.getElementById('test-progress');
        let width = 0;
        let loadInterval = setInterval(() => {
            width += 20;
            bar.style.width = width + '%';
            if (width >= 100) {
                clearInterval(loadInterval);
                const result = document.getElementById('test-result');
                result.classList.remove('hidden');
                result.innerText = `PASS! ✅ ${successMessage}`;
                setTimeout(() => {
                    updateProductIcon();
                    showPhase('5'); 
                }, 1800);
            }
        }, 150); 
    }

    function updateProductIcon() {
        const display = document.getElementById('product-display');
        if (gameState.product === 'gasoline') display.innerText = '🚗';
        else if (gameState.product === 'jetfuel') display.innerText = '✈️';
        else if (gameState.product === 'diesel') display.innerText = '🚛';
        else display.innerText = '⛽';
    }

    // --- Phase 5: Logistics ---
    window.chooseLogistics = function(transport) {
        let finalMsg = '';
        if (transport === 'truck') finalMsg = "Great choice! 🚛 Tanker Trucks deliver fuel directly to local gas stations and businesses!";
        else if (transport === 'pipeline') finalMsg = "Awesome! 🚰 Pipelines safely move huge amounts of liquid underground across the country!";
        else if (transport === 'barge') finalMsg = "Smart pick! 🚢 Barges carry massive amounts of fuel down rivers. One barge equals 100 trucks!";

        document.getElementById('finale-message').innerText = finalMsg;
        showPhase('finale'); 
        setTimeout(triggerConfetti, 500);
    };

    window.resetGame = function() {
        gameState.phase = 1;
        gameState.product = null;
        gameState.clicks = 0;
        
        document.getElementById('oil-level').style.height = '0%';
        const pBtn = document.getElementById('pump-btn');
        pBtn.disabled = false;
        pBtn.innerText = "Pump to Refinery! (0/5)";
        document.getElementById('test-progress-container').classList.add('hidden');
        document.getElementById('test-progress').style.width = '0%';
        document.getElementById('test-result').classList.add('hidden');
        document.getElementById('test-btn').disabled = false;
        
        const canvas = document.getElementById('confetti-canvas');
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        showPhase('1');
    };

    function triggerConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = document.getElementById('game-container').offsetWidth;
        canvas.height = document.getElementById('game-container').offsetHeight;

        const pieces = [];
        for (let i = 0; i < 100; i++) {
            pieces.push({
                x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
                w: Math.random() * 10 + 5, h: Math.random() * 10 + 5,
                color: `hsl(${Math.random() * 360}, 100%, 50%)`, vy: Math.random() * 3 + 2
            });
        }
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;
            pieces.forEach(p => {
                p.y += p.vy;
                if (p.y < canvas.height) active = true;
                ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.w, p.h);
            });
            if (active && document.getElementById('finale').classList.contains('active')) {
                requestAnimationFrame(draw);
            }
        }
        draw();
    }
});
