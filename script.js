/**
 * The Great Refinery Run — Interactive STEM Game
 * FuelingCuriosity.com
 * * All game functions are namespaced under window.Game
 * to prevent global collisions with analytics or extensions.
 */
document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       CONSTANTS
    ========================================= */
    const COLOR_NAVY = '#1a365d';

    /* =========================================
       GAME STATE
    ========================================= */
    const state = {
        phase: 1,
        product: null,
        clicks: 0,
        itemsLeft: 5,
        itemsAdded: 0
    };

    /* =========================================
       UTILITIES
    ========================================= */

    /** Safe getElementById with warning on missing elements */
    function getEl(id) {
        const el = document.getElementById(id);
        if (!el) console.warn(`[Game] Missing element: #${id}`);
        return el;
    }

    /** Bind a pointerdown handler (unified mouse + touch, no double-fire) */
    function onTap(el, handler) {
        if (!el) return;
        el.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            handler.call(this, e);
        });
    }

    /** Track GA4 event safely */
    function track(eventName, params) {
        if (typeof gtag === 'function') {
            gtag('event', eventName, params);
        }
    }

    /* =========================================
       FUN FACTS (shown between phase transitions)
    ========================================= */
    const funFacts = {
        extraction: {
            emoji: '⛽',
            text: "A single oil well can produce thousands of barrels per day! The deepest wells ever drilled reach over 40,000 feet underground — that's deeper than Mount Everest is tall."
        },
        desalter: {
            emoji: '⚡',
            text: "Desalters use electric fields of up to 35,000 volts to separate salt and water from crude oil. Without this step, salt would corrode the refinery's pipes and equipment!"
        },
        distillation_lpg: {
            emoji: '💨',
            text: "LPG stands for Liquefied Petroleum Gas. It's the lightest product from the tower and is used in BBQ grills, camping stoves, and even as a fuel for some cars!"
        },
        distillation_naphtha: {
            emoji: '🧪',
            text: "Naphtha is a key ingredient in making gasoline, but it's also used to produce plastics, synthetic rubber, and even some medicines!"
        },
        distillation_jetfuel: {
            emoji: '✈️',
            text: "Jet fuel must pass over 20 quality tests before it goes into a plane. It's engineered to stay liquid even at -40°F at cruising altitude!"
        },
        distillation_diesel: {
            emoji: '🚛',
            text: "Diesel fuel contains about 10% more energy per gallon than gasoline. That extra energy is why heavy trucks, trains, and ships prefer diesel!"
        },
        distillation_resid: {
            emoji: '🪨',
            text: "Resid is so thick and heavy it barely flows at room temperature! Refineries use special vacuum and thermal processes to squeeze every last drop of value from it."
        },
        sulfur: {
            emoji: '🔬',
            text: "Sulfur removed from fuel becomes a useful byproduct! Most of the world's sulfur supply actually comes from oil refineries, and it's used to make fertilizer, rubber, and medicine."
        },
        alky: {
            emoji: '⛽',
            text: "Alkylate is one of the cleanest, highest-octane gasoline blending components. It burns so smoothly that it's the preferred fuel for racing engines!"
        },
        reformer: {
            emoji: '🔬',
            text: "Catalytic Reformers don't just make high-octane gasoline — they also produce hydrogen gas as a byproduct, which the refinery recycles into other units!"
        },
        vac: {
            emoji: '🌡️',
            text: "By lowering the pressure inside the vacuum tower, heavy oil can be separated at much lower temperatures. This saves energy and prevents the oil from thermally cracking!"
        },
        coker: {
            emoji: '♻️',
            text: "Petroleum coke has many uses! It's used in making steel, aluminum, and even batteries. Some power plants burn it for electricity."
        },
        fcc: {
            emoji: '🔥',
            text: "The FCC is often called the heart of the refinery. Its catalyst circulates at over 1,000°F and can crack millions of pounds of heavy oil into gasoline every single day!"
        },
        blending: {
            emoji: '🧪',
            text: "Refineries run lab tests on every batch of fuel before it ships. A sample as small as one cup is tested for over a dozen properties including octane, sulfur, and vapor pressure!"
        }
    };

    let funFactTimeout = null;

    function showFunFact(factKey, callback) {
        const fact = funFacts[factKey];
        if (!fact) { if (callback) callback(); return; }

        const overlay = getEl('fun-fact-overlay');
        const emojiEl = getEl('fun-fact-emoji');
        const textEl = getEl('fun-fact-text');
        if (!overlay || !emojiEl || !textEl) { if (callback) callback(); return; }

        emojiEl.innerText = fact.emoji;
        textEl.innerText = fact.text;
        overlay.classList.add('active');

        // Clear any existing timeout
        if (funFactTimeout) clearTimeout(funFactTimeout);

        // Auto-dismiss after 5 seconds OR tap to dismiss
        let dismissed = false;
        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            if (funFactTimeout) clearTimeout(funFactTimeout);
            overlay.classList.remove('active');
            overlay.removeEventListener('pointerdown', dismiss);
            setTimeout(() => { if (callback) callback(); }, 300);
        }

        overlay.addEventListener('pointerdown', dismiss, { once: true });
        funFactTimeout = setTimeout(dismiss, 5000);
    }

    /* =========================================
       CONFETTI (with RAF leak prevention)
    ========================================= */
    let confettiRAF = null;

    function triggerConfetti() {
        // Cancel any existing animation loop
        if (confettiRAF) {
            cancelAnimationFrame(confettiRAF);
            confettiRAF = null;
        }

        const canvas = getEl('confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const container = getEl('game-container');
        if (!container) return;

        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;

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
            const finale = getEl('finale');
            if (active && finale && finale.classList.contains('active')) {
                confettiRAF = requestAnimationFrame(draw);
            } else {
                confettiRAF = null;
            }
        }
        confettiRAF = requestAnimationFrame(draw);
    }

    /* =========================================
       SCREEN TRANSITIONS
    ========================================= */
    const screens = document.querySelectorAll('.screen');

    function showPhase(phaseId) {
        screens.forEach(screen => {
            screen.classList.remove('active');
        });

        // Small delay to allow exit transition before showing next screen
        setTimeout(() => {
            const nextScreen = getEl(`phase-${phaseId}`) || getEl('finale');
            if (nextScreen) {
                nextScreen.classList.add('active');

                // GA4: Phase start tracking
                track('level_start', { 'level_name': 'Phase ' + phaseId });
            }
        }, 380);
    }

    /* =========================================
       MAP JUMP
    ========================================= */
    function mapJump(phaseId, defaultProduct) {
        track('map_jump', { 'destination_phase': phaseId });

        if (defaultProduct) state.product = defaultProduct;

        // Reset the target phase before jumping
        const setupMap = {
            'desalter': setupDesalter,
            '3': setupSulfurGame,
            'alky': setupAlky,
            'reformer': setupReformer,
            'vac': setupVac,
            'coker': setupCoker,
            'fcc': setupFCC,
            '4': setupMinigame,
        };

        if (setupMap[phaseId]) setupMap[phaseId]();

        if (phaseId === '5') {
            if (!state.product) state.product = 'gasoline';
            updateProductIcon();
        }

        showPhase(phaseId);
    }

    /* =========================================
       PHASE 1: EXTRACTION
    ========================================= */
    const pumpBtn = getEl('pump-btn');
    const oilLevel = getEl('oil-level');
    const pumpjack = getEl('pumpjack');
    const tankContainer = document.querySelector('.tank-container');

    function handlePump() {
        if (state.clicks < 5) {
            state.clicks++;
            if (oilLevel) oilLevel.style.height = `${(state.clicks / 5) * 100}%`;
            if (pumpBtn) pumpBtn.innerText = `Pump to Refinery! (${state.clicks}/5)`;

            if (pumpjack) {
                pumpjack.classList.remove('pumping');
                void pumpjack.offsetWidth; // trigger reflow for re-animation
                pumpjack.classList.add('pumping');
            }

            if (state.clicks === 5) {
                if (pumpBtn) {
                    pumpBtn.disabled = true;
                    pumpBtn.innerText = "Tank Full!";
                }
                setTimeout(() => {
                    showFunFact('extraction', () => {
                        setupDesalter();
                        showPhase('desalter');
                    });
                }, 1000);
            }
        }
    }

    // Unified pointer event — no more click + touchstart double-fire
    [pumpBtn, pumpjack, tankContainer].forEach(el => onTap(el, handlePump));

    /* =========================================
       PHASE 1b: DESALTER
    ========================================= */
    function setupDesalter() {
        const container = getEl('desalter-container');
        if (!container) return;
        container.innerHTML = '';
        state.itemsLeft = 6;

        const toTowerBtn = getEl('to-tower-btn');
        if (toTowerBtn) toTowerBtn.classList.add('hidden');

        const items = ['💧', '💧', '💧', '🧂', '🧂', '🧂'];
        items.forEach(icon => {
            const drop = document.createElement('div');
            drop.className = 'desalter-drop interactive-element';
            drop.innerText = icon;
            drop.style.top = (Math.random() * 120 + 20) + 'px';
            drop.style.left = (Math.random() * 120 + 20) + 'px';

            onTap(drop, function() {
                this.innerText = '⚡';
                setTimeout(() => this.remove(), 400);
                state.itemsLeft--;
                if (state.itemsLeft === 0) {
                    setTimeout(() => {
                        if (toTowerBtn) toTowerBtn.classList.remove('hidden');
                    }, 500);
                }
            });
            container.appendChild(drop);
        });
    }

    /* =========================================
       PHASE 2: DISTILLATION
    ========================================= */
    function goToDistillation() {
        showFunFact('desalter', () => showPhase('2'));
    }

    function chooseProduct(product) {
        track('select_content', {
            'content_type': 'distillation_choice',
            'item_id': product
        });

        state.product = product;

        // Product-specific fun fact before next phase
        const factKey = 'distillation_' + product;

        if (product === 'resid') {
            showFunFact(factKey, () => {
                setupVac();
                showPhase('vac');
            });
        } else {
            if (product === 'gasoline') state.product = 'gasoline';
            showFunFact(factKey, () => {
                setupSulfurGame();
                showPhase('3');
            });
        }
    }

    /* =========================================
       PHASE 3: HYDROTREATING (Sulfur Removal)
    ========================================= */
    function setupSulfurGame() {
        const container = getEl('sulfur-container');
        const cleaningText = getEl('cleaning-text');
        if (!container) return;

        if (cleaningText) {
            cleaningText.innerHTML = `Your <strong>${state.product.toUpperCase()}</strong> contains sulfur impurities! Tap the yellow sulfur atoms to remove them!`;
        }
        container.innerHTML = '';
        state.itemsLeft = 5;

        const toProcessingBtn = getEl('to-processing-btn');
        if (toProcessingBtn) toProcessingBtn.classList.add('hidden');

        for (let i = 0; i < 5; i++) {
            const blob = document.createElement('div');
            blob.className = 'desalter-drop interactive-element';
            blob.innerText = '🟡';
            blob.style.top = (Math.random() * 120 + 20) + 'px';
            blob.style.left = (Math.random() * 120 + 20) + 'px';

            onTap(blob, function() {
                this.innerText = '💨';
                setTimeout(() => this.remove(), 300);
                state.itemsLeft--;
                if (state.itemsLeft === 0) {
                    setTimeout(() => {
                        if (toProcessingBtn) toProcessingBtn.classList.remove('hidden');
                    }, 300);
                }
            });
            container.appendChild(blob);
        }
    }

    function startProcessing() {
        showFunFact('sulfur', () => {
            if (state.product === 'lpg') {
                setupAlky();
                showPhase('alky');
            } else if (state.product === 'naphtha') {
                setupReformer();
                showPhase('reformer');
            } else {
                setupMinigame();
                showPhase('4');
            }
        });
    }

    /* =========================================
       HF ALKYLATION
    ========================================= */
    function setupAlky() {
        const container = getEl('alky-container');
        if (!container) return;
        container.innerHTML = '';
        state.itemsLeft = 3;

        const doneBtn = getEl('alky-done-btn');
        if (doneBtn) doneBtn.classList.add('hidden');

        for (let i = 0; i < 3; i++) {
            const mol = document.createElement('div');
            mol.className = 'molecule interactive-element';
            mol.innerText = '🫧🫧';
            mol.style.top = (Math.random() * 120 + 20) + 'px';
            mol.style.left = (Math.random() * 120 + 20) + 'px';

            onTap(mol, function() {
                this.innerText = '🟡';
                this.style.fontSize = '3rem';
                // Remove listener by replacing handler reference
                this.style.pointerEvents = 'none';
                state.itemsLeft--;
                if (state.itemsLeft === 0 && doneBtn) {
                    doneBtn.classList.remove('hidden');
                }
            });
            container.appendChild(mol);
        }
    }

    /* =========================================
       CATALYTIC REFORMER
    ========================================= */
    function setupReformer() {
        const container = getEl('reformer-container');
        if (!container) return;
        container.innerHTML = '';
        state.itemsLeft = 3;

        const doneBtn = getEl('reformer-done-btn');
        if (doneBtn) doneBtn.classList.add('hidden');

        for (let i = 0; i < 3; i++) {
            const mol = document.createElement('div');
            mol.className = 'molecule interactive-element';
            mol.innerText = '〰️';
            mol.style.top = (Math.random() * 120 + 20) + 'px';
            mol.style.left = (Math.random() * 120 + 20) + 'px';

            onTap(mol, function() {
                this.innerText = '⬡';
                this.innerHTML += '<span style="position:absolute; font-size:1rem; top:-20px; left:10px;">💦H</span>';
                this.style.pointerEvents = 'none';
                state.itemsLeft--;
                if (state.itemsLeft === 0) {
                    const msg = document.createElement('p');
                    msg.innerText = "High-Octane Reformate! 💪";
                    msg.style.color = COLOR_NAVY;
                    msg.style.fontWeight = "bold";
                    container.appendChild(msg);
                    setTimeout(() => {
                        if (doneBtn) doneBtn.classList.remove('hidden');
                    }, 500);
                }
            });
            container.appendChild(mol);
        }
    }

    function routeToGasoline() {
        const factKey = state.product === 'lpg' ? 'alky' : 'reformer';
        showFunFact(factKey, () => {
            state.product = 'gasoline';
            setupMinigame();
            showPhase('4');
        });
    }

    /* =========================================
       VACUUM TOWER
    ========================================= */
    function setupVac() {
        const container = getEl('vac-container');
        if (!container) return;
        container.innerHTML = '';
        state.itemsLeft = 4;

        const choices = getEl('vac-choices');
        if (choices) choices.classList.add('hidden');

        for (let i = 0; i < 4; i++) {
            const air = document.createElement('div');
            air.className = 'molecule interactive-element';
            air.innerText = '💨';
            air.style.top = (Math.random() * 120 + 20) + 'px';
            air.style.left = (Math.random() * 120 + 20) + 'px';

            onTap(air, function() {
                this.remove();
                state.itemsLeft--;
                if (state.itemsLeft === 0 && choices) {
                    choices.classList.remove('hidden');
                }
            });
            container.appendChild(air);
        }
    }

    function chooseVacPath(path) {
        track('select_content', {
            'content_type': 'vacuum_path_choice',
            'item_id': path
        });

        showFunFact('vac', () => {
            if (path === 'vtb') {
                setupCoker();
                showPhase('coker');
            } else {
                setupFCC();
                showPhase('fcc');
            }
        });
    }

    /* =========================================
       COKER (uses AbortController for clean listener management)
    ========================================= */
    let cokerController = new AbortController();

    function setupCoker() {
        // Abort old listeners cleanly
        cokerController.abort();
        cokerController = new AbortController();

        const drum = getEl('coke-drum');
        const fill = getEl('coke-fill');
        const frac = getEl('coker-frac');
        if (!drum || !fill) return;

        if (frac) frac.classList.add('hidden');
        fill.style.height = '0%';
        fill.classList.remove('cut-flash');
        state.itemsLeft = 3;

        setTimeout(() => {
            fill.style.height = '100%';

            drum.addEventListener('pointerdown', function(e) {
                e.preventDefault();
                if (state.itemsLeft > 0) {
                    state.itemsLeft--;
                    fill.style.height = (state.itemsLeft * 33) + '%';

                    fill.classList.remove('cut-flash');
                    void fill.offsetWidth; // trigger reflow
                    fill.classList.add('cut-flash');

                    if (state.itemsLeft === 0) {
                        setTimeout(() => {
                            if (frac) frac.classList.remove('hidden');
                        }, 400);
                    }
                }
            }, { signal: cokerController.signal });
        }, 800);
    }

    /* =========================================
       FCC (Fluid Catalytic Cracking)
    ========================================= */
    function setupFCC() {
        const container = getEl('fcc-container');
        if (!container) return;
        container.innerHTML = '';
        state.itemsLeft = 3;

        const frac = getEl('fcc-frac');
        if (frac) frac.classList.add('hidden');

        for (let i = 0; i < 3; i++) {
            const bigMol = document.createElement('div');
            bigMol.className = 'fcc-molecule interactive-element';
            bigMol.innerText = '🟠🟠🟠';
            bigMol.style.top = (Math.random() * 100 + 20) + 'px';
            bigMol.style.left = (Math.random() * 100 + 20) + 'px';

            onTap(bigMol, function() {
                this.innerText = '';
                for (let j = 0; j < 4; j++) {
                    const piece = document.createElement('span');
                    piece.innerText = '🟡';
                    piece.className = 'small-mol';
                    piece.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
                    piece.style.setProperty('--dy', (Math.random() * 2 - 1).toFixed(2));
                    this.appendChild(piece);
                }
                this.style.pointerEvents = 'none';
                state.itemsLeft--;
                if (state.itemsLeft === 0) {
                    setTimeout(() => {
                        if (frac) frac.classList.remove('hidden');
                    }, 1000);
                }
            });
            container.appendChild(bigMol);
        }
    }

    /* =========================================
       PHASE 4: BLENDING & PROCESSING
    ========================================= */
    function addLiquid(btnId, color) {
        const btn = getEl(btnId);
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.4';
        }

        const vat = getEl('gasoline-vat');
        if (!vat) return;

        const layer = document.createElement('div');
        layer.className = 'liquid-layer';
        layer.style.backgroundColor = color;
        vat.appendChild(layer);
        setTimeout(() => { layer.style.height = '25%'; }, 50);

        state.itemsAdded++;
        if (state.itemsAdded === 4) {
            setTimeout(() => {
                document.querySelectorAll('.liquid-layer').forEach(l => {
                    l.style.backgroundColor = '#eab308';
                });
                setTimeout(() => {
                    const labCheck = getEl('lab-check');
                    if (labCheck) labCheck.classList.remove('hidden');
                }, 1000);
            }, 800);
        }
    }

    function addDieselDrop() {
        const tank = getEl('mix-tank');
        if (tank) tank.innerText += '💧';
        state.itemsAdded++;
        if (state.itemsAdded >= 3) {
            const dieselBtn = getEl('diesel-btn');
            if (dieselBtn) dieselBtn.classList.add('hidden');
            setTimeout(() => {
                const labCheck = getEl('lab-check');
                if (labCheck) labCheck.classList.remove('hidden');
            }, 300);
        }
    }

    function setupMinigame() {
        const container = getEl('minigame-container');
        const labCheck = getEl('lab-check');
        const testBtn = getEl('test-btn');
        const testProgressContainer = getEl('test-progress-container');
        const testProgress = getEl('test-progress');
        const testResult = getEl('test-result');
        if (!container) return;

        container.innerHTML = '';
        state.itemsAdded = 0;

        // Strict UI reset (fixes map jump bug)
        if (labCheck) labCheck.classList.add('hidden');
        if (testProgressContainer) testProgressContainer.classList.add('hidden');
        if (testProgress) testProgress.style.width = '0%';
        if (testResult) testResult.classList.add('hidden');
        if (testBtn) testBtn.disabled = false;

        if (state.product === 'gasoline' || state.product === 'lpg' || state.product === 'naphtha') {
            state.product = 'gasoline';
            container.innerHTML = `
                <h3>The Blender</h3>
                <p>Tap components to blend your high-octane gasoline!</p>
                <div class="ingredient-grid">
                    <button class="component-btn interactive-element" id="btn-naphtha" data-color="#fde047">Naphtha</button>
                    <button class="component-btn interactive-element" id="btn-butane" data-color="#bae6fd">Butane</button>
                    <button class="component-btn interactive-element" id="btn-reformate" data-color="#fca5a5">Reformate</button>
                    <button class="component-btn interactive-element" id="btn-alkylate" data-color="#d8b4fe">Alkylate</button>
                </div>
                <div class="blend-vat" id="gasoline-vat"></div>
            `;
            // Bind component buttons via event delegation
            container.querySelectorAll('.component-btn').forEach(btn => {
                btn.addEventListener('pointerdown', function(e) {
                    e.preventDefault();
                    addLiquid(this.id, this.dataset.color);
                });
            });

            if (testBtn) {
                testBtn.innerText = "Engine Test 🏎️";
                testBtn.onclick = () => runLabTest("Perfectly blended and ready to race!");
            }

        } else if (state.product === 'jetfuel') {
            container.innerHTML = `
                <h3>The Purifier</h3>
                <p>Tap the floating particles to purify the jet fuel!</p>
                <div class="fuel-box" id="fuel-box"></div>
            `;
            const fuelBox = getEl('fuel-box');
            if (fuelBox) {
                for (let i = 0; i < 5; i++) {
                    const dot = document.createElement('span');
                    dot.className = 'impurity interactive-element';
                    dot.innerText = '⚫';
                    dot.style.top = (Math.random() * 140 + 10) + 'px';
                    dot.style.left = (Math.random() * 140 + 10) + 'px';
                    onTap(dot, function() {
                        this.remove();
                        if (document.querySelectorAll('.impurity').length === 0) {
                            fuelBox.style.background = '#e0f2fe';
                            if (labCheck) labCheck.classList.remove('hidden');
                        }
                    });
                    fuelBox.appendChild(dot);
                }
            }
            if (testBtn) {
                testBtn.innerText = "Freeze Test ❄️";
                testBtn.onclick = () => runLabTest("Clean! Won't freeze up high in the sky!");
            }

        } else if (state.product === 'diesel') {
            container.innerHTML = `
                <h3>The Winterizer</h3>
                <p>Add 3 drops of Cold Flow Improver so it flows smoothly.</p>
                <button class="btn interactive-element" id="diesel-btn" style="margin: 15px;">➕ Add Cold Flow Improver</button>
                <div class="mixing-tank" id="mix-tank"></div>
            `;
            const dieselBtn = getEl('diesel-btn');
            if (dieselBtn) {
                dieselBtn.addEventListener('pointerdown', function(e) {
                    e.preventDefault();
                    addDieselDrop();
                });
            }
            if (testBtn) {
                testBtn.innerText = "Cold Flow Test 🥶";
                testBtn.onclick = () => runLabTest("Flows perfectly, even in winter!");
            }
        }
    }

    function runLabTest(successMessage) {
        const testBtn = getEl('test-btn');
        const progressContainer = getEl('test-progress-container');
        const bar = getEl('test-progress');
        if (testBtn) testBtn.disabled = true;
        if (progressContainer) progressContainer.classList.remove('hidden');

        let width = 0;
        const loadInterval = setInterval(() => {
            width += 20;
            if (bar) bar.style.width = width + '%';
            if (width >= 100) {
                clearInterval(loadInterval);
                const result = getEl('test-result');
                if (result) {
                    result.classList.remove('hidden');
                    result.innerText = `PASS! ✅ ${successMessage}`;
                }
                setTimeout(() => {
                    showFunFact('blending', () => {
                        updateProductIcon();
                        showPhase('5');
                    });
                }, 1800);
            }
        }, 150);
    }

    function updateProductIcon() {
        const display = getEl('product-display');
        if (!display) return;

        const icons = {
            'gasoline': '🚗',
            'jetfuel': '✈️',
            'diesel': '🚛'
        };
        display.innerText = icons[state.product] || '⛽';
    }

    /* =========================================
       PHASE 5: LOGISTICS (Enhanced — 5 options with animation)
    ========================================= */
    const logisticsMessages = {
        truck: {
            emoji: '🚛',
            vehicle: '🚛',
            sceneClass: 'truck',
            label: 'Tanker truck rolling out to the gas station!',
            message: "Great choice! 🚛 Tanker trucks deliver fuel directly to local gas stations and businesses. Each truck carries about 9,000 gallons — enough to fill up around 600 cars!"
        },
        pipeline: {
            emoji: '🟤',
            vehicle: '🟠',
            sceneClass: 'pipeline',
            label: 'Fuel flowing through the pipeline!',
            message: "Awesome! 🚰 Pipelines move huge amounts of fuel underground across the country. They can carry millions of gallons per day at about 3-5 mph — and they run 24/7, rain or shine!"
        },
        barge: {
            emoji: '🛳️',
            vehicle: '🛳️',
            sceneClass: 'barge',
            label: 'Barge cruising down the waterway!',
            message: "Smart pick! 🛳️ River barges carry massive amounts of fuel through inland waterways. A single barge holds about 420,000 gallons — that's equal to 46 tanker trucks!"
        },
                railcar: {
            emoji: '🚂',
            vehicle: '🚂🚃', 
            sceneClass: 'railcar',
            label: 'Rail car heading down the tracks!',
            message: "Great thinking! 🚂 Rail cars haul fuel over long distances where pipelines don't reach. A single rail tank car carries about 30,000 gallons of fuel — that's more than three whole tanker trucks!"
        },
        ship: {
            emoji: '🚢',
            vehicle: '🚢',
            sceneClass: 'ship',
            label: 'Ocean tanker sailing to port!',
            message: "Excellent! 🚢 Ocean tanker ships carry enormous quantities of fuel between continents. The largest supertankers hold over 80 million gallons — enough to fill about 5 million cars!"
        }
    };

    function chooseLogistics(transport) {
        track('select_content', {
            'content_type': 'logistics_choice',
            'item_id': transport
        });
        track('level_end', {
            'level_name': 'Finale',
            'success': true
        });

        const info = logisticsMessages[transport];
        if (!info) return;

        // Set up the transport animation scene
        const scene = getEl('transport-scene');
        const vehicle = getEl('transport-vehicle');
        const label = getEl('transport-anim-label');

        if (scene && vehicle && label) {
            // Reset scene classes
            scene.className = 'transport-scene transport-scene--' + info.sceneClass;
            vehicle.innerText = info.vehicle;
            // Force re-trigger of animation
            vehicle.style.animation = 'none';
            void vehicle.offsetWidth;
            vehicle.style.animation = '';
            label.innerText = info.label;
        }

        // Show transport animation screen
        showPhase('transport');

        // After animation completes, show finale
        setTimeout(() => {
            const finaleMsg = getEl('finale-message');
            if (finaleMsg) finaleMsg.innerText = info.message;

            showPhase('finale');

            // Reveal game map on completion
            const gameMap = getEl('game-map');
            if (gameMap) gameMap.classList.remove('hidden');

            setTimeout(triggerConfetti, 500);
        }, 3200);
    }

    /* =========================================
       RESET GAME
    ========================================= */
    function resetGame() {
        state.phase = 1;
        state.product = null;
        state.clicks = 0;

        const oilLvl = getEl('oil-level');
        if (oilLvl) oilLvl.style.height = '0%';

        const pBtn = getEl('pump-btn');
        if (pBtn) {
            pBtn.disabled = false;
            pBtn.innerText = "Pump to Refinery! (0/5)";
        }

        const progressContainer = getEl('test-progress-container');
        if (progressContainer) progressContainer.classList.add('hidden');

        const progress = getEl('test-progress');
        if (progress) progress.style.width = '0%';

        const result = getEl('test-result');
        if (result) result.classList.add('hidden');

        const testBtn = getEl('test-btn');
        if (testBtn) testBtn.disabled = false;

        // Hide game map on restart
        const gameMap = getEl('game-map');
        if (gameMap) gameMap.classList.add('hidden');

        // Dismiss any active fun fact
        if (funFactTimeout) {
            clearTimeout(funFactTimeout);
            funFactTimeout = null;
        }
        const factOverlay = getEl('fun-fact-overlay');
        if (factOverlay) factOverlay.classList.remove('active');

        // Cancel confetti animation
        if (confettiRAF) {
            cancelAnimationFrame(confettiRAF);
            confettiRAF = null;
        }
        const canvas = getEl('confetti-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        showPhase('1');
    }

    /* =========================================
       EXPOSE PUBLIC API (single namespace)
    ========================================= */
    window.Game = {
        showPhase,
        mapJump,
        goToDistillation,
        chooseProduct,
        startProcessing,
        routeToGasoline,
        chooseVacPath,
        chooseLogistics,
        resetGame,
        addLiquid,
        addDieselDrop,
        runLabTest
    };
});
