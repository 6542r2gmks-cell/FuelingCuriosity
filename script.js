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
        itemsAdded: 0,
        gasRecipe: { naphtha: 0, butane: 0, reformate: 0, alkylate: 0 }
    };
    let desalterTimeouts = [];
        let vacTimeouts = [];
    let vacIntervals = [];

    /* =========================================
       PHYSICS ENGINE (Hybrid DOM-Sync)
    ========================================= */
    const { Engine, Runner, World, Bodies, Composite, Events, Body } = Matter;
    const physicsEngine = Engine.create();
    const physicsRunner = Runner.create();
    Runner.run(physicsRunner, physicsEngine);

    // This loop forces HTML elements to perfectly follow the invisible physics bodies
    Events.on(physicsEngine, 'afterUpdate', function() {
        Composite.allBodies(physicsEngine.world).forEach(body => {
            if (body.domElement && body.domElement.parentElement) {
                
                // GLOBAL SAFETY NET: The Rubber Band Teleporter
                const parent = body.domElement.parentElement;
                const pWidth = parent.offsetWidth;
                const pHeight = parent.offsetHeight;
                
                // If a body escapes > 40px outside the container bounds, snap it to the center!
                if (body.position.x < -40 || body.position.x > pWidth + 40 || 
                    body.position.y < -40 || body.position.y > pHeight + 40) {
                    Matter.Body.setPosition(body, { x: pWidth / 2, y: pHeight / 2 });
                    // Give it a tiny random bump so it resumes bouncing naturally
                    Matter.Body.setVelocity(body, { x: (Math.random() > 0.5 ? 2 : -2), y: (Math.random() > 0.5 ? 2 : -2) });
                }

                // translate3d forces the phone's GPU to render smoothly
                const x = body.position.x - (body.domElement.offsetWidth / 2);
                const y = body.position.y - (body.domElement.offsetHeight / 2);
                body.domElement.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${body.angle}rad)`;
            }
        });
    });


        // Utility to clear specific containers when restarting a minigame
    function clearPhysics(containerId) {
        const bodiesToRemove = Composite.allBodies(physicsEngine.world).filter(b => {
            // Protect the permanent walls of the crude tank and gasoline vat from being deleted!
            if (b.isStatic && b.containerId === 'crude-tank') return false;
            if (b.isStatic && b.containerId === 'gasoline-vat') return false;
            
            return b.containerId === containerId;
        });
        Composite.remove(physicsEngine.world, bodiesToRemove);
    }


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
            emoji: '🛢️🌍',
            text: "Crude oil isn't just black sludge! It can be green, yellow, or clear, and flow like water or be thick like peanut butter. Engineers call it 'light/heavy' and 'sweet/sour' (based on sulfur). Because every refinery is built like a giant, custom kitchen, they buy different 'flavors' of crude from all over the globe to blend the perfect recipe!"
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
            emoji: '🔥🪨',
            text: "The Coker unit acts like the refinery's heavy-duty oven! It uses intense heat (over 900°F) to thermally crack the absolute thickest, heaviest leftover oil into valuable gasoline and diesel. The solid leftover from this extreme baking process is petroleum coke, which is often used to make steel, aluminum, and batteries!"
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

        // Auto-dismiss after 60 seconds OR tap to dismiss
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
        funFactTimeout = setTimeout(dismiss, 60000);
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
                // Reset the target phase before jumping
        const setupMap = {
            'desalter': setupDesalter,
            '3': setupSulfurGame,
            'alky': setupAlky,
            'reformer': setupReformer,
            'vac': setupVac,
            'coker': setupCoker,
            'coker-frac': setupCokerFrac,
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
       PHASE 1: EXTRACTION (Continuous Volume)
    ========================================= */
    const pumpBtn = getEl('pump-btn');
    const pumpjack = getEl('pumpjack');
    const tankContainer = document.querySelector('.tank-container');
    
    // Inject our single sloshing volume entity
    const crudeVolume = document.createElement('div');
    crudeVolume.className = 'slosh-volume';
    tankContainer.appendChild(crudeVolume);

    // Hide the old static oil level if it's still there
    const oldOilLevel = getEl('oil-level');
    if (oldOilLevel) oldOilLevel.style.display = 'none';

    function handlePump() {
        if (state.clicks < 5) {
            state.clicks++;
            
            // System tracks volume as a simple percentage
            const newVolume = (state.clicks / 5) * 100;
            crudeVolume.style.height = `${newVolume}%`;
            
            if (pumpBtn) pumpBtn.innerText = `Pump to Refinery! (${state.clicks}/5)`;

            if (pumpjack) {
                pumpjack.classList.remove('pumping');
                void pumpjack.offsetWidth; 
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
                }, 1200);
            }
        }
    }
    
    // Bind the pointerdown handlers
    [pumpBtn, pumpjack, tankContainer].forEach(el => onTap(el, handlePump));

    /* =========================================
       PHASE 1b: DESALTER
    ========================================= */
        function setupDesalter() {
        const container = getEl('desalter-container');
        const statusEl = getEl('desalter-status');
        const toTowerBtn = getEl('to-tower-btn');
        const restartBtn = getEl('desalter-restart-btn');
        
        if (!container || !statusEl) return;
        
        // Clean up any old game loops
        desalterTimeouts.forEach(clearTimeout);
        desalterTimeouts = [];
        container.innerHTML = '';
        container.style.borderColor = 'var(--color-gray-400)';
        statusEl.style.color = 'var(--color-navy)';
        
        if (toTowerBtn) toTowerBtn.classList.add('hidden');
        if (restartBtn) restartBtn.classList.add('hidden');
        
        let health = 3;
        let isGameOver = false;
        
        function updateHealth() {
            if (health === 3) statusEl.innerText = 'Health: ❤️❤️❤️';
            else if (health === 2) statusEl.innerText = 'Health: ❤️❤️🖤';
            else if (health === 1) statusEl.innerText = 'Health: ❤️🖤🖤';
        }
        
        statusEl.innerText = 'Grid powering up... 3';
        
        // 1. The 3-Second Orientation Countdown
        let countdown = 3;
        const countInt = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                statusEl.innerText = `Grid powering up... ${countdown}`;
            } else {
                clearInterval(countInt);
                if (isGameOver) return; 
                updateHealth();
                startGameplay();
            }
        }, 1000);
        desalterTimeouts.push(countInt);
        
        // 2. The Gameplay Loop
        function startGameplay() {
            // Spawn a drop every 600ms
            const spawnInt = setInterval(() => {
                if (isGameOver) return;
                spawnDrop();
            }, 600); 
            desalterTimeouts.push(spawnInt);
            
            // Win condition: survive for 6 seconds
            const gameTimer = setTimeout(() => {
                clearInterval(spawnInt);
                if (!isGameOver) {
                    isGameOver = true;
                    statusEl.innerText = 'Success! Grid cleared! ✅';
                    statusEl.style.color = '#2e7d32'; // Green
                    
                    // Clear remaining unzapped drops
                    document.querySelectorAll('.flowing-drop').forEach(el => el.remove());
                    if (toTowerBtn) toTowerBtn.classList.remove('hidden');
                }
            }, 6000); 
            desalterTimeouts.push(gameTimer);
        }
        
        // 3. Spawning and Movement Logic
        function spawnDrop() {
            const drop = document.createElement('div');
            drop.className = 'desalter-drop flowing-drop interactive-element';
            drop.innerText = Math.random() > 0.5 ? '💧' : '🧂';
            
            // Start at bottom left
            drop.style.bottom = (5 + Math.random() * 20) + 'px';
            drop.style.left = (5 + Math.random() * 20) + 'px';
            
            // Inject dynamic end coordinates for the CSS animation to use
            const endX = 160 + Math.random() * 40;
            const endY = -160 - Math.random() * 40;
            drop.style.setProperty('--endX', endX + 'px');
            drop.style.setProperty('--endY', endY + 'px');
            
            let isZapped = false;
            
            // Success hit
            onTap(drop, function() {
                if (isGameOver || isZapped) return;
                isZapped = true;
                this.innerText = '⚡';
                this.style.animationPlayState = 'paused';
                this.style.pointerEvents = 'none';
                setTimeout(() => this.remove(), 200);
            });
            
            // If the CSS animation finishes, the drop escaped!
            drop.addEventListener('animationend', () => {
                if (isGameOver || isZapped) return;
                drop.remove();
                takeDamage();
            });
            
            container.appendChild(drop);
        }
        
        // 4. Failure Logic
        function takeDamage() {
            if (isGameOver) return;
            health--;
            updateHealth();
            
            // Flash the vat border red
            container.style.borderColor = 'var(--color-red)';
            setTimeout(() => {
                if (!isGameOver && container) container.style.borderColor = 'var(--color-gray-400)';
            }, 200);
            
            if (health <= 0) {
                isGameOver = true;
                desalterTimeouts.forEach(clearTimeout); // Stop spawning
                
                statusEl.innerText = '🚨 DESALTER UPSET! You let the salt through! 🚨';
                statusEl.style.color = 'var(--color-red)';
                container.style.borderColor = 'var(--color-red)';
                
                // Freeze everything on screen
                document.querySelectorAll('.flowing-drop').forEach(el => {
                    el.style.animationPlayState = 'paused';
                });
                
                if (restartBtn) restartBtn.classList.remove('hidden');
            }
        }
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
        clearPhysics('sulfur-container'); // Clear old resets
        
        // SWEPT: Prevent event listeners from stacking on multiple play-throughs
        Matter.Events.off(physicsEngine, 'beforeUpdate'); 
             const toProcessingBtn = getEl('to-processing-btn');
        if (toProcessingBtn) toProcessingBtn.classList.add('hidden');

              // 1. Massive 200px thick "Vault" walls to prevent tunneling
        const t = 200; // Wall thickness
        const offset = t / 2;
        const wallOptions = { isStatic: true, containerId: 'sulfur-container' };
        World.add(physicsEngine.world, [
            Bodies.rectangle(110, 220 + offset, 400, t, wallOptions), // Bottom
            Bodies.rectangle(110, 0 - offset, 400, t, wallOptions),   // Top
            Bodies.rectangle(0 - offset, 110, t, 400, wallOptions),   // Left
            Bodies.rectangle(220 + offset, 110, t, 400, wallOptions)  // Right
        ]);

        const sulfurBodies = []; // Track them to keep them moving

        for (let i = 0; i < 5; i++) {
            const blobEl = document.createElement('div');
            blobEl.className = 'physics-body interactive-element';
            blobEl.style.fontSize = '2.5rem';
            blobEl.innerText = '🟡';
            container.appendChild(blobEl);

            // 2. Perfectly round, bouncy hitboxes
            const blobBody = Bodies.circle(110, 110, 20, {
                restitution: 1.05,  // Slight energy gain on bounce
                friction: 0,
                frictionAir: 0,
                containerId: 'sulfur-container'
            });
            blobBody.domElement = blobEl;
            sulfurBodies.push(blobBody);
            
            Matter.Body.setVelocity(blobBody, { 
                x: (Math.random() > 0.5 ? 1 : -1) * 4, 
                y: (Math.random() > 0.5 ? 1 : -1) * 4 
            });

            World.add(physicsEngine.world, blobBody);

            onTap(blobEl, function() {
                this.innerText = '💨';
                this.style.pointerEvents = 'none';
                World.remove(physicsEngine.world, blobBody);
                
                // Remove from our tracker array
                const index = sulfurBodies.indexOf(blobBody);
                if (index > -1) sulfurBodies.splice(index, 1);

                setTimeout(() => this.remove(), 300);
                state.itemsLeft--;
                if (state.itemsLeft === 0) {
                    setTimeout(() => {
                        if (toProcessingBtn) toProcessingBtn.classList.remove('hidden');
                    }, 300);
                }
            });
        }

        // 3. The Anti-Stuck Pulse (Pushes them if they slow down)
        Matter.Events.on(physicsEngine, 'beforeUpdate', function() {
            sulfurBodies.forEach(body => {
                if (Math.abs(body.velocity.x) < 2 || Math.abs(body.velocity.y) < 2) {
                    Matter.Body.applyForce(body, body.position, {
                        x: (Math.random() - 0.5) * 0.005,
                        y: (Math.random() - 0.5) * 0.005
                    });
                }
            });
        });
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
       HF ALKYLATION (Enhanced Settler & Regen)
    ========================================= */
    let alkyIntervals = [];

    function setupAlky() {
        const settler = getEl('alky-settler');
        const regen = getEl('alky-regen');
        const purityEl = getEl('alky-purity');
        const progressEl = getEl('alky-progress');
        const doneBtn = getEl('alky-done-btn');
        const restartBtn = getEl('alky-restart-btn');
        
        if (!settler || !regen) return;

        // Clean up
        alkyIntervals.forEach(clearInterval);
        alkyIntervals = [];
        document.querySelectorAll('.alky-mol, .alky-tar').forEach(e => e.remove());
        
        if (doneBtn) doneBtn.classList.add('hidden');
        if (restartBtn) restartBtn.classList.add('hidden');

        let purity = 90;
        let moleculesCombined = 0;
        const targetMolecules = 5;
        let isGameOver = false;

        purityEl.innerText = `Acid Purity: ${purity}%`;
        purityEl.style.color = '#2e7d32';
        progressEl.innerText = `Alkylate: 0/${targetMolecules}`;

        // 1. Spawn Reaction Molecules in the Emulsion Layer
        function spawnMolecule() {
            if (isGameOver) return;
            const mol = document.createElement('div');
            mol.className = 'alky-mol interactive-element';
            mol.innerText = '🫧🫧'; // Isobutane + Olefin
            
            // Randomly place inside the emulsion layer (Y: 25% to 75%)
            mol.style.top = (25 + Math.random() * 40) + '%';
            mol.style.left = (5 + Math.random() * 60) + '%';
            
            settler.appendChild(mol);

            onTap(mol, function() {
                if (isGameOver) return;
                this.innerText = '🟡'; // Becomes Alkylate
                this.style.pointerEvents = 'none';
                
                // Float up into the Hydrocarbon layer
                this.style.transition = 'top 1s ease-in-out';
                this.style.top = '5%'; 
                
                moleculesCombined++;
                progressEl.innerText = `Alkylate: ${moleculesCombined}/${targetMolecules}`;
                
                setTimeout(() => this.remove(), 1000);

                if (moleculesCombined >= targetMolecules) {
                    triggerWin();
                } else {
                    setTimeout(spawnMolecule, 800);
                }
            });
        }

        // Start with 2 molecules on screen
        spawnMolecule();
        setTimeout(spawnMolecule, 400);

                // 2. Spawn Tar (ASO), Handle Gravity and Dragging
        const tarInterval = setInterval(() => {
            if (isGameOver) return;
            
            const tar = document.createElement('div');
            tar.className = 'alky-tar interactive-element';
            tar.innerText = '🟤';
            
            let currentTop = -15; // Starts off-screen at the top
            let isDragging = false;
            
            tar.style.top = currentTop + '%';
            tar.style.left = (10 + Math.random() * 60) + '%';
            settler.appendChild(tar);

            // Gravity Loop: Slowly drift down through the layers
            const fall = setInterval(() => {
                if (isGameOver || !tar.parentNode) {
                    clearInterval(fall);
                    return;
                }
                if (!isDragging) {
                    currentTop += 0.6; // Speed of the fall (increase to fall faster)
                    if (currentTop > 80) currentTop = 80; // Floors out in the acid layer
                    tar.style.top = currentTop + '%';
                }
            }, 50);
            alkyIntervals.push(fall);

            // Drag and Drop Logic
            tar.addEventListener('pointerdown', function(e) {
                if (isGameOver) return;
                e.preventDefault();
                isDragging = true;
                tar.setPointerCapture(e.pointerId);
                
                function onMove(e) {
                    const rect = getEl('alky-system').getBoundingClientRect();
                    let x = e.clientX - rect.left - 20;
                    let y = e.clientY - rect.top - 20;
                    tar.style.left = x + 'px';
                    tar.style.top = y + 'px';
                }
                
                function onUp(e) {
                    isDragging = false;
                    tar.releasePointerCapture(e.pointerId);
                    tar.removeEventListener('pointermove', onMove);
                    tar.removeEventListener('pointerup', onUp);
                    
                    // True boundary collision check for the floating Regen Box
                    const regenRect = regen.getBoundingClientRect();
                    const tarRect = tar.getBoundingClientRect();
                    
                    if (tarRect.right > regenRect.left && 
                        tarRect.bottom > regenRect.top && 
                        tarRect.left < regenRect.right && 
                        tarRect.top < regenRect.bottom) {
                        tar.remove(); // Successfully regenerated!
                        purity = Math.min(100, purity + 5);
                        updatePurityUI();
                    } else {
                        // Snaps back into the acid layer if missed
                        tar.style.left = '50%';
                        currentTop = 80;
                        tar.style.top = currentTop + '%';
                    }
                }
                
                tar.addEventListener('pointermove', onMove);
                tar.addEventListener('pointerup', onUp);
            });

            // Degradation over time if tar sits in the acid layer too long
            const decay = setInterval(() => {
                if (isGameOver || !tar.parentNode) {
                    clearInterval(decay);
                    return;
                }
                purity -= 2;
                updatePurityUI();
            }, 1000);
            alkyIntervals.push(decay);

        }, 1200); // <-- FASTER SPAWN: Now forms every 1.2 seconds!
        alkyIntervals.push(tarInterval);

        function updatePurityUI() {
            if (isGameOver) return;
            purityEl.innerText = `Acid Purity: ${purity}%`;
            
            if (purity < 85) purityEl.style.color = '#c53030'; // Red
            else if (purity < 90) purityEl.style.color = '#dd6b20'; // Orange
            else purityEl.style.color = '#2e7d32'; // Green

            if (purity <= 80) {
                triggerLoss();
            }
        }

        function triggerWin() {
            isGameOver = true;
            alkyIntervals.forEach(clearInterval);
            progressEl.innerText = "Reaction Complete! ✅";
            progressEl.style.color = '#2e7d32';
            if (doneBtn) doneBtn.classList.remove('hidden');
        }

        function triggerLoss() {
            isGameOver = true;
            alkyIntervals.forEach(clearInterval);
            purityEl.innerText = "🚨 PURITY TOO LOW! ACID RUNAWAY RISK! Automatic Shutdown Activated! 🚨";
            if (restartBtn) restartBtn.classList.remove('hidden');
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
/* =========================================
   VACUUM TOWER (Zero-Gravity Leak Minigame)
========================================= */
function setupVac() {
    const container = getEl('vac-container');
    const choices = getEl('vac-choices');
    let status = getEl('vac-status');
    
    if (!container) return;

    // Clean up previous runs
    vacTimeouts.forEach(clearTimeout);
    vacIntervals.forEach(clearInterval);
    vacTimeouts = [];
    vacIntervals = [];
    clearPhysics('vac-container');

    // Turn OFF gravity for the gas effect!
    physicsEngine.world.gravity.y = 0;

    // Inject the UI if it isn't there yet
    container.innerHTML = '';
    container.style.borderColor = 'var(--color-gray-500)';
    
    // Ensure the status text exists above the container
    if (!status) {
        status = document.createElement('p');
        status.id = 'vac-status';
        status.style.fontWeight = 'bold';
        status.style.minHeight = '24px';
        container.parentNode.insertBefore(status, container);
    }
    
    status.innerText = "Pump out the air to pull a vacuum!";
    status.style.color = "var(--color-navy)";
    if (choices) choices.classList.add('hidden');

    // Create massive 200px thick bouncy walls for the 220x250 container
    const t = 200; 
    const offset = t / 2;
    const wallOptions = { isStatic: true, containerId: 'vac-container' };
    World.add(physicsEngine.world, [
        Bodies.rectangle(110, 250 + offset, 400, t, wallOptions), // Floor
        Bodies.rectangle(110, 0 - offset, 400, t, wallOptions),   // Ceiling
        Bodies.rectangle(0 - offset, 125, t, 400, wallOptions),   // Left
        Bodies.rectangle(220 + offset, 125, t, 400, wallOptions)  // Right
    ]);

    let leakTriggered = false;
    let leakSealed = false;
    let isGameOver = false;

    // Function to spawn an air molecule
    function spawnAir(startX, startY, velocityX, velocityY) {
        const airEl = document.createElement('div');
        airEl.className = 'physics-body air-molecule interactive-element';
        airEl.innerText = '💨';
        container.appendChild(airEl);

        const airBody = Bodies.circle(startX, startY, 15, {
            restitution: 1.05, 
            friction: 0,
            frictionAir: 0,
            containerId: 'vac-container'
        });
        airBody.domElement = airEl;
        
        Matter.Body.setVelocity(airBody, { x: velocityX, y: velocityY });
        World.add(physicsEngine.world, airBody);

        // Tap to remove air
        onTap(airEl, function() {
            if (isGameOver) return;
            
            World.remove(physicsEngine.world, airBody);
            this.remove(); // Removes the HTML element instantly

            // Check state immediately based on ACTUAL elements left
            checkGameState();
        });
    }

    // Phase 1: Start packed with air (Spawn 25 molecules)
    for (let i = 0; i < 25; i++) {
        const x = 30 + (Math.random() * 160);
        const y = 30 + (Math.random() * 190);
        const vx = (Math.random() - 0.5) * 6;
        const vy = (Math.random() - 0.5) * 6;
        spawnAir(x, y, vx, vy);
    }

    function checkGameState() {
        if (isGameOver) return;

        // Explicitly count remaining DOM elements
        const remainingAir = container.querySelectorAll('.air-molecule').length;

        // Trigger Phase 2: The Leak
        if (remainingAir === 0 && !leakTriggered) {
            leakTriggered = true;
            
            // Visual Flash so the user knows something happened instantly
            container.style.backgroundColor = "var(--color-red)";
            setTimeout(() => {
                container.style.backgroundColor = ""; 
            }, 150);
            
            triggerLeak();
        }

        // Win Condition!
        if (remainingAir === 0 && leakTriggered && leakSealed) {
            isGameOver = true;
            status.innerText = "Vacuum restored! Flashing heavy resid...";
            status.style.color = "var(--color-green)";
            
            physicsEngine.world.gravity.y = 1;

            setTimeout(() => {
                showFunFact('vac', () => {
                    if (choices) choices.classList.remove('hidden');
                });
            }, 1000);
        }
    }

    function triggerLeak() {
        status.innerText = "🚨 AIR LEAK! Seal the hole before pressure builds! 🚨";
        status.style.color = "var(--color-red)";
        container.style.borderColor = "var(--color-red)";

        // Generate random coordinates within the container bounds
        // Container is 220x250. Margins applied to keep the hole fully inside.
        const holeX = 30 + (Math.random() * 160);
        const holeY = 30 + (Math.random() * 190);

        const hole = document.createElement('div');
        hole.className = 'vac-hole interactive-element';
        
        // Apply absolute positioning based on the randomized coordinates
        hole.style.position = 'absolute';
        hole.style.left = `${holeX}px`;
        hole.style.top = `${holeY}px`;
        // Ensure standard CSS centering (optional, acts as a fallback if not in your stylesheet)
        hole.style.transform = 'translate(-50%, -50%)'; 
        
        container.appendChild(hole);

        onTap(hole, function() {
            if (isGameOver) return;
            leakSealed = true;
            this.remove();
            status.innerText = "Hole sealed! Clear the remaining air!";
            status.style.color = "var(--color-orange)";
            container.style.borderColor = "var(--color-gray-500)";
        });

        const leakInt = setInterval(() => {
            if (leakSealed || isGameOver) {
                clearInterval(leakInt);
                return;
            }

            // Air now shoots out from the randomized hole location in random directions
            const burstVx = (Math.random() - 0.5) * 8;
            const burstVy = (Math.random() - 0.5) * 8;
            spawnAir(holeX, holeY, burstVx, burstVy);

            // Fail Condition using the new DOM count
            const currentAirCount = container.querySelectorAll('.air-molecule').length;
            if (currentAirCount >= 30) {
                isGameOver = true;
                clearInterval(leakInt);
                status.innerText = "💥 LOST VACUUM! Tower Pressurized! 💥";
                
                Composite.allBodies(physicsEngine.world).forEach(b => {
                    if (b.containerId === 'vac-container') {
                        Matter.Body.setVelocity(b, {x: 0, y: 0});
                    }
                });

                const restartBtn = document.createElement('button');
                restartBtn.className = 'btn interactive-element';
                restartBtn.innerText = 'Restart Vacuum';
                restartBtn.style.marginTop = '15px';
                onTap(restartBtn, () => Game.mapJump('vac'));
                container.parentNode.appendChild(restartBtn);
            }
        }, 400);
        vacIntervals.push(leakInt);
    }
}
    /* =========================================
       VACUUM TOWER ROUTING (VGO / VTB)
    ========================================= */
    function chooseVacPath(product) {
        // Track the user's choice for analytics
        track('select_content', {
            'content_type': 'vac_tower_choice',
            'item_id': product
        });

        if (product === 'vtb') {
            // Vacuum Tower Bottoms route to the Coker
            state.product = 'resid'; // Keep internal state aligned
            showFunFact('coker', () => {
                mapJump('coker');
            });
        } else if (product === 'vgo') {
            // Vacuum Gas Oil routes to the FCC
            state.product = 'gasoil'; 
            showFunFact('fcc', () => {
                mapJump('fcc');
            });
        }
    }

       /* =========================================
       COKER (Hydroblast Minigame)
    ========================================= */
    let cokerController = new AbortController();
    let cokerIntervals = [];

    function setupCoker() {
        // Abort old listeners cleanly
        cokerController.abort();
        cokerController = new AbortController();
        cokerIntervals.forEach(clearInterval);
        cokerIntervals = [];

        // We assume the parent container is phase-coker or we target the main wrapper
        // To be safe, we will locate the existing coker container or inject it.
        let container = getEl('coker-container');
        if (!container) {
            // Fallback: If your game.html uses #phase-coker directly, we write into it
            container = getEl('phase-coker'); 
        }
        if (!container) return;

        // Clean up previous physics and events
        clearPhysics('coker-drum');
        Matter.Events.off(physicsEngine, 'collisionStart'); 

                container.innerHTML = `
            <h2>Phase 3: The Coker</h2>
            <p id="coker-status" style="font-weight: bold; color: var(--color-orange); min-height: 24px;">Heating Resid to 900°F...</p>
            <div class="coker-system">
                <div class="coker-heater" id="coker-heater"></div>
                <div class="coker-pipe"></div>
                <div class="coker-drum-new" id="coker-drum">
                    <div class="water-lance hidden" id="water-lance">
                        <div class="lance-nozzle"></div>
                    </div>
                </div>
                <div class="coker-pipe" style="margin-bottom: 170px;"></div> 
                <div class="coker-fractionator"></div>
            </div>
            <button id="coker-frac" class="btn hidden" onclick="Game.mapJump('coker-frac')">To Coker Fractionator!</button>
        `;



        const drum = getEl('coker-drum');
        const status = getEl('coker-status');
        const fracBtn = getEl('coker-frac');
        const lance = getEl('water-lance');

        // Setup invisible walls for the new drum (140x200)
        const wallOptions = { isStatic: true, containerId: 'coker-drum' };
        World.add(physicsEngine.world, [
            Bodies.rectangle(70, 205, 140, 10, wallOptions), // Floor
            Bodies.rectangle(-5, 100, 10, 200, wallOptions), // Left
            Bodies.rectangle(145, 100, 10, 200, wallOptions) // Right
        ]);

        let totalCoke = 0;
        let isBlasting = false;

        // Sequence 1: Heating, Filling & Vapors
        let fillCount = 0;
        const fillInt = setInterval(() => {
            fillCount++;
            
            // Oil dropping in
            const dropEl = document.createElement('div');
            dropEl.className = 'physics-body oil-particle';
            drum.appendChild(dropEl);

            const dropBody = Bodies.circle(50 + (Math.random() * 40), -10, 6, { 
                restitution: 0.1, friction: 0.1, density: 0.05, containerId: 'coker-drum'
            });
            dropBody.domElement = dropEl;
            World.add(physicsEngine.world, dropBody);

            // Vapors rising out
            if (fillCount % 3 === 0) {
                const vapor = document.createElement('div');
                vapor.className = 'vapor-particle';
                vapor.innerText = '💨';
                vapor.style.left = (50 + Math.random() * 40) + 'px';
                vapor.style.top = '10px';
                drum.appendChild(vapor);
                setTimeout(() => vapor.remove(), 2000);
            }

            if (fillCount >= 45) { // Stop after 4.5 seconds
                clearInterval(fillInt);
                triggerBake();
            }
        }, 100);
        cokerIntervals.push(fillInt);

       
                      // Sequence 2: Sequential Bake to Solid Coke
        function triggerBake() {
            status.innerText = "Baking into solid Petroleum Coke...";
            status.style.color = "var(--color-navy)";
            
            clearPhysics('coker-drum');
            drum.querySelectorAll('.oil-particle').forEach(e => e.remove());

            const rows = 6;
            const cols = 5;
            let r = 0;
            let c = 0;

            const bakeInt = setInterval(() => {
                const cokeEl = document.createElement('div');
                cokeEl.className = 'physics-body coke-chunk';
                cokeEl.innerText = '🪨';
                drum.appendChild(cokeEl);

                const cokeBody = Bodies.rectangle(20 + (c * 25), 180 - (r * 25), 22, 22, {
                    isStatic: true,
                    label: 'coke',
                    containerId: 'coker-drum'
                });
                
                // ADDED: Give each block 5 hit points!
                cokeBody.health = 5; 
                
                cokeBody.domElement = cokeEl;
                World.add(physicsEngine.world, cokeBody);
                totalCoke++;

                c++;
                if (c >= cols) { c = 0; r++; }

                if (r >= rows) {
                    clearInterval(bakeInt);
                    setTimeout(triggerHydroblast, 800);
                }
            }, 50);
            cokerIntervals.push(bakeInt);
        }

        // Sequence 3: The Hydroblast Minigame (With Throttling and Health)
        function triggerHydroblast() {
            status.innerText = "Tap & drag to HYDROBLAST the coke!";
            status.style.color = "var(--color-red)";
            lance.classList.remove('hidden');
            isBlasting = true;

            Matter.Events.on(physicsEngine, 'collisionStart', function(event) {
                event.pairs.forEach((pair) => {
                    const { bodyA, bodyB } = pair;
                    const cokeBody = bodyA.label === 'coke' ? bodyA : (bodyB.label === 'coke' ? bodyB : null);
                    const waterBody = bodyA.label === 'water' ? bodyA : (bodyB.label === 'water' ? bodyB : null);

                    if (cokeBody && waterBody && cokeBody.label !== 'destroyed') {
                        // ADDED: Decrease health on hit
                        cokeBody.health--;
                        
                        // Visual feedback: block fades as it takes damage
                        if (cokeBody.domElement) {
                            cokeBody.domElement.style.opacity = (cokeBody.health / 5) + 0.2;
                        }

                        if (cokeBody.health <= 0) {
                            cokeBody.label = 'destroyed'; 
                            World.remove(physicsEngine.world, cokeBody);
                            if (cokeBody.domElement) cokeBody.domElement.remove();
                            
                            totalCoke--;
                            if (totalCoke <= 0 && isBlasting) {
                                isBlasting = false;
                                status.innerText = "Drum Cleared! Great Job!";
                                status.style.color = "var(--color-green)";
                                lance.style.height = '0px';
                                showFunFact('coker', () => {
                                    if (fracBtn) fracBtn.classList.remove('hidden');
                                });
                            }
                        }
                    }
                });
            });

            // ADDED: Throttle the water firing to max 20 times a second
            let lastFire = 0; 
            drum.addEventListener('pointermove', function(e) {
                if (!isBlasting) return;
                if (e.pointerType === 'mouse' && e.buttons === 0) return;

                const rect = drum.getBoundingClientRect();
                let yPos = e.clientY - rect.top;
                
                if (yPos < 10) yPos = 10;
                if (yPos > 190) yPos = 190;
                
                lance.style.height = yPos + 'px';

                const now = Date.now();
                if (now - lastFire > 50) { 
                    fireWater(70, yPos);
                    lastFire = now;
                }

            }, { signal: cokerController.signal });
}
        function fireWater(x, y) {
            // Fire one left, one right
            [-1, 1].forEach(direction => {
                const waterEl = document.createElement('div');
                waterEl.className = 'physics-body lance-water';
                drum.appendChild(waterEl);

                const waterBody = Bodies.circle(x + (direction * 10), y, 4, {
                    label: 'water',
                    restitution: 0.5,
                    friction: 0,
                    containerId: 'coker-drum'
                });
                waterBody.domElement = waterEl;
                
                // Shoot the water sideways incredibly fast
                Matter.Body.setVelocity(waterBody, { x: direction * 15, y: -2 + (Math.random() * 4) });
                World.add(physicsEngine.world, waterBody);

                // Remove water particles after 500ms so they don't overflow the engine
                setTimeout(() => {
                    World.remove(physicsEngine.world, waterBody);
                    if (waterEl) waterEl.remove();
                }, 500);
            });
        }
    }

    /* =========================================
       COKER FRACTIONATOR
    ========================================= */
    function setupCokerFrac() {
        const container = getEl('coker-frac-container');
        if (!container) return;

        container.innerHTML = `
            <div class="tower-container">
                <div class="tower-cap"></div>
                <div class="tower-body">
                    <button class="btn tower-btn top interactive-element" onclick="Game.chooseCokerProduct('lpg')">💨 Coker LPG</button>
                    <button class="btn tower-btn middle interactive-element" onclick="Game.chooseCokerProduct('naphtha')">🧪 Coker Naphtha (Gasoline)</button>
                    <button class="btn tower-btn middle interactive-element" style="background: #3182ce;" onclick="Game.chooseCokerProduct('diesel')">🚛 Coker ULSD (Diesel)</button>
                    <button class="btn tower-btn bottom interactive-element" onclick="Game.chooseCokerProduct('gasoil')">🔥 Heavy Gas Oil (To FCC)</button>
                </div>
                <div class="tower-base" style="height: auto; padding: 12px; background: #1a202c; color: var(--color-gray-400); border-radius: 4px; margin-top: 8px; text-align: center; font-weight: bold; border: 2px solid #2d3748;">
                    <span style="font-size: 1.5rem;">🪨</span> Solid Coke (Stays in Drum)
                </div>
            </div>
        `;
    }

    function chooseCokerProduct(product) {
        track('select_content', {
            'content_type': 'coker_frac_choice',
            'item_id': product
        });

        if (product === 'gasoil') {
            // Gas Oil routes straight to the FCC for further cracking
            showFunFact('fcc', () => {
                setupFCC();
                showPhase('fcc');
            });
        } else {
            // LPG, Naphtha, and Diesel all require hydrotreating to remove sulfur and olefins
            state.product = product;
            showFunFact('sulfur', () => {
                setupSulfurGame();
                showPhase('3');
            });
        }
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
                        showFunFact('fcc', () => {
                            if (frac) frac.classList.remove('hidden');
                        });
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
        if (state.product !== 'gasoline') {
            const btn = getEl(btnId);
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.4';
            }
        } else {
            const ingredient = btnId.replace('btn-', '');
            if (state.gasRecipe[ingredient] !== undefined) {
                state.gasRecipe[ingredient]++;
            }
        }

        const vat = getEl('gasoline-vat');
        if (!vat) return;

        // 1. Create and drop the pour stream
        const stream = document.createElement('div');
        stream.className = 'pour-stream';
        stream.style.backgroundColor = color;
        vat.appendChild(stream);

        // Calculate how far the stream needs to drop to hit the current liquid level
        const currentFillPercent = state.itemsAdded * 25;
        
        setTimeout(() => { 
            stream.style.height = `${100 - currentFillPercent}%`; 
        }, 10);

        // 2. Raise the volume and transfer the wave
        setTimeout(() => {
            // Remove the wave from all older layers
            const oldLayers = vat.querySelectorAll('.liquid-layer');
            oldLayers.forEach(l => l.classList.remove('wave-active'));

            // Create the new active layer
            const layer = document.createElement('div');
            layer.className = 'liquid-layer wave-active';
            layer.style.backgroundColor = color;
            vat.appendChild(layer);

            // Animate layer rising
            setTimeout(() => { layer.style.height = '25%'; }, 50);

            // Fade out and clean up the pour stream
            setTimeout(() => {
                stream.style.opacity = '0';
                setTimeout(() => stream.remove(), 300);
            }, 500);

        }, 250); // Start the volume rise just as the stream hits the bottom

        state.itemsAdded++;
        if (state.itemsAdded === 4) {
            document.querySelectorAll('.component-btn').forEach(b => {
                b.disabled = true;
                b.style.opacity = '0.4';
            });

            setTimeout(() => {
                // Chemical reaction! All distinct layers blend into the final golden gasoline color
                document.querySelectorAll('.liquid-layer').forEach(l => {
                    l.style.backgroundColor = '#eab308';
                });
                
                setTimeout(() => {
                    const labCheck = getEl('lab-check');
                    if (labCheck) labCheck.classList.remove('hidden');
                }, 1000);
            }, 1200); // Wait for the final pour animation to completely finish
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
            state.gasRecipe = { naphtha: 0, butane: 0, reformate: 0, alkylate: 0 }; // Reset recipe

            container.innerHTML = `
                <h3>The Blender</h3>
                <p>Blend 4 parts to make regular <strong>87 Octane</strong> gasoline!</p>
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
                testBtn.onclick = () => {
                    // Send validation rules to the lab test
                    runLabTest("", () => {
                        if (state.gasRecipe.butane >= 2) {
                            return { pass: false, msg: "Too much vapor pressure! The fuel will evaporate too quickly." };
                        } else if ((state.gasRecipe.reformate + state.gasRecipe.alkylate) >= 3) {
                            return { pass: false, msg: "Too much octane! Costs too much to produce compared to the price." };
                        }    else if (state.gasRecipe.reformate === 0 && state.gasRecipe.alkylate === 0) {
        return { pass: false, msg: "Engine knocking! Naphtha alone doesn't have enough octane. Add Alkylate or Reformate!" };
                      }  return { pass: true, msg: "Perfect 87 octane blend! Ready for the road!" };
                    });
                };
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


    function runLabTest(defaultMsg, validateFn) {
        const testBtn = getEl('test-btn');
        const progressContainer = getEl('test-progress-container');
        const bar = getEl('test-progress');
        
        if (testBtn) testBtn.disabled = true;
        if (progressContainer) progressContainer.classList.remove('hidden');

        let width = 0;
        if (bar) {
            bar.style.width = '0%';
            bar.style.backgroundColor = '#48bb78'; // Reset to green 
        }

        const loadInterval = setInterval(() => {
            width += 20;
            if (bar) bar.style.width = width + '%';
            
            if (width >= 100) {
                clearInterval(loadInterval);
                
                let isPass = true;
                let finalMsg = defaultMsg;

                // If we passed a validation function, run it!
                if (validateFn) {
                    const resultObj = validateFn();
                    isPass = resultObj.pass;
                    finalMsg = resultObj.msg;
                }

                const resultEl = getEl('test-result');
                if (resultEl) {
                    resultEl.classList.remove('hidden');
                    if (isPass) {
                        resultEl.style.color = '#2e7d32'; // Green
                        resultEl.innerText = `PASS! ✅ ${finalMsg}`;
                    } else {
                        resultEl.style.color = '#c53030'; // Red
                        resultEl.innerText = `FAIL ❌ ${finalMsg}`;
                        if (bar) bar.style.backgroundColor = '#c53030';
                    }
                }

                if (isPass) {
                    setTimeout(() => {
                        showFunFact('blending', () => {
                            updateProductIcon();
                            showPhase('5');
                        });
                    }, 1800);
                } else {
                    // Give them 3.5 seconds to read the failure reason, then auto-restart!
                    setTimeout(() => {
                        setupMinigame();
                    }, 3500);
                }
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
            vehicle: '🟠 🟡 🟠 🟡 🟠 🟡', // Added more drops, CSS letter-spacing will space them
            sceneClass: 'pipeline',
            label: 'Fuel flowing through the pipeline!',
            message: "Awesome! 🚰 Pipelines move huge amounts of fuel underground across the country. They can carry millions of gallons per day at about 3-5 mph — and they run 24/7, rain or shine!"
        },

        barge: {
            emoji: '🛳️', 
            vehicle: '<span style="transform: translateY(-5px);">🛥️</span> 〰️ 🛢️🛢️', // Keeps the tugboat slightly elevated above the tow line
            sceneClass: 'barge',
            label: 'Barge cruising down the waterway!',
            message: "Smart pick! 🛳️ River barges carry large amounts of fuel through inland waterways. A single barge holds about 1 million gallons — around 100 tanker trucks!"
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
            message: "Excellent! 🚢 Ocean tanker ships carry enormous quantities of fuel (often gasoline and ULSD at the same time) across the ocean. The average product ship holds over 10 million gallons — enough to fill about 1 million cars!"
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
            vehicle.innerHTML = info.vehicle;
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
        physicsEngine.world.gravity.y = 1; // Reset gravity
        if (typeof vacTimeouts !== 'undefined') vacTimeouts.forEach(clearTimeout);
        if (typeof vacIntervals !== 'undefined') vacIntervals.forEach(clearInterval);
        if (typeof cokerIntervals !== 'undefined') cokerIntervals.forEach(clearInterval);
        
        // --- ADD THESE TWO LINES FOR THE ALKY UNIT ---
        if (typeof alkyIntervals !== 'undefined') alkyIntervals.forEach(clearInterval);
        document.querySelectorAll('.alky-mol, .alky-tar').forEach(e => e.remove());
        // ---------------------------------------------
 clearPhysics('vac-container');
        clearPhysics('crude-tank');
        clearPhysics('gasoline-vat');
        state.phase = 1;
        state.product = null;
        state.clicks = 0;
    if (typeof desalterTimeouts !== 'undefined') desalterTimeouts.forEach(clearTimeout);
                const oilLvl = getEl('oil-level');
        if (oilLvl) oilLvl.style.height = '0%';
        
        // Reset the new sloshing volume graphic
        const crudeVol = document.querySelector('.slosh-volume');
        if (crudeVol) crudeVol.style.height = '0%';

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
        chooseCokerProduct,
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
