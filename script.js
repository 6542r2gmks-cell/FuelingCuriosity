
/**
 * The Great Refinery Run — Interactive STEM Game
 * FuelingCuriosity.com
 * * All game functions are namespaced under window.Game
 * to prevent global collisions with analytics or extensions.
 */
window.Game = window.Game || {};
document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       CONSTANTS
    ========================================= */
    const COLOR_NAVY = '#1a365d';
    /* =========================================
       FRANTIC TAP & ZOOM PREVENTER (Mobile Fix)
    ========================================= */

    // 1. Kill Double-Tap to Zoom
    let lastTapTime = 0;
    document.addEventListener('touchend', function (e) {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;

        // If the tap was less than 300ms ago, it's a double-tap. Kill it.
        if (tapLength < 300 && tapLength > 0) {
            e.preventDefault();
        }
        lastTapTime = currentTime;
    }, { passive: false });

    // 2. Kill Multi-Finger Pinch Zooming
    document.addEventListener('touchmove', function (e) {
        // If the player touches the screen with two or more fingers, kill the zoom
        if (e.touches && e.touches.length > 1) {
            e.preventDefault();
        }
    }, { passive: false });

    const IS_STAGING_PATH = /(?:\/staging\/|game-next\.html$)/i.test(window.location.pathname);
    const ENABLE_RUNTIME_ASSERTS = IS_STAGING_PATH || /[?&](?:gameDebug|smokeTest)=1(?:&|$)/i.test(window.location.search);

    function debugAssert(condition, message, details = {}) {
        if (!ENABLE_RUNTIME_ASSERTS || condition) return;
        console.error(`[Game Assert] ${message}`, details);
    }

    /* =========================================
       GAME STATE
    ========================================= */
    const state = {
        phase: 0,
        product: null,
        clicks: 0,
        itemsLeft: 5,
        itemsAdded: 0,
        gasProduct: '87summer',
        gasVolumes: { naphtha: 0, butane: 0, reformate: 0, alkylate: 0, fccgasoline: 0 },
        gasGradesCompleted: [],
        completedUnits: [],
        jetBatches: [],
        jetBatchIndex: 0,
        jetTankLevel: 0,
        jetTimeLeft: 90,
        jetTimerInterval: null,
        jetScore: 0,
        ulsdTreatments: [],
        ulsdDoses: {},
        ulsdTimerInterval: null,
        uldsdTimeLeft: 60,
        pipeGameState: { timer: null, timeLeft: 45, spotsClamped: 0, activeTool: 'scanner' }
    };
    let desalterTimeouts = [];
    let sulfurSetupTimeout = null;
    let sulfurSetupToken = 0;
    let vacSetupTimeout = null;
    let vacSetupToken = 0;
    let vacTimeouts = [];
    let vacIntervals = [];

    /* =========================================
       PHYSICS ENGINE (Hybrid DOM-Sync)
    ========================================= */
    const { Engine, Runner, World, Bodies, Composite, Events, Body } = Matter;
    const physicsEngine = Engine.create();
    const physicsRunner = Runner.create();
    const PHYSICS_IDLE_PHASES = new Set(['0', '1', '2', '5', 'transport', 'finale', 'pump-swap', 'pipe-xray']);
    let physicsDomSyncEnabled = true;
    function syncPhysicsForPhase(phaseId) {
        physicsDomSyncEnabled = !PHYSICS_IDLE_PHASES.has(String(phaseId));
    }
    Runner.run(physicsRunner, physicsEngine);

    // This loop forces HTML elements to perfectly follow the invisible physics bodies
    Events.on(physicsEngine, 'afterUpdate', function () {
        if (!physicsDomSyncEnabled) return;
        Composite.allBodies(physicsEngine.world).forEach(body => {
            if (body.domElement && body.domElement.parentElement) {
                const parent = body.domElement.parentElement;
                const pWidth = parent.offsetWidth;
                const pHeight = parent.offsetHeight;
                if (!pWidth || !pHeight) return;

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
            if (b.isStatic && b.containerId === 'crude-tank') return false;
            if (b.isStatic && b.containerId === 'gasoline-vat') return false;
            return b.containerId === containerId;
        });

        bodiesToRemove.forEach(b => {
            Composite.remove(physicsEngine.world, b);
        });

    }

    // ============================================================
    // RESPONSIVE PHYSICS HELPERS (container-sized walls + scaling)
    // ============================================================

    function removeStaticBodies(containerId) {
        const statics = Composite.allBodies(physicsEngine.world).filter(b =>
            b.isStatic && b.containerId === containerId
        );
        Composite.remove(physicsEngine.world, statics);
    }

    // Wait until element has real dimensions (important because screens start hidden)
    function waitForSize(el, minPx = 120, cb, tries = 30) {
        const w = el?.clientWidth || 0;
        const h = el?.clientHeight || 0;

        if (w >= minPx && h >= minPx) {
            cb(w, h);
            return;
        }

        if (tries <= 0) {
            cb(Math.max(w, minPx), Math.max(h, minPx)); // fallback
            return;
        }

        setTimeout(() => waitForSize(el, minPx, cb, tries - 1), 50);
    }

    function addContainerBounds(containerEl, containerId, thickness = 200) {
        const w = containerEl.clientWidth;
        const h = containerEl.clientHeight;

        const t = thickness;
        const half = t / 2;
        const wallOptions = { isStatic: true, containerId };

        World.add(physicsEngine.world, [
            Bodies.rectangle(w / 2, -half, w + t * 2, t, wallOptions),      // top
            Bodies.rectangle(w / 2, h + half, w + t * 2, t, wallOptions),   // bottom
            Bodies.rectangle(-half, h / 2, t, h + t * 2, wallOptions),      // left
            Bodies.rectangle(w + half, h / 2, t, h + t * 2, wallOptions)    // right
        ]);
    }

    /* =========================================
       UTILITIES
    ========================================= */
    /** Save Progress to LocalBrowser Memory */
    function saveProgress() {
        const gameMap = getEl('game-map');
        const progress = {
            phase: state.phase,
            product: state.product,
            mapUnlocked: gameMap && !gameMap.classList.contains('hidden'),
            completedUnits: state.completedUnits,
            gasGradesCompleted: state.gasGradesCompleted
        };
        localStorage.setItem('refineryRunProgress', JSON.stringify(progress));
    }

    /** Safe getElementById with warning on missing elements */
    function getEl(id) {
        const el = document.getElementById(id);
        if (!el) console.warn(`[Game] Missing element: #${id}`);
        return el;
    }
    const gameContainerEl = document.getElementById('game-container');
    const MAP_JUMP_LOCK_MS = 700;
    let mapJumpLocked = false;

    function scrollGameIntoView(behavior = 'smooth') {
        if (!gameContainerEl) return;
        gameContainerEl.scrollIntoView({ behavior, block: 'start' });
    }

    function setMapButtonsDisabled(isDisabled) {
        document.querySelectorAll('#game-map .map-grid button').forEach(btn => {
            btn.disabled = isDisabled;
        });
    }

    function onTap(el, handler) {
        if (!el) return;

        el.addEventListener('pointerdown', function (e) {
            // Only block default behavior for touch/pen.
            // Allow mouse wheel + normal mouse interactions.
            if (e.pointerType !== 'mouse') e.preventDefault();
            handler.call(this, e);
        });
    }

    /** Track GA4 event safely */
    function track(eventName, params) {
        if (IS_STAGING_PATH) return;
        if (typeof gtag === 'function') {
            gtag('event', eventName, params);
        }
    }

    /* =========================================
       V-804 CERTIFICATION SYSTEM
    ========================================= */
    // ✅ Authoritative V-804 unit list (order matters for certificate display)
    const V804_UNITS = [
        { id: 'extraction', label: 'Crude Oil Extraction' },
        { id: 'desalter', label: 'Crude Desalting' },
        { id: 'distillation', label: 'Atmospheric Distillation' },
        { id: 'pump-swap', label: 'Primary Pump Swap (Hot Standby)' },
        { id: 'hydrotreating', label: 'Hydrotreating (Sulfur Removal)' },
        { id: 'alky', label: 'HF Alkylation' },
        { id: 'reformer', label: 'Catalytic Reforming' },
        { id: 'vac', label: 'Vacuum Distillation' },
        { id: 'coker', label: 'Delayed Coking' },
        { id: 'fcc', label: 'Fluid Catalytic Cracking (FCC)' },
        { id: 'pipe-xray', label: 'Pipe X-Ray Maintenance' },
        { id: 'gasoline', label: 'Gasoline Blending & Certification' },
        { id: 'jetfuel', label: 'Jet Fuel Inspection & Certification' },
        { id: 'ulsd', label: 'ULSD Treatment & Additives' },
        { id: 'logistics', label: 'Product Logistics & Delivery' }
    ];
    function markUnitComplete(unitId) {
        if (!state.completedUnits.includes(unitId)) {
            state.completedUnits.push(unitId);
            saveProgress();
            updateV804Tracker();
            updateMapUI();
            track('unit_certified', { unit_id: unitId, total: state.completedUnits.length });
        }
    }

    function updateV804Tracker() {
        const count = state.completedUnits.length;
        const bar = getEl('v804-progress-bar');
        const countEl = getEl('v804-count');
        const form = getEl('v804-form');
        if (bar) bar.max = 15;
        if (bar) bar.value = count;
        if (countEl) countEl.textContent = count + ' / 15';
        if (count >= 15 && form) {
            form.classList.remove('hidden');
            track('unlock_achievement', { achievement_id: 'V804_Eligible' });
        }
    }

    function updateMapUI() {
        const mapGrid = document.querySelector('.map-grid');
        if (!mapGrid) return;
        state.completedUnits.forEach(unitId => {
            const buttons = mapGrid.querySelectorAll(`button[data-unit="${unitId}"]`);
            buttons.forEach(btn => {
                if (!btn.classList.contains('unit-completed')) {
                    btn.classList.add('unit-completed');
                }
            });
        });
        updateV804Tracker();
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
        pipe_xray: {
            emoji: '☢️',
            text: "Refineries use industrial radiography (similar to medical X-rays) to literally see through thick steel pipes! Finding thin spots early allows engineers to clamp or replace them during scheduled maintenance instead of experiencing a sudden, dangerous leak."
        },
        pump_swap: {
            emoji: '🔄',
            text: "Refineries often install critical pumps in pairs so one can keep the unit running while the other is swapped out. Operators call this a hot standby or hot swap, and the order matters because pumps must stay full of liquid to avoid seal damage, cavitation, and reverse flow."
        },
        alky: {
            emoji: '⛽',
            text: "Alkylate is a clean, high-octane gasoline blending component. It has very low sulfur, no olefins, and no aromatics. This makes it burns smooth and reliably, making it a premium blendstock!"
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
        
        fcc_gasoline: {
          emoji: '🔥⛽',
          text: "Roughly 40% of global gasoline volume is produced from FCC units, making FCC gasoline the single largest contributor to the worldwide gasoline pool. Because it can contain sulfur and reactive olefins, it typically needs hydrotreating before blending for stability and emissions compliance."
        },

        fcc: {
            emoji: '🔥',
            text: "The FCC is often called the heart of the refinery. Its catalyst circulates at over 1,000°F and can crack millions of pounds of heavy oil into gasoline and diesel every single day!"
        },
        get blending() {
            return getBlendingFunFact();
        }
    };

    let pendingResume = null;
    const DEFAULT_PUMP_SWAP_ROUTE = Object.freeze({ product: 'jetfuel', nextPhase: '3' });
    const DEFAULT_PIPE_XRAY_ROUTE = Object.freeze({ product: 'diesel', nextPhase: '3' });
    let pumpSwapRouteContext = { ...DEFAULT_PUMP_SWAP_ROUTE };
    let pipeXrayRouteContext = { ...DEFAULT_PIPE_XRAY_ROUTE };
        
    function startOrResume() {
        // If no saved game, start fresh
        if (!pendingResume || !pendingResume.phase) {
            showPhase('1');
            return;
        }
        
        const p = pendingResume.phase;
        
        // If they left at the end flow, start a fresh run at Extraction
        if (p === 'finale' || p === 'transport') {
            // Keep mapUnlocked, but reset game run state
            resetGame();        // resetGame already preserves mapUnlocked in storage
            return;
        }
        
        if (p === 'pump-swap') {
            startPumpSwap({
                product: pendingResume.product || DEFAULT_PUMP_SWAP_ROUTE.product,
                nextPhase: DEFAULT_PUMP_SWAP_ROUTE.nextPhase
            });
            return;
        }

        if (p === 'pipe-xray') {
            startPipeXray({
                product: pendingResume.product || DEFAULT_PIPE_XRAY_ROUTE.product,
                nextPhase: DEFAULT_PIPE_XRAY_ROUTE.nextPhase
            });
            return;
        }

        // Otherwise resume from saved phase/product using existing mapJump logic
        mapJump(p, pendingResume.product);
    }

    let funFactTimeout = null;
    let funFactCallbackTimeout = null;
    let currentFunFactDismiss = null;
    let funFactSequence = 0;

    function getBlendingFunFact() {
        const facts = {
            gasoline: { emoji: '⛽', text: "Refineries run lab tests on every gasoline blend before it ships. Octane, Reid Vapor Pressure, and distillation curves are all checked against regulated seasonal specs. A $0.10/gallon optimization decision at the blender can translate to millions annually, so refineries target <0.3 giveaway. Not shown, 10% Ethanol boosts octane by ~3.5 and RVP by 1 PSI significantly changing recipes." },
            jetfuel:  { emoji: '✈️', text: "Jet fuel lab certification is among the most rigorous in the industry. Flash point, freeze point, thermal stability, and a density check are all required before any batch is cleared for aviation use. One off-spec batch can contaminate an entire airport tank farm." },
            diesel:   { emoji: '🛢️', text: "Ultra-Low Sulfur Diesel is treated with additives at the ppm level — that's parts per million, roughly equivalent to a few drops in a swimming pool. Getting the dosage exactly right is both a quality and a cost issue." }
        };
        return facts[state.product] || facts.gasoline;
    }

    function cancelFunFactFlow(options = {}) {
        const { hideOverlay = true } = options;
        const overlay = getEl('fun-fact-overlay');

        if (funFactTimeout) {
            clearTimeout(funFactTimeout);
            funFactTimeout = null;
        }
        if (funFactCallbackTimeout) {
            clearTimeout(funFactCallbackTimeout);
            funFactCallbackTimeout = null;
        }
        if (currentFunFactDismiss && overlay) {
            overlay.removeEventListener('pointerdown', currentFunFactDismiss);
            currentFunFactDismiss = null;
        }
        if (hideOverlay && overlay) {
            overlay.classList.remove('active');
        }
        funFactSequence += 1;
    }

    function showFunFact(factKey, callback) {
        const fact = funFacts[factKey];
        if (!fact) { if (callback) callback(); return; }

        const overlay = getEl('fun-fact-overlay');
        const emojiEl = getEl('fun-fact-emoji');
        const textEl = getEl('fun-fact-text');
        if (!overlay || !emojiEl || !textEl) { if (callback) callback(); return; }

        cancelFunFactFlow();
        const funFactToken = funFactSequence;

        emojiEl.innerText = fact.emoji;
        textEl.innerText = fact.text;
        overlay.classList.add('active');

        // Auto-dismiss after 60 seconds OR tap to dismiss
        let dismissed = false;
        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            if (funFactTimeout) {
                clearTimeout(funFactTimeout);
                funFactTimeout = null;
            }
            overlay.classList.remove('active');
            overlay.removeEventListener('pointerdown', dismiss);
            currentFunFactDismiss = null;
            funFactCallbackTimeout = setTimeout(() => {
                if (funFactSequence !== funFactToken) return;
                funFactCallbackTimeout = null;
                if (callback) callback();
            }, 300);
        }

        currentFunFactDismiss = dismiss;
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

let suppressAutosave = false;
let phaseTransitionTimeout = null;
let phaseActivationToken = 0;
let stageHeightLockToken = 0;
let activePhaseId = (() => {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return '0';
    return activeScreen.id === 'finale'
        ? 'finale'
        : activeScreen.id.replace(/^phase-/, '');
})();

const phaseTaskBuckets = new Map();

function clearTimerCollection(arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach(item => {
        if (typeof item === 'function') item();
        else {
            clearTimeout(item);
            clearInterval(item);
        }
    });
    arr.length = 0;
}

function getPhaseTaskBucket(phaseId) {
    const key = String(phaseId);
    if (!phaseTaskBuckets.has(key)) {
        phaseTaskBuckets.set(key, {
            timeouts: new Set(),
            intervals: new Set(),
            cleanups: new Set()
        });
    }
    return phaseTaskBuckets.get(key);
}

function registerPhaseTimeout(phaseId, callback, delay) {
    const bucket = getPhaseTaskBucket(phaseId);
    const id = setTimeout(() => {
        bucket.timeouts.delete(id);
        callback();
    }, delay);
    bucket.timeouts.add(id);
    return id;
}

function registerPhaseInterval(phaseId, callback, delay) {
    const bucket = getPhaseTaskBucket(phaseId);
    const id = setInterval(callback, delay);
    bucket.intervals.add(id);
    return id;
}

function registerPhaseCleanup(phaseId, cleanup) {
    if (typeof cleanup !== 'function') return cleanup;
    getPhaseTaskBucket(phaseId).cleanups.add(cleanup);
    return cleanup;
}

function clearPhaseTasks(phaseId) {
    const bucket = phaseTaskBuckets.get(String(phaseId));
    if (!bucket) return;

    bucket.timeouts.forEach(clearTimeout);
    bucket.intervals.forEach(clearInterval);
    bucket.cleanups.forEach(cleanup => {
        try {
            cleanup();
        } catch (err) {
            console.error(`[Game] Cleanup failed for phase ${phaseId}`, err);
        }
    });

    bucket.timeouts.clear();
    bucket.intervals.clear();
    bucket.cleanups.clear();
}

function cancelSulfurSetup() {
    sulfurSetupToken += 1;
    if (sulfurSetupTimeout) {
        clearTimeout(sulfurSetupTimeout);
        sulfurSetupTimeout = null;
    }
    if (window.sulfurAntiStuck) {
        Matter.Events.off(physicsEngine, 'beforeUpdate', window.sulfurAntiStuck);
        window.sulfurAntiStuck = null;
    }
}

function cancelVacSetup() {
    vacSetupToken += 1;
    if (vacSetupTimeout) {
        clearTimeout(vacSetupTimeout);
        vacSetupTimeout = null;
    }
}

function cleanupDesalterPhase() {
    clearTimerCollection(desalterTimeouts);
    clearPhysics('desalter-container');
}

function cleanupSulfurPhase() {
    cancelSulfurSetup();
    clearPhysics('sulfur-container');
}

function cleanupVacPhase() {
    cancelVacSetup();
    clearTimerCollection(vacTimeouts);
    clearTimerCollection(vacIntervals);
    clearPhysics('vac-container');
    const oldRestart = document.getElementById('vac-restart-btn');
    if (oldRestart) oldRestart.remove();
}

function cleanupAlkyPhase() {
    clearTimerCollection(typeof alkyIntervals !== 'undefined' ? alkyIntervals : null);
    document.querySelectorAll('.alky-mol, .alky-tar').forEach(e => e.remove());
    if (window.alkyAntiStuck && typeof physicsEngine !== 'undefined') {
        Matter.Events.off(physicsEngine, 'afterUpdate', window.alkyAntiStuck);
        window.alkyAntiStuck = null;
    }
    if (typeof clearPhysics === 'function') clearPhysics('alky-settler');
}

function cleanupLabPhase() {
    if (state.jetTimerInterval) {
        clearInterval(state.jetTimerInterval);
        state.jetTimerInterval = null;
    }
    if (state.ulsdTimerInterval) {
        clearInterval(state.ulsdTimerInterval);
        state.ulsdTimerInterval = null;
    }
    clearTimerCollection(typeof ulsdToteIntervals !== 'undefined' ? ulsdToteIntervals : null);
}

function cleanupPumpSwapPhase() {
    if (typeof pumpGameLoop !== 'undefined' && pumpGameLoop !== null) {
        clearInterval(pumpGameLoop);
        pumpGameLoop = null;
    }
    closePumpProcedurePopup();
}

function cleanupCokerPhase() {
    clearTimerCollection(typeof cokerIntervals !== 'undefined' ? cokerIntervals : null);
    if (typeof isContinuousCoking !== 'undefined') {
        isContinuousCoking = false;
    }
    Matter.Events.off(physicsEngine, 'collisionStart');
    clearPhysics('coker-drum');
}

function cleanupFCCPhase() {
    clearTimerCollection(typeof fccIntervals !== 'undefined' ? fccIntervals : null);
    clearPhysics('fcc-container');
}

function cleanupPipeXrayPhase() {
    cleanupPipeXray();
}

const phaseLifecycle = {
    '1': { enter: setupExtraction },
    'desalter': { enter: setupDesalter, exit: cleanupDesalterPhase },
    '3': { enter: setupSulfurGame, exit: cleanupSulfurPhase },
    'alky': { enter: setupAlky, exit: cleanupAlkyPhase },
    'reformer': { enter: setupReformer },
    'vac': { enter: setupVac, exit: cleanupVacPhase },
    'coker': { enter: setupCoker, exit: cleanupCokerPhase },
    'coker-frac': { enter: setupCokerFrac },
    'fcc': { enter: setupFCC, exit: cleanupFCCPhase },
    '4': { enter: setupMinigame, exit: cleanupLabPhase },
    '5': {
        enter: () => {
            if (!state.product) state.product = 'gasoline';
            updateProductIcon();
        }
    },
    'pipe-xray': { enter: setupPipeXray, exit: cleanupPipeXrayPhase },
    'pump-swap': {
        enter: () => {
            if (!pumpGameLoop) {
                initializePumpSwapSession();
            }
        },
        exit: cleanupPumpSwapPhase
    }
};

function getPhaseScreen(phaseId) {
    return document.getElementById(`phase-${phaseId}`) || (phaseId === 'finale' ? document.getElementById('finale') : null);
}

function assertSingleActiveScreen() {
    debugAssert(document.querySelectorAll('.screen.active').length === 1, 'Exactly one screen should be active.', {
        activeScreens: Array.from(document.querySelectorAll('.screen.active')).map(node => node.id)
    });
}

function measureStageHeight(screenEl) {
    if (!screenEl) return 0;
    return Math.max(screenEl.scrollHeight || 0, screenEl.offsetHeight || 0, screenEl.getBoundingClientRect().height || 0);
}

function lockGameContainerHeight(height) {
    if (!gameContainerEl) return 0;
    const nextHeight = Math.max(
        Math.ceil(height || 0),
        Math.ceil(gameContainerEl.getBoundingClientRect().height || 0),
        Math.ceil(gameContainerEl.scrollHeight || 0)
    );
    if (nextHeight > 0) {
        gameContainerEl.style.minHeight = `${nextHeight}px`;
    }
    stageHeightLockToken += 1;
    return stageHeightLockToken;
}

function releaseGameContainerHeight(lockToken) {
    if (!gameContainerEl || lockToken !== stageHeightLockToken) return;
    const activeScreen = getPhaseScreen(activePhaseId);
    const activeHeight = measureStageHeight(activeScreen);

    if (activeHeight > 0) {
        gameContainerEl.style.minHeight = `${Math.ceil(activeHeight)}px`;
        requestAnimationFrame(() => {
            if (lockToken !== stageHeightLockToken || !gameContainerEl) return;
            gameContainerEl.style.minHeight = '';
        });
        return;
    }

    gameContainerEl.style.minHeight = '';
}

function runPhaseExit(phaseId) {
    if (!phaseId) return;
    clearPhaseTasks(phaseId);
    const definition = phaseLifecycle[phaseId];
    if (definition && typeof definition.exit === 'function') {
        definition.exit();
    }
}

function runPhaseEnter(phaseId, activationToken, options = {}) {
    if (activationToken !== phaseActivationToken || options.skipEnter) return;
    const definition = phaseLifecycle[phaseId];
    if (definition && typeof definition.enter === 'function') {
        definition.enter();
    }
    assertSingleActiveScreen();
}

function showPhase(phaseId, options = {}) {
    const { skipSave = false, skipEnter = false } = options;
    const nextScreen = getPhaseScreen(phaseId);
    if (!nextScreen) {
        debugAssert(false, `Missing target screen for phase ${phaseId}`);
        return;
    }

    const previousPhaseId = activePhaseId;
    const previousScreen = getPhaseScreen(previousPhaseId);
    const heightLockToken = lockGameContainerHeight(measureStageHeight(previousScreen));
    if (phaseTransitionTimeout) {
        clearTimeout(phaseTransitionTimeout);
        phaseTransitionTimeout = null;
    }

    cancelFunFactFlow();

    phaseActivationToken += 1;
    const activationToken = phaseActivationToken;

    state.phase = phaseId;
    syncPhysicsForPhase(phaseId);

    if (!suppressAutosave && !skipSave) {
        saveProgress();
    }

    if (previousPhaseId) {
        runPhaseExit(previousPhaseId);
    }

    screens.forEach(screen => {
        screen.classList.remove('active');
    });

    phaseTransitionTimeout = setTimeout(() => {
        if (activationToken !== phaseActivationToken) return;

        nextScreen.classList.add('active');
        activePhaseId = phaseId;
        phaseTransitionTimeout = null;
        track('level_start', { 'level_name': 'Phase ' + phaseId });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                runPhaseEnter(phaseId, activationToken, { skipEnter });
                requestAnimationFrame(() => {
                    releaseGameContainerHeight(heightLockToken);
                });
            });
        });
    }, 380);
}

/* =========================================
   MAP JUMP
========================================= */
function mapJump(phaseId, defaultProduct) {
    if (mapJumpLocked) return;
    mapJumpLocked = true;
    setMapButtonsDisabled(true);
    setTimeout(() => {
        mapJumpLocked = false;
        setMapButtonsDisabled(false);
    }, MAP_JUMP_LOCK_MS);

    track('map_jump', { 'destination_phase': phaseId });

    physicsEngine.world.gravity.y = 1;
    cancelFunFactFlow();

    if (phaseId === 'pump-swap') {
        startPumpSwap({
            product: defaultProduct || DEFAULT_PUMP_SWAP_ROUTE.product,
            nextPhase: DEFAULT_PUMP_SWAP_ROUTE.nextPhase
        });
        return;
    }

    if (phaseId === 'pipe-xray') {
        startPipeXray({
            product: defaultProduct || DEFAULT_PIPE_XRAY_ROUTE.product,
            nextPhase: DEFAULT_PIPE_XRAY_ROUTE.nextPhase
        });
        return;
    }

    if (defaultProduct) state.product = defaultProduct;

    scrollGameIntoView();
    showPhase(phaseId);
}

/* =========================================

PHASE 1: EXTRACTION (Continuous Volume)

========================================= */

/* =========================================
   PHASE 1: EXTRACTION (Enhanced Visual)
   ========================================= */

const pumpBtn = getEl('pump-btn');
const pumpjack = getEl('pumpjack');
const tankContainer = document.querySelector('.tank-container');
const wellbore = getEl('wellbore');
const pipelinePipe = document.querySelector('.ext-pipeline-pipe');

// Inject our single sloshing volume entity
const crudeVolume = document.createElement('div');
crudeVolume.className = 'slosh-volume';
tankContainer.appendChild(crudeVolume);

// Hide the old static oil level if it's still there
const oldOilLevel = getEl('oil-level');
if (oldOilLevel) oldOilLevel.style.display = 'none';

// --- NEW: Spawn oil bubbles in wellbore ---
function spawnOilBubbles(count) {
    if (!wellbore) return;
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const bubble = document.createElement('div');
            bubble.className = 'ext-oil-bubble';
            bubble.style.left = `${40 + Math.random() * 20}%`;
            bubble.style.animationDuration = `${0.6 + Math.random() * 0.4}s`;
            wellbore.appendChild(bubble);
            // Clean up after animation
            bubble.addEventListener('animationend', () => bubble.remove());
        }, i * 150); // stagger bubbles
    }
}

function setupExtraction() {
    state.clicks = 0;
    const crudeVol = document.querySelector('.slosh-volume');
    if (crudeVol) crudeVol.style.height = '0%';
    const pBtn = getEl('pump-btn');
    if (pBtn) {
        pBtn.disabled = false;
        pBtn.innerText = "Pump to Refinery! (0/5)";
    }
    const pipelinePipe = document.querySelector('.ext-pipeline-pipe');
    if (pipelinePipe) pipelinePipe.classList.remove('flowing');
    const surfacePipe = getEl('surface-pipe');
    if (surfacePipe) surfacePipe.classList.remove('flowing-pulse');
}

function shakeReservoir() {
    const reservoir = getEl('oil-reservoir');
    if (!reservoir) return;
    reservoir.style.transition = 'transform 0.1s';
    reservoir.style.transform = 'translateX(-2px)';
    setTimeout(() => { reservoir.style.transform = 'translateX(2px)'; }, 100);
    setTimeout(() => { reservoir.style.transform = 'translateX(0)'; }, 200);
}

function handlePump() {
    if (state.clicks < 5) {
        state.clicks++;

        // System tracks volume as a simple percentage
        const newVolume = (state.clicks / 5) * 100;
        crudeVolume.style.height = `${newVolume}%`;

        if (pumpBtn) pumpBtn.innerText = `Pump to Refinery! (${state.clicks}/5)`;

        // --- ENHANCED: Pump arm rock animation ---
        if (pumpjack) {
            pumpjack.classList.remove('pumping');
            void pumpjack.offsetWidth;
            pumpjack.classList.add('pumping');
        }

        // --- NEW: Visual feedback per tap ---
        spawnOilBubbles(3);       // Oil bubbles rise through wellbore
        shakeReservoir();         // Reservoir trembles

        // Send oil pulse through surface pipe
        const surfacePipe = getEl('surface-pipe');
        if (surfacePipe) {
            surfacePipe.classList.remove('flowing-pulse');
            void surfacePipe.offsetWidth; // force reflow to restart animation
            surfacePipe.classList.add('flowing-pulse');
        }

        if (state.clicks === 5) {
            markUnitComplete('extraction');
            if (pumpBtn) {
                pumpBtn.disabled = true;
                pumpBtn.innerText = "Tank Full!";
            }

            // --- NEW: Activate pipeline flow animation ---
            if (pipelinePipe) pipelinePipe.classList.add('flowing');

            registerPhaseTimeout('1', () => {
                showFunFact('extraction', () => {
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

    // Clean up any old game loops (defensive: clear both timeout + interval ids)
    desalterTimeouts.forEach(id => {
        clearTimeout(id);
        clearInterval(id);
    });
    desalterTimeouts = [];

    container.innerHTML = '';
    container.style.borderColor = 'var(--color-gray-400)';
    statusEl.style.color = 'var(--color-navy)';

    if (toTowerBtn) toTowerBtn.classList.add('hidden');
    if (restartBtn) restartBtn.classList.add('hidden');

    let health = 3;
    let oilZapped = 0;   // Tracks bad zaps
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

    // 2. The Gameplay Loop (randomized spawn interval + 6s survive timer)
    function startGameplay() {
        const minMs = 300; // fastest spawn
        const maxMs = 900; // slowest spawn

        function scheduleNextSpawn() {
            if (isGameOver) return;

            const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

            const t = setTimeout(() => {
                if (isGameOver) return;
                spawnDrop();
                scheduleNextSpawn();
            }, delay);

            desalterTimeouts.push(t);
        }

        scheduleNextSpawn();

        // Win condition: survive for 8 seconds
        const gameTimer = setTimeout(() => {
            if (isGameOver) return;

            isGameOver = true;
            statusEl.innerText = 'Success! Grid cleared! ✅';
            statusEl.style.color = '#2e7d32';
            markUnitComplete('desalter');

            // Stop any future spawns and clear remaining drops
            desalterTimeouts.forEach(id => {
                clearTimeout(id);
                clearInterval(id);
            });

            container.querySelectorAll('.flowing-drop').forEach(el => el.remove());
            if (toTowerBtn) toTowerBtn.classList.remove('hidden');
        }, 8000);
        desalterTimeouts.push(gameTimer);
    }

    // 3. Spawning and Movement Logic (with speed tiers, ultra-fast excluded for oil)
    function spawnDrop() {
        if (isGameOver) return;

        const drop = document.createElement('div');
        drop.className = 'desalter-drop flowing-drop interactive-element';

        // Randomize Drop Type (roughly 35/35/30)
        const rand = Math.random();
        let type = '';
        if (rand < 0.35) { drop.innerText = '💧'; type = 'water'; }
        else if (rand < 0.70) { drop.innerText = '🧂'; type = 'salt'; }
        else { drop.innerText = '⚫️'; type = 'oil'; }

        // Randomize Drop Speed (fair for 6s round + your flowDiagonal distance)
        // Ultra-fast applies only to salt/water so oil doesn't feel "cheap"
        const rSpeed = Math.random();
        let duration;

        const allowUltra = (type !== 'oil');

        if (allowUltra && rSpeed < 0.05) {
            // 5% spike-fast (salt/water only) — slowed down for fairness
            duration = 0.90 + Math.random() * 0.20; // 0.90s to 1.10s
            drop.classList.add('ultra-fast');
        } else if (rSpeed < 0.25) {
            // next 20% fast
            duration = 1.10 + Math.random() * 0.30; // 1.10s to 1.40s
            drop.classList.add('fast');
        } else {
            // 75% normal
            duration = 1.35 + Math.random() * 0.95; // 1.35s to 2.30s
        }

        drop.style.animationDuration = duration + 's';

        // Start at bottom left
        drop.style.bottom = (5 + Math.random() * 20) + 'px';
        drop.style.left = (5 + Math.random() * 20) + 'px';

        // Inject dynamic end coordinates
        const endX = 160 + Math.random() * 40;
        const endY = -160 - Math.random() * 40;
        drop.style.setProperty('--endX', endX + 'px');
        drop.style.setProperty('--endY', endY + 'px');

        let isZapped = false;

        // Tap Hit Logic
        onTap(drop, function () {
            if (isGameOver || isZapped) return;

            isZapped = true;
            this.style.animationPlayState = 'paused';
            this.style.pointerEvents = 'none';

            if (type === 'oil') {
                this.innerText = '❌'; // bad zap
                oilZapped++;
                if (oilZapped >= 2) triggerOilFail();
            } else {
                this.innerText = '⚡';
            }

            const rm = setTimeout(() => this.remove(), 200);
            desalterTimeouts.push(rm);
        });

        // Escape Logic
        drop.addEventListener('animationend', () => {
            if (isGameOver || isZapped) return;

            drop.remove();
            if (type !== 'oil') takeDamage(); // damage only if salt or water escapes
        });

        container.appendChild(drop);
    }

    // 4. Failure Logic (Standard)
    function takeDamage() {
        if (isGameOver) return;

        health--;
        updateHealth();

        container.style.borderColor = 'var(--color-red)';
        const flash = setTimeout(() => {
            if (!isGameOver && container) container.style.borderColor = 'var(--color-gray-400)';
        }, 200);
        desalterTimeouts.push(flash);

        if (health <= 0) {
            isGameOver = true;

            desalterTimeouts.forEach(id => {
                clearTimeout(id);
                clearInterval(id);
            });

            statusEl.innerText = '🚨 DESALTER UPSET! You let the salt through! 🚨';
            statusEl.style.color = 'var(--color-red)';
            container.style.borderColor = 'var(--color-red)';

            container.querySelectorAll('.flowing-drop').forEach(el => el.style.animationPlayState = 'paused');
            if (restartBtn) restartBtn.classList.remove('hidden');
        }
    }

    // 5. Specific Failure (Wastewater Upset)
    function triggerOilFail() {
        if (isGameOver) return;

        isGameOver = true;

        desalterTimeouts.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });

        statusEl.innerText = '🚨 You’ve sent oil with the water and upset waste water! Only reject the salt and water! 🚨';
        statusEl.style.color = 'var(--color-red)';
        container.style.borderColor = 'var(--color-red)';

        container.querySelectorAll('.flowing-drop').forEach(el => el.style.animationPlayState = 'paused');
        if (restartBtn) restartBtn.classList.remove('hidden');
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
    markUnitComplete('distillation');

    // Product-specific fun fact before next phase
    let factKey = 'distillation_' + product;

    // Special case: Gasoline selected from FCC Fractionator
    if (product === 'gasoline' && state.phase === 'fcc') {
        factKey = 'fcc_gasoline';
    }

    if (product === 'resid') {
        showFunFact(factKey, () => {
            showPhase('vac');
        });
    } else if (product === 'jetfuel') {
        showFunFact(factKey, () => {
            startPumpSwap({ product: 'jetfuel', nextPhase: '3' });
        });
    } else if (product === 'diesel') {
        showFunFact(factKey, () => {
            startPipeXray({ product: 'diesel', nextPhase: '3' });
        });
    } else {
        if (product === 'gasoline') state.product = 'gasoline';
        showFunFact(factKey, () => {
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

    // Clear any stuck inline styles so CSS can handle the sizing naturally
    container.style.width = '';
    container.style.height = '';

    if (cleaningText) {
        const prodName = state.product || 'Fuel';
        cleaningText.innerHTML = `Your <strong>${prodName.toUpperCase()}</strong> contains sulfur impurities! Tap the yellow sulfur atoms to remove them!`;
    }

    container.innerHTML = '';
    state.itemsLeft = 7;
    cancelSulfurSetup();
    clearPhysics('sulfur-container');
    const setupToken = ++sulfurSetupToken;

    const toProcessingBtn = getEl('to-processing-btn');
    if (toProcessingBtn) toProcessingBtn.classList.add('hidden');

    // TURN OFF GRAVITY so they bounce instead of waterfalling
    physicsEngine.world.gravity.y = 0;
    removeStaticBodies('sulfur-container');

    if (sulfurSetupTimeout) clearTimeout(sulfurSetupTimeout);
    sulfurSetupTimeout = setTimeout(() => {
        if (setupToken !== sulfurSetupToken || state.phase !== '3') return;
        waitForSize(container, 180, () => {
            if (setupToken !== sulfurSetupToken || state.phase !== '3') return;
            const w = Math.max(container.clientWidth, 220);
            const h = Math.max(container.clientHeight, 220);
            const s = Math.min(w / 220, h / 220);

            const sulfurBodies = [];
            let currentSpeed = Math.max(3.5, Math.min(7.0, 4 * s));

            for (let i = 0; i < 7; i++) {
                const blobEl = document.createElement('div');
                blobEl.className = 'physics-body interactive-element';
                blobEl.style.fontSize = '2.5rem';
                blobEl.innerText = '🟡';
                container.appendChild(blobEl);

                const r = Math.max(16, Math.min(26, 20 * s));
                const margin = r * 2;

                const sx = margin + Math.random() * (w - margin * 2);
                const sy = margin + Math.random() * (h - margin * 2);

                const blobBody = Bodies.circle(sx, sy, r, {
                    restitution: 1.05,
                    friction: 0,
                    frictionAir: 0,
                    frictionStatic: 0,
                    containerId: 'sulfur-container'
                });

                blobBody.domElement = blobEl;
                sulfurBodies.push(blobBody);

                Matter.Body.setVelocity(blobBody, {
                    x: (Math.random() > 0.5 ? 1 : -1) * currentSpeed,
                    y: (Math.random() > 0.5 ? 1 : -1) * currentSpeed
                });

                World.add(physicsEngine.world, blobBody);

                onTap(blobEl, function () {
                    this.innerText = '💨';
                    this.style.pointerEvents = 'none';
                    World.remove(physicsEngine.world, blobBody);

                    const index = sulfurBodies.indexOf(blobBody);
                    if (index > -1) sulfurBodies.splice(index, 1);

                    // SPEED UP REMAINING MOLECULES
                    currentSpeed *= 1.15;

                    sulfurBodies.forEach(b => {
                        const speed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
                        if (speed > 0) {
                            Matter.Body.setVelocity(b, {
                                x: (b.velocity.x / speed) * currentSpeed,
                                y: (b.velocity.y / speed) * currentSpeed
                            });
                        }
                    });

                    setTimeout(() => this.remove(), 300);
                    state.itemsLeft--;

                    if (state.itemsLeft === 0) {
                        markUnitComplete('hydrotreating');
                        // Restore gravity for the other minigames
                        physicsEngine.world.gravity.y = 1;
                        setTimeout(() => {
                            if (toProcessingBtn) toProcessingBtn.classList.remove('hidden');
                        }, 300);
                    }
                });
            }

            // THE DYNAMIC ELLIPTICAL BOUNDARY (Anti-Stuck)
            window.sulfurAntiStuck = function () {
                if (setupToken !== sulfurSetupToken || state.phase !== '3') return;
                const cw = container.clientWidth || 220;
                const ch = container.clientHeight || 220;
                const cx = cw / 2;
                const cy = ch / 2;
                const rx = (cw / 2) - 24;
                const ry = (ch / 2) - 24;

                sulfurBodies.forEach(body => {
                    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
                    if (speed < currentSpeed * 0.8) {
                        const f = 0.005;
                        Matter.Body.applyForce(body, body.position, {
                            x: (Math.random() - 0.5) * f,
                            y: (Math.random() - 0.5) * f
                        });
                    }

                    const dx = body.position.x - cx;
                    const dy = body.position.y - cy;

                    if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) {
                        const normalX = dx / (rx * rx);
                        const normalY = dy / (ry * ry);
                        const len = Math.sqrt(normalX * normalX + normalY * normalY);
                        const nx = normalX / len;
                        const ny = normalY / len;

                        const dotProduct = body.velocity.x * nx + body.velocity.y * ny;

                        if (dotProduct > 0) {
                            Matter.Body.setVelocity(body, {
                                x: body.velocity.x - 2 * dotProduct * nx,
                                y: body.velocity.y - 2 * dotProduct * ny
                            });
                        }

                        Matter.Body.setPosition(body, {
                            x: body.position.x - nx * 2,
                            y: body.position.y - ny * 2
                        });
                    }
                });
            };

            Matter.Events.on(physicsEngine, 'beforeUpdate', window.sulfurAntiStuck);

            debugAssert(sulfurBodies.length === 7, 'Sulfur game should spawn exactly 7 sulfur atoms.', {
                phase: state.phase,
                spawned: sulfurBodies.length
            });
            sulfurSetupTimeout = null;
        });
    }, 30);
}


function startProcessing() {
    showFunFact('sulfur', () => {
        if (state.product === 'lpg') {
            showPhase('alky');
        } else if (state.product === 'naphtha') {
            showPhase('reformer');
        } else {
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

    if (typeof alkyIntervals !== 'undefined' && Array.isArray(alkyIntervals)) {
        alkyIntervals.forEach(item => {
            if (typeof item === 'function') item();
            else { clearTimeout(item); clearInterval(item); }
        });
        alkyIntervals.length = 0;
    } else {
        alkyIntervals = []; // fallback init if somehow undefined
    }
    document.querySelectorAll('.alky-mol, .alky-tar').forEach(e => e.remove());

    if (doneBtn) doneBtn.classList.add('hidden');
    if (restartBtn) restartBtn.classList.add('hidden');

    let purity = 95;
    let moleculesCombined = 0;
    const targetMolecules = 5;
    let isGameOver = false;

    purityEl.innerText = `Acid Purity: ${purity}%`;
    purityEl.style.color = '#2e7d32';

    // 1. 3-Second Startup Countdown
    let countdown = 3;
    progressEl.innerText = ` Alky Upset! ${countdown}`;
    progressEl.style.color = '#c53030';

    const countInt = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            progressEl.innerText = `Alky Upset! ${countdown}`;
        } else {
            clearInterval(countInt);
            if (isGameOver) return;

            progressEl.innerText = ` Alkylate: 0/${targetMolecules}`;
            progressEl.style.color = 'var(--color-navy)';
            startGameplay();
        }
    }, 1000);
    alkyIntervals.push(countInt);

    function startGameplay() {

        // Force player to engage ASO mechanic immediately —
        // one tar blob pre-spawned already settled at the bottom
        spawnTar(true);

        // Delay first molecule until player has had a moment to see the tar
        setTimeout(() => spawnMolecule(), 1800);
        setTimeout(() => spawnMolecule(), 2400);

        function spawnTar(preSettled = false) {
            if (isGameOver) return;
            const activeTar = settler.querySelectorAll('.alky-tar').length;
            if (activeTar >= 3) return;
            const tar = document.createElement('div');
            tar.className = 'alky-tar interactive-element';
            tar.innerText = '🟤';

            let currentTop = preSettled ? 72 : 0;
            let isDragging = false;

            // Land a little earlier on average (slightly tighter floor band)
            const randomFloor = 70 + Math.random() * 12; // 70% to 82%
            let currentLeft = 10 + Math.random() * 60;

            tar.style.top = currentTop + '%';
            tar.style.left = currentLeft + '%';
            settler.appendChild(tar);

            // Faster fall: was 0.6 per 50ms (~12%/sec). Now ~18%/sec.
            // Converted to RAF for smooth 60fps rendering
            let lastTime = performance.now();
            let rafId = null;

            function fall(time) {
                if (isGameOver || !tar.parentNode) {
                    cancelAnimationFrame(rafId);
                    return;
                }

                const delta = time - lastTime;
                lastTime = time;

                if (!isDragging) {
                    // Speed: 30% per second
                    currentTop += (30 * delta) / 1000;
                    if (currentTop > randomFloor) currentTop = randomFloor;
                    tar.style.top = currentTop + '%';
                }

                rafId = requestAnimationFrame(fall);
            }

            rafId = requestAnimationFrame(fall);

            // Push a cleanup function instead of an interval ID
            alkyIntervals.push(() => cancelAnimationFrame(rafId));

            tar.addEventListener('pointerdown', function (e) {
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

                    const regenRect = regen.getBoundingClientRect();
                    const tarRect = tar.getBoundingClientRect();

                    if (tarRect.right > regenRect.left &&
                        tarRect.bottom > regenRect.top &&
                        tarRect.left < regenRect.right &&
                        tarRect.top < regenRect.bottom) {

                        tar.remove();
                        purity = Math.min(100, purity + 2.5);
                        updatePurityUI();
                    } else {
                        const rect = getEl('alky-system').getBoundingClientRect();
                        let dropX = e.clientX - rect.left - 20;
                        let dropY = e.clientY - rect.top - 20;

                        currentLeft = (dropX / rect.width) * 100;
                        currentTop = (dropY / rect.height) * 100;

                        tar.style.left = currentLeft + '%';
                        tar.style.top = currentTop + '%';
                    }
                }

                tar.addEventListener('pointermove', onMove);
                tar.addEventListener('pointerup', onUp);
            });

            const decay = setInterval(() => {
                if (isGameOver || !tar.parentNode) {
                    clearInterval(decay);
                    return;
                }
                if (currentTop >= 65) {
                    purity -= 1;
                    updatePurityUI();
                }
            }, 1000);
            alkyIntervals.push(decay);

        }

        const tarInterval = setInterval(() => spawnTar(), 2400);
        alkyIntervals.push(tarInterval);

        // 3. Spawn Reaction Molecules
        function spawnMolecule() {
            if (isGameOver) return;
            const mol = document.createElement('div');
            mol.className = 'alky-mol interactive-element';
            mol.innerText = '🫧🫧';

            mol.style.top = (25 + Math.random() * 40) + '%';
            mol.style.left = (5 + Math.random() * 60) + '%';

            settler.appendChild(mol);

            onTap(mol, function () {
                if (isGameOver) return;
                this.innerText = '🟡';
                this.style.pointerEvents = 'none';

                this.style.transition = 'top 1s ease-in-out';
                this.style.top = '5%';

                moleculesCombined++;
                progressEl.innerText = `Alkylate: ${moleculesCombined}/${targetMolecules}`;

                setTimeout(() => this.remove(), 1000);

                if (moleculesCombined >= targetMolecules) {
                    triggerWin();
                } else {
                    setTimeout(spawnMolecule, 2000);
                }
            });
        }

        function updatePurityUI() {
            if (isGameOver) return;
            purityEl.innerText = `Acid Purity: ${purity}%`;

            if (purity < 85) purityEl.style.color = '#c53030';
            else if (purity < 90) purityEl.style.color = '#dd6b20';
            else purityEl.style.color = '#2e7d32';

            if (purity <= 80) triggerLoss();
        }

        function triggerWin() {
            isGameOver = true;
            markUnitComplete('alky');
            alkyIntervals.forEach(clearInterval);
            progressEl.innerText = " Feed Stablized! ✅";
            progressEl.style.color = '#2e7d32';
            if (doneBtn) doneBtn.classList.remove('hidden');
        }

        function triggerLoss() {
            isGameOver = true;
            alkyIntervals.forEach(clearInterval);
            purityEl.innerText = "🚨 PURITY TOO LOW! Acid runaway conditions detected, automatic shutodown activated!🚨";
            purityEl.style.color = '#c53030';
            if (restartBtn) restartBtn.classList.remove('hidden');
        }
    }
}


/* =========================================
   CATALYTIC REFORMER
========================================= */
// =============================================================================
function setupReformer() {
    const container = getEl('reformer-container');
    if (!container) return;
    container.innerHTML = '';
    const doneBtn = getEl('reformer-done-btn');
    if (doneBtn) doneBtn.classList.add('hidden');

    // ── MOLECULE SEQUENCE ──────────────────────────────────────────────────
    const MOLECULES = [
        {
            id: 'benzene',
            name: 'Benzene',
            formula: 'C₆H₆',
            feedEmoji: '〰️',
            ringEmoji: '⬡',
            sweetMin: 45,
            sweetMax: 65,
            octane: 99,
            fact: '⬡ Benzene forms first — it\'s the simplest aromatic ring. Naphthenes (ring-shaped naphtha molecules) reform most easily and at the lowest temperature, releasing 3 hydrogen molecules per conversion.',
            tempLabel: '~900°F'
        },
        {
            id: 'toluene',
            name: 'Toluene',
            formula: 'C₇H₈',
            feedEmoji: '〰️〰️',
            ringEmoji: '⬡•',
            sweetMin: 52,
            sweetMax: 68,
            octane: 103,
            fact: '⬡• Toluene needs a bit more heat than benzene. It\'s a key blending component worth more than gasoline by itself — refineries can sell it directly into petrochemical markets for plastics and solvents.',
            tempLabel: '~930°F'
        },
        {
            id: 'xylene',
            name: 'Xylene',
            formula: 'C₈H₁₀',
            feedEmoji: '〰️〰️〰️',
            ringEmoji: '•⬡•',
            sweetMin: 65,
            sweetMax: 80,
            octane: 117,
            fact: '•⬡• Xylene has the highest octane of the three and the narrowest reforming window. It\'s also a critical feedstock for PET plastic bottles — the refinery\'s reformer is directly connected to your water bottle.',
            tempLabel: '~960°F'
        }
    ];

    const CRACK_THRESHOLD = 82;   // above this = cracking
    const DRAIN_RATE = 15;       // temp units lost per second during reaction
    const PREHEAT_DRAIN = 10.0;    // temp units lost per second before timer
    const TAP_BOOST = 15;         // temp added per tap
    const TIMER_DURATION = 7;    // seconds per conversion
    const DISPLAY_TEMP_MIN = 750; // °F shown at temp=0
    const DISPLAY_TEMP_MAX = 1040; // °F shown at temp=100

    let currentMolIdx = 0;
    let temp = 0;               // 0–100 normalized
    let timerLeft = TIMER_DURATION;
    let timerRunning = false;
    let timerInterval = null;
    let drainInterval = null;
    let isConverting = false;
    let h2Total = 0;            // 0–100 percent
    let resultsLog = [];        // track outcomes

    // ── BUILD UI ───────────────────────────────────────────────────────────
    container.innerHTML = `
    <div class="rfm-wrapper">

        <div class="rfm-header">
            <div class="rfm-title">⚗️ Catalytic Reformer</div>
            <div class="rfm-h2-bar-wrapper">
                <span class="rfm-h2-label">H₂</span>
                <div class="rfm-h2-track">
                    <div class="rfm-h2-fill" id="rfm-h2-fill"></div>
                </div>
                <span class="rfm-h2-pct" id="rfm-h2-pct">0%</span>
            </div>
        </div>

        <!-- Molecule display -->
        <div class="rfm-mol-zone" id="rfm-mol-zone">
            <div class="rfm-mol-feed" id="rfm-mol-feed"></div>
            <div class="rfm-arrow">→</div>
            <div class="rfm-reactor-icon">⚙️</div>
            <div class="rfm-arrow">→</div>
            <div class="rfm-mol-product" id="rfm-mol-product">?</div>
        </div>

        <!-- Step indicator -->
        <div class="rfm-steps">
            <div class="rfm-step" id="rfm-step-0">⬡<small>Benzene</small></div>
            <div class="rfm-step" id="rfm-step-1">⬡•<small>Toluene</small></div>
            <div class="rfm-step" id="rfm-step-2">•⬡•<small>Xylene</small></div>
        </div>

        <!-- Temperature gauge -->
        <div class="rfm-gauge-section">
            <div class="rfm-gauge-labels">
                <span>Cold</span>
                <span id="rfm-temp-display">750°F</span>
                <span>Cracking</span>
            </div>
            <div class="rfm-gauge-track" id="rfm-gauge-track">
                <!-- Sweet spot zone, positioned by JS -->
                <div class="rfm-sweet-zone" id="rfm-sweet-zone"></div>
                <!-- Temperature needle -->
                <div class="rfm-needle" id="rfm-needle" style="left:0%"></div>
            </div>
            <div class="rfm-zone-hints">
                <span class="rfm-zone-cold">❄️ Too Cold</span>
                <span class="rfm-zone-sweet" id="rfm-zone-sweet-label">⚗️ Reform Zone</span>
                <span class="rfm-zone-hot">🔥 Cracking</span>
            </div>
        </div>

        <!-- Conversion timer -->
        <div class="rfm-timer-row">
            <span class="rfm-timer-label">Conversion in:</span>
            <div class="rfm-timer-track">
                <div class="rfm-timer-fill" id="rfm-timer-fill" style="width:100%"></div>
            </div>
            <span class="rfm-timer-val" id="rfm-timer-val">—</span>
        </div>

        <!-- Status message -->
        <div class="rfm-status" id="rfm-status">
            Cold system — tap the furnace to heat up!
        </div>

        <!-- TAP BUTTON -->
        <button class="btn rfm-tap-btn interactive-element" id="rfm-tap-btn">
            🔥 Fire Furnace
        </button>

        <!-- Mini fact (hidden until between molecules) -->
        <div class="rfm-fact-card hidden" id="rfm-fact-card">
            <div class="rfm-fact-emoji" id="rfm-fact-emoji"></div>
            <p class="rfm-fact-text" id="rfm-fact-text"></p>
            <button class="btn rfm-fact-next interactive-element" id="rfm-fact-next">Next →</button>
        </div>

    </div>
`;

    // ── ELEMENT REFS ───────────────────────────────────────────────────────
    const molFeed = getEl('rfm-mol-feed');
    const molProduct = getEl('rfm-mol-product');
    const needle = getEl('rfm-needle');
    const sweetZone = getEl('rfm-sweet-zone');
    const tempDisplay = getEl('rfm-temp-display');
    const timerFill = getEl('rfm-timer-fill');
    const timerVal = getEl('rfm-timer-val');
    const statusEl = getEl('rfm-status');
    const tapBtn = getEl('rfm-tap-btn');
    const factCard = getEl('rfm-fact-card');
    const factEmoji = getEl('rfm-fact-emoji');
    const factText = getEl('rfm-fact-text');
    const factNext = getEl('rfm-fact-next');
    const h2Fill = getEl('rfm-h2-fill');
    const h2Pct = getEl('rfm-h2-pct');

    // ── HELPERS ────────────────────────────────────────────────────────────

    function displayTemp(t) {
        return Math.round(DISPLAY_TEMP_MIN + (t / 100) * (DISPLAY_TEMP_MAX - DISPLAY_TEMP_MIN));
    }

    function updateGauge() {
        const clamped = Math.max(0, Math.min(100, temp));
        if (needle) needle.style.left = clamped + '%';
        if (tempDisplay) tempDisplay.textContent = displayTemp(clamped) + '°F';

        // Needle color
        const mol = MOLECULES[currentMolIdx];
        if (clamped > CRACK_THRESHOLD) {
            needle.style.background = '#c53030';
        } else if (clamped >= mol.sweetMin && clamped <= mol.sweetMax) {
            needle.style.background = '#48bb78';
        } else {
            needle.style.background = '#3182ce';
        }
    }

    function updateSweetZone(mol) {
        if (!sweetZone) return;
        sweetZone.style.left = mol.sweetMin + '%';
        sweetZone.style.width = (mol.sweetMax - mol.sweetMin) + '%';
        const sweetLabel = getEl('rfm-zone-sweet-label');
        if (sweetLabel) sweetLabel.textContent = `⚗️ ${mol.tempLabel}`;
    }

    function updateH2(amount) {
        h2Total = Math.min(100, h2Total + amount);
        if (h2Fill) h2Fill.style.width = h2Total + '%';
        if (h2Pct) h2Pct.textContent = Math.round(h2Total) + '%';
    }

    function updateStepIndicator() {
        MOLECULES.forEach((_, i) => {
            const stepEl = getEl(`rfm-step-${i}`);
            if (!stepEl) return;
            if (i < currentMolIdx) {
                stepEl.className = 'rfm-step rfm-step--done';
            } else if (i === currentMolIdx) {
                stepEl.className = 'rfm-step rfm-step--active';
            } else {
                stepEl.className = 'rfm-step';
            }
        });
    }

    function setStatus(msg, color) {
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.style.color = color || 'var(--color-navy)';
        }
    }

    // ── LOAD MOLECULE ──────────────────────────────────────────────────────

    function loadMolecule(idx) {
        if (idx >= MOLECULES.length) {
            finishGame();
            return;
        }
        currentMolIdx = idx;
        const mol = MOLECULES[idx];

        // Reset state for this molecule
        timerLeft = TIMER_DURATION;
        timerRunning = false;
        isConverting = false;
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

        // Update visuals
        if (molFeed) molFeed.textContent = mol.feedEmoji;
        if (molProduct) { molProduct.textContent = '?'; molProduct.className = 'rfm-mol-product'; }
        if (timerFill) timerFill.style.width = '100%';
        if (timerFill) timerFill.style.background = '#48bb78';
        if (timerVal) timerVal.textContent = '—';

        updateSweetZone(mol);
        updateStepIndicator();
        setStatus(`Heat to ${mol.tempLabel} — fire the furnace to start the reaction!`);

        // Start preheat drain (slower leak when not reacting)
        startDrain(PREHEAT_DRAIN);
    }

    // ── TEMPERATURE DRAIN ──────────────────────────────────────────────────

    function startDrain(rate) {
        if (drainInterval) clearInterval(drainInterval);
        drainInterval = setInterval(() => {
            if (isConverting) return; // drain handled by timer loop
            temp = Math.max(0, temp - rate / 10);
            updateGauge();
        }, 100);
    }

    // ── TAP HANDLER ────────────────────────────────────────────────────────

    tapBtn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (isConverting && timerLeft <= 0) return;

        temp = Math.min(100, temp + TAP_BOOST);
        updateGauge();

        // Flash the tap button
        this.style.transform = 'scale(0.94)';
        setTimeout(() => { this.style.transform = ''; }, 100);

        const mol = MOLECULES[currentMolIdx];

        // Check if we just entered the sweet spot for the first time this molecule
        if (!timerRunning && !isConverting && temp >= mol.sweetMin && temp <= mol.sweetMax) {
            startConversionTimer();
        }

        // Status feedback
        if (temp > CRACK_THRESHOLD) {
            setStatus(`🔥 Too hot! Cracking reaction starting!`, '#c53030');
        } else if (temp >= mol.sweetMin && temp <= mol.sweetMax) {
            setStatus(`⚗️ In the zone! Hold it here — conversion in ${timerLeft}s`, '#2e7d32');
        } else if (temp < mol.sweetMin) {
            setStatus(`Keep heating — need ${displayTemp(mol.sweetMin)}°F to start reaction`, '#3182ce');
        }
    });

    // ── CONVERSION TIMER ───────────────────────────────────────────────────

    function startConversionTimer() {
        timerRunning = true;
        isConverting = true;
        if (drainInterval) { clearInterval(drainInterval); drainInterval = null; }
        if (timerVal) timerVal.textContent = timerLeft + 's';

        timerInterval = setInterval(() => {
            // Apply endothermic drain each tick
            temp = Math.max(0, temp - DRAIN_RATE / 10);
            updateGauge();

            timerLeft -= 0.1;
            const pct = Math.max(0, (timerLeft / TIMER_DURATION) * 100);
            if (timerFill) timerFill.style.width = pct + '%';
            if (timerFill) {
                timerFill.style.background = timerLeft > 3.5 ? '#48bb78' : timerLeft > 1.5 ? '#f59e0b' : '#c53030';
            }
            if (timerVal) timerVal.textContent = Math.ceil(timerLeft) + 's';

            // Update status during conversion
            const mol = MOLECULES[currentMolIdx];
            if (temp > CRACK_THRESHOLD) {
                setStatus(`🔥 Overheating! Back off or it will crack!`, '#c53030');
            } else if (temp >= mol.sweetMin) {
                setStatus(`⚗️ Good — hold the temperature! ${Math.ceil(timerLeft)}s remaining`, '#2e7d32');
            } else {
                setStatus(`❄️ Temperature dropping — tap to maintain heat! ${Math.ceil(timerLeft)}s`, '#e67e22');
            }

            if (timerLeft <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                evaluateConversion();
            }
        }, 100);
    }

    // ── EVALUATE CONVERSION ────────────────────────────────────────────────

    function evaluateConversion() {
        const mol = MOLECULES[currentMolIdx];
        isConverting = false;
        if (tapBtn) tapBtn.disabled = true;

        let outcome, outcomeClass, statusMsg, statusColor, h2Award;

        if (temp > CRACK_THRESHOLD) {
            // CRACKED
            outcome = 'cracked';
            outcomeClass = 'rfm-mol-product--cracked';
            statusMsg = `💥 Cracked! Overheating broke ${mol.name} into fragments — hydrocarbon gas lost instead of useful aromatics.`;
            statusColor = '#c53030';
            h2Award = 5;
            if (molProduct) { molProduct.textContent = '💥'; }
        } else if (temp >= mol.sweetMin) {
            // PERFECT AROMATIC
            outcome = 'aromatic';
            outcomeClass = 'rfm-mol-product--aromatic';
            statusMsg = `✅ ${mol.name} formed! ${mol.formula} — ${mol.octane} RON. Hydrogen released to the hydrotreater.`;
            statusColor = '#2e7d32';
            h2Award = 33;
            if (molProduct) { molProduct.textContent = mol.ringEmoji; }
        } else {
            // TOO COLD — no ring closure
            outcome = 'cold';
            outcomeClass = 'rfm-mol-product--cold';
            statusMsg = `❄️ No ring closure — temperature dropped too low before conversion completed. Naphtha passed through unreformed.`;
            statusColor = '#3182ce';
            h2Award = 8;
            if (molProduct) { molProduct.textContent = '〰️'; }
        }

        if (molProduct) molProduct.className = 'rfm-mol-product ' + outcomeClass;
        setStatus(statusMsg, statusColor);
        updateH2(h2Award);
        resultsLog.push(outcome);

        // Show fact card after short delay, then load next molecule
        setTimeout(() => showFactCard(mol, outcome), 1400);
    }

    // ── FACT CARD BETWEEN MOLECULES ────────────────────────────────────────

    function showFactCard(mol, outcome) {
        if (!factCard) return;

        factCard.classList.remove('hidden');
        if (tapBtn) tapBtn.classList.add('hidden');

        if (factEmoji) factEmoji.textContent = mol.ringEmoji;
        if (factText) factText.textContent = mol.fact;

        if (factNext) {
            factNext.onclick = () => {
                factCard.classList.add('hidden');
                if (tapBtn) {
                    tapBtn.classList.remove('hidden');
                    tapBtn.disabled = false;
                }
                loadMolecule(currentMolIdx + 1);
            };
        }
    }

    // ── FINISH GAME ────────────────────────────────────────────────────────

    function finishGame() {
        if (drainInterval) { clearInterval(drainInterval); drainInterval = null; }
        if (tapBtn) tapBtn.classList.add('hidden');

        // Build completion message based on results
        const aromatics = resultsLog.filter(r => r === 'aromatic').length;
        const cracked = resultsLog.filter(r => r === 'cracked').length;

        let finishMsg;
        if (aromatics === 3) {
            finishMsg = `🏆 Perfect run! All three aromatics formed cleanly. Maximum H₂ produced — the hydrotreater thanks you.`;
        } else if (aromatics >= 2) {
            finishMsg = `✅ Good run — ${aromatics}/3 aromatics formed. Reformate quality is solid, H₂ production adequate.`;
        } else if (cracked >= 2) {
            finishMsg = `⚠️ Heavy cracking — most of the feed was destroyed. Real operators get fired for this.`;
        } else {
            finishMsg = `📉 Low conversion — reformate will be low octane. The blender will have to compensate.`;
        }

        setStatus(finishMsg, aromatics >= 2 ? '#2e7d32' : '#c53030');

        // Update step indicators to show completion
        markUnitComplete('reformer');
        MOLECULES.forEach((_, i) => {
            const stepEl = getEl(`rfm-step-${i}`);
            if (stepEl) stepEl.className = 'rfm-step rfm-step--done';
        });

        // Show done button after a beat
        setTimeout(() => {
            if (doneBtn) doneBtn.classList.remove('hidden');
        }, 1000);
    }

    // ── INITIALIZE FIRST MOLECULE ──────────────────────────────────────────
    loadMolecule(0);

}
function routeToGasoline() {
    // Pick fun fact based on the unit screen we are leaving
    let factKey = null;

    if (state.phase === 'alky') factKey = 'alky';
    else if (state.phase === 'reformer') factKey = 'reformer';
    else if (state.phase === 'fcc') factKey = 'fcc';     // <-- handle FCC explicitly
    // else factKey stays null (no fun fact)

    const goBlend = () => {
        state.product = 'gasoline';
        showPhase('4');
    };

    // If we have a fact, show it; otherwise just proceed.
    if (factKey) showFunFact(factKey, goBlend);
    else goBlend();
}
/* =========================================
   VACUUM TOWER (Zero-Gravity Leak Minigame)
========================================= */
function setupVac() {
    const container = getEl('vac-container');
    const choices = getEl('vac-choices');
    let status = document.getElementById('vac-status');

    if (!container) return;

    // DESTROY ANY LEFTOVER RESTART BUTTONS FIRST
    const oldRestart = document.getElementById('vac-restart-btn');
    if (oldRestart) oldRestart.remove();

    // Clean up previous runs
    cancelVacSetup();
    vacTimeouts.forEach(clearTimeout);
    vacIntervals.forEach(clearInterval);
    vacTimeouts = [];
    vacIntervals = [];
    clearPhysics('vac-container');
    const setupToken = ++vacSetupToken;

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

    // Responsive bounds and initial spawning are deferred until the screen has a real size.
    removeStaticBodies('vac-container');

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
        onTap(airEl, function () {
            if (isGameOver || setupToken !== vacSetupToken || state.phase !== 'vac') return;

            World.remove(physicsEngine.world, airBody);
            this.remove(); // Removes the HTML element instantly

            // Check state immediately based on ACTUAL elements left
            checkGameState();
        });
    }

    // NEW: The Central Draft (Pulls air away from walls every 3 seconds)
    const draftPulse = setInterval(() => {
        if (isGameOver || setupToken !== vacSetupToken || state.phase !== 'vac') return;

        const airBodies = Composite.allBodies(physicsEngine.world).filter(b => b.containerId === 'vac-container' && !b.isStatic);

        airBodies.forEach(body => {

            const cx = (container.clientWidth || 220) / 2;
            const cy = (container.clientHeight || 250) / 2;

            const dx = cx - body.position.x;
            const dy = cy - body.position.y;

            const vScale = Math.min((container.clientWidth || 220) / 220, (container.clientHeight || 250) / 250);

            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 20) {
                Matter.Body.applyForce(body, body.position, {

                    x: (dx / length) * (0.006 * vScale),
                    y: (dy / length) * (0.006 * vScale)

                });
            }
        });
    }, 3000);
    vacIntervals.push(draftPulse);

    function checkGameState() {
        if (isGameOver || setupToken !== vacSetupToken || state.phase !== 'vac') return;

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
            markUnitComplete('vac');
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
        if (setupToken !== vacSetupToken || state.phase !== 'vac') return;
        status.innerText = "🚨 AIR LEAK! Seal the hole before pressure builds! 🚨";
        status.style.color = "var(--color-red)";
        container.style.borderColor = "var(--color-red)";

        // Generate random coordinates within the container bounds
        // Container is 220x250. Margins applied to keep the hole fully inside.
        const w = container.clientWidth || 220;
        const h = container.clientHeight || 250;

        const mx = w * 0.14;
        const my = h * 0.14;

        const holeX = mx + Math.random() * (w - mx * 2);
        const holeY = my + Math.random() * (h - my * 2);

        const hole = document.createElement('div');
        hole.className = 'vac-hole interactive-element';

        // Apply absolute positioning based on the randomized coordinates
        hole.style.position = 'absolute';
        hole.style.left = `${holeX}px`;
        hole.style.top = `${holeY}px`;
        // Ensure standard CSS centering (optional, acts as a fallback if not in your stylesheet)
        hole.style.transform = 'translate(-50%, -50%)';

        container.appendChild(hole);

        onTap(hole, function () {
            if (isGameOver || setupToken !== vacSetupToken || state.phase !== 'vac') return;
            leakSealed = true;
            this.remove();
            status.innerText = "Hole sealed! Clear the remaining air!";
            status.style.color = "var(--color-orange)";
            container.style.borderColor = "var(--color-gray-500)";
        });

        const leakInt = setInterval(() => {
            if (leakSealed || isGameOver || setupToken !== vacSetupToken || state.phase !== 'vac') {
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
                        Matter.Body.setVelocity(b, { x: 0, y: 0 });
                    }
                });

                const restartBtn = document.createElement('button');
                restartBtn.id = 'vac-restart-btn'; // <-- THIS IS THE NEW ID
                restartBtn.className = 'btn interactive-element';
                restartBtn.innerText = 'Restart Vacuum';
                restartBtn.style.marginTop = '15px';
                onTap(restartBtn, () => Game.mapJump('vac'));
                container.parentNode.appendChild(restartBtn);
            }
        }, 400);
        vacIntervals.push(leakInt);
    }

    if (vacSetupTimeout) {
        clearTimeout(vacSetupTimeout);
    }

    vacSetupTimeout = setTimeout(() => {
        if (setupToken !== vacSetupToken || state.phase !== 'vac') return;

        waitForSize(container, 180, () => {
            if (setupToken !== vacSetupToken || state.phase !== 'vac') return;

            removeStaticBodies('vac-container');
            addContainerBounds(container, 'vac-container', 200);

            const w = container.clientWidth || 220;
            const h = container.clientHeight || 250;

            for (let i = 0; i < 25; i++) {
                const mx = w * 0.14;
                const my = h * 0.14;
                const x = mx + Math.random() * (w - mx * 2);
                const y = my + Math.random() * (h - my * 2);
                const vScale = Math.min(w / 220, h / 250);
                const vx = (Math.random() - 0.5) * (6 * vScale);
                const vy = (Math.random() - 0.5) * (6 * vScale);
                spawnAir(x, y, vx, vy);
            }

            debugAssert(container.querySelectorAll('.air-molecule').length > 0, 'Vacuum tower should spawn initial air molecules after activation.', {
                phase: state.phase,
                spawned: container.querySelectorAll('.air-molecule').length
            });
            vacSetupTimeout = null;
        }, 30);
    }, 30);
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

    // Responsive bounds (match actual drum size)
    removeStaticBodies('coker-drum');

    waitForSize(drum, 120, () => {
        removeStaticBodies('coker-drum');
        addContainerBounds(drum, 'coker-drum', 80);
    }, 20);

    let totalCoke = 0;
    let isBlasting = false;

    /* =========================================
       COKER MINIGAME: CONTINUOUS FEED & BAKE
    ========================================= */

    /* --- 1. CONFIGURATION (Update these to match your canvas) --- */
    const MAX_OIL_LIMIT = 25;           // Max active balls before spawner pauses
    const COKE_LAYER_HEIGHT = 26;       // Thickness of each solid coke block
    const DRUM_BOTTOM_Y = 180;          // The Y coordinate for the bottom of the drum container
    const DRUM_CENTER_X = 70;           // The X coordinate for the middle of the drum
    const TARGET_FULL_Y = 40;           // The Y coordinate that triggers the "Win" state
    const FEED_RATE_MS = 200;           // How fast new oil balls drop (milliseconds)
    const BAKE_RATE_MS = 2400;          // How often the "Clean Swap" happens (milliseconds)

    /* --- 2. STATE TRACKING --- */
    let currentCokeFloorY = DRUM_BOTTOM_Y;
    let activeOilBalls = [];
    let cokeLayers = [];
    let cokerFeedInterval;
    let cokerBakeInterval;
    let isContinuousCoking = true;

    /* --- 3. THE CONTINUOUS FEED LOOP --- */
    function spawnCokerFeed() {
        if (!isContinuousCoking) return;
        status.innerText = "Heating Resid to 900°F and continuously filling...";
        status.style.color = "var(--color-navy)";

        // Only drop a new ball if we are under the visual/performance limit
        if (activeOilBalls.length < MAX_OIL_LIMIT) {
            const dropEl = document.createElement('div');
            dropEl.className = 'physics-body oil-particle';
            drum.appendChild(dropEl);

            const newOilBall = Bodies.circle(50 + (Math.random() * 40), -10, 10, {
                restitution: 0.1, friction: 0.1, density: 0.05, containerId: 'coker-drum'
            });
            newOilBall.domElement = dropEl;
            World.add(physicsEngine.world, newOilBall);

            activeOilBalls.push(newOilBall);
        }

        // Add random vapors
        if (Math.random() > 0.6) {
            const vapor = document.createElement('div');
            vapor.className = 'vapor-particle';
            vapor.innerText = '💨';
            vapor.style.left = (50 + Math.random() * 40) + 'px';
            vapor.style.top = '10px';
            vapor.style.fontSize = '60px';
            drum.appendChild(vapor);
            setTimeout(() => vapor.remove(), 2000);
        }
    }

    /* --- 4. THE BAKE CYCLE (THE CLEAN SWAP) --- */
    function bakeContinuousCokeLayer() {
        if (!isContinuousCoking) return;

        status.innerText = "Baking layer into solid Coke...";
        let newLayerTopY = currentCokeFloorY - COKE_LAYER_HEIGHT;

        // Step A: Despawn oil balls that are inside the new bake zone
        activeOilBalls = activeOilBalls.filter(ball => {
            if (ball.position.y >= newLayerTopY) {
                World.remove(physicsEngine.world, ball);
                if (ball.domElement) ball.domElement.remove();
                return false;
            }
            return true;
        });

        // Step B: Spawn the clean, static Coke layer exactly where the balls just were
        // We'll spawn 5 blocks horizontally to match old logic layout
        for (let c = 0; c < 5; c++) {
            const cokeEl = document.createElement('div');
            cokeEl.className = 'physics-body coke-chunk';
            cokeEl.innerText = '◼️';
            drum.appendChild(cokeEl);

            // Adjusting width and positioning to match old drum constraints
            const newCokeBlock = Bodies.rectangle(20 + (c * 25), currentCokeFloorY - (COKE_LAYER_HEIGHT / 2), 22, 22, {
                isStatic: true,
                label: 'coke',
                containerId: 'coker-drum'
            });
            newCokeBlock.health = 12;
            newCokeBlock.domElement = cokeEl;
            World.add(physicsEngine.world, newCokeBlock);
            cokeLayers.push(newCokeBlock);
            totalCoke++;
        }

        // Step C: Update the floor height for the next cycle
        currentCokeFloorY = newLayerTopY;

        // Step D: Check Win Condition
        if (currentCokeFloorY <= TARGET_FULL_Y) {
            endCokerMinigame();
        }
    }

    /* --- 5. INITIALIZATION & CLEANUP --- */
    function startContinuousCoker() {
        currentCokeFloorY = DRUM_BOTTOM_Y;
        activeOilBalls = [];
        cokeLayers = [];
        isContinuousCoking = true;
        totalCoke = 0;

        // Start the continuous loops
        cokerFeedInterval = setInterval(spawnCokerFeed, FEED_RATE_MS);
        cokerBakeInterval = setInterval(bakeContinuousCokeLayer, BAKE_RATE_MS);
        cokerIntervals.push(cokerFeedInterval, cokerBakeInterval);
    }

    function endCokerMinigame() {
        isContinuousCoking = false;
        clearInterval(cokerFeedInterval);
        clearInterval(cokerBakeInterval);

        // Clear residual oil particles
        activeOilBalls.forEach(ball => {
            World.remove(physicsEngine.world, ball);
            if (ball.domElement) ball.domElement.remove();
        });
        activeOilBalls = [];

        setTimeout(triggerHydroblast, 800);
    }

    startContinuousCoker();

    // Sequence 3: The Hydroblast Minigame (With Throttling and Health)
    function triggerHydroblast() {
        status.innerText = "Tap & drag to HYDROBLAST the coke!";
        status.style.color = "var(--color-red)";
        lance.classList.remove('hidden');
        isBlasting = true;

        const nozzle = lance.querySelector('.lance-nozzle') || lance;

        Matter.Events.on(physicsEngine, 'collisionStart', function (event) {
            event.pairs.forEach((pair) => {
                const { bodyA, bodyB } = pair;
                const cokeBody = bodyA.label === 'coke' ? bodyA : (bodyB.label === 'coke' ? bodyB : null);
                const waterBody = bodyA.label === 'water' ? bodyA : (bodyB.label === 'water' ? bodyB : null);

                if (cokeBody && waterBody && cokeBody.label !== 'destroyed') {
                    // Decrease health on hit
                    cokeBody.health--;

                    // Visual feedback: block fades as it takes damage
                    if (cokeBody.domElement) {
                        cokeBody.domElement.style.opacity = (cokeBody.health / 12) + 0.2;
                    }

                    if (cokeBody.health <= 0) {
                        cokeBody.label = 'destroyed';
                        World.remove(physicsEngine.world, cokeBody);
                        if (cokeBody.domElement) cokeBody.domElement.remove();

                        totalCoke--;
                        if (totalCoke <= 0 && isBlasting) {
                            isBlasting = false;
                            markUnitComplete('coker');
                            status.innerText = "Drum Cleared! Great Job!";
                            status.style.color = "var(--color-green)";
                            lance.style.height = '0px';
                            setTimeout(() => {
                                if (fracBtn) fracBtn.classList.remove('hidden');
                            }, 500);
                        }
                    }
                }
            });
        });

        // Throttle the water firing to max 20 times a second (UNCHANGED)
        let lastFire = 0;
        drum.addEventListener('pointermove', function (e) {
            if (!isBlasting) return;
            if (e.pointerType === 'mouse' && e.buttons === 0) return;

            const drumRect = drum.getBoundingClientRect();
            let yPos = e.clientY - drumRect.top;

            const maxY = (drum.clientHeight || 200) + 15;
            if (yPos < 10) yPos = 10;
            if (yPos > maxY) yPos = maxY;

            // Visual lance extension
            lance.style.height = yPos + 'px';

            const now = Date.now();
            if (now - lastFire > 50) {
                // Spawn water from the actual nozzle position (FIX for "water from middle")
                const nozzleRect = nozzle.getBoundingClientRect();

                let spawnX = (nozzleRect.left + (nozzleRect.width / 2)) - drumRect.left;
                let spawnY = (nozzleRect.top + (nozzleRect.height / 2)) - drumRect.top;

                // Clamp spawn point inside drum to avoid edge-case clipping
                const w = (drum.clientWidth || 140);
                const h = (drum.clientHeight || 200) + 20; // Expanded to allow deep reaching
                if (spawnX < -4) spawnX = -4; // Allowing slightly wider reach on x-axis
                if (spawnX > w + 4) spawnX = w + 4;
                if (spawnY < 6) spawnY = 6;
                if (spawnY > h) spawnY = h;

                fireWater(spawnX, spawnY);
                lastFire = now;
            }
        }, { signal: cokerController.signal });
    }

    function fireWater(x, y) {
        // 3 jets: left, right, down
        // To avoid clearing too fast (since 3 > 2 particles per shot),
        // we slightly reduce radius, speed, and lifetime versus the old values.

        const lifetimeMs = 500;   // was 500, shorter reduces total collisions in the world
        const radius = 3.2;       // was 4, slightly smaller reduces hit frequency
        const sideSpeed = 12.0;   // was ~15 sideways originally, reduced
        const downSpeed = 11.0;   // downward jet, similar magnitude but slightly lower
        const jitter = 0.6;       // small spray feel without becoming a wide cone

        const jets = [
            { vx: -sideSpeed, vy: 0 },   // left
            { vx: sideSpeed, vy: 0 },   // right
            { vx: 0, vy: downSpeed } // down (Matter uses +y = down)
        ];

        jets.forEach((j) => {
            const waterEl = document.createElement('div');
            waterEl.className = 'physics-body lance-water';
            drum.appendChild(waterEl);

            const waterBody = Bodies.circle(x, y, radius, {
                label: 'water',
                restitution: 0.2,
                friction: 0,
                frictionAir: 0.03,     // slows travel a bit to prevent rapid shredding
                density: 0.001,
                containerId: 'coker-drum',
                collisionFilter: { group: -1 } // reduce water-water interference
            });

            waterBody.domElement = waterEl;

            Matter.Body.setVelocity(waterBody, {
                x: j.vx + (Math.random() - 0.5) * jitter,
                y: j.vy + (Math.random() - 0.5) * jitter
            });

            World.add(physicsEngine.world, waterBody);

            setTimeout(() => {
                World.remove(physicsEngine.world, waterBody);
                if (waterEl) waterEl.remove();
            }, lifetimeMs);
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
                    <span style="font-size: 1.5rem;">🪨</span> Cut Coke (Sold)
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
            showPhase('fcc');
        });
    } else {
        // LPG, Naphtha, and Diesel all require hydrotreating to remove sulfur and olefins
        state.product = product;
        showFunFact('sulfur', () => {
            showPhase('3');
        });
    }
}

// =============================================================================
// FCC MINIGAME 
// =============================================================================
function setupFCC() {
    const container = getEl('fcc-container');
    if (!container) return;

    // Ensure FCC game area is visible (in case it was hidden by a prior win)
    container.classList.remove('hidden');

    // Reset FCC fractionator panel to hidden at the start of each run
    const frac = getEl('fcc-frac');
    if (frac) frac.classList.add('hidden');

    // Clean up prior timers if you track them
    if (window.fccIntervals) window.fccIntervals.forEach(clearInterval);
    window.fccIntervals = [];
    if (window.fccController?.abort) window.fccController.abort();
    window.fccController = new AbortController();

    container.innerHTML = '';

    // ── TUNABLE GAME CONSTANTS ───────────────────────────────────────────────
    const CRACK_TARGET = 5;
    const ACT_START = 100;

    const ACT_DRAIN_PER_SEC = 1.8;        // activity loss per second
    const ACT_REGEN_GAIN = 22;            // total activity gain per regen event
    const ACT_COKE_PENALTY = 8;           // penalty when too many spent cats exist

    const MOL_SPAWN_MS = 3200;            // feed spawn cadence
    const MOL_MAX = 3;

    const CAT_SPAWN_MS = 4500;            // background spent catalyst cadence
    const CAT_MAX = 4;

    const TAPS_TO_CRACK = 3;

    // Regen “process” (keep in sync with CSS timing tokens)
    const REGEN_BURN_MS = 900;
    const REGEN_RAMP_STEPS = 10;
    const REGEN_RAMP_STEP_MS = 80;        // 10 steps x 80ms = 800ms ramp

    // ── STATE ────────────────────────────────────────────────────────────────
    let activity = ACT_START;
    let cracked = 0;
    let isOver = false;

    // ── CLEAN MARKUP (CSS DRIVES ALL VISUALS) ────────────────────────────────
    container.innerHTML = `
    <div class="fcc-wrap">

      <div class="fcc-metrics">
        <div class="fcc-metric">
          <div class="fcc-metric--label">🏭 Catalyst Activity</div>
          <div class="fcc-metric-bar--track">
            <div class="fcc-metric-bar--fill" id="fcc-act-fill" style="width:100%"></div>
          </div>
          <div class="fcc-metric-value" id="fcc-act-val">100%</div>
        </div>

        <div class="fcc-metric fcc-metric--counter">
          <div class="fcc-metric--label">Cracked</div>
          <div class="fcc-crack-count">
            <span id="fcc-crack-num">0</span><small>/${CRACK_TARGET}</small>
          </div>
        </div>
      </div>

      <div class="fcc-vessel-row">

        <!-- RISER REACTOR -->
        <div class="fcc-vessel-col">
          <div class="fcc-col-lbl fcc-col-lbl--r">Reactor Riser<small>Tap feed to crack</small></div>

          <div class="fcc-vessel-reactor" id="fcc-reactor">
            <div class="fcc-vtop-lbl">↑ Products to Frac</div>
            <div class="fcc-upflow" aria-hidden="true"></div>
            <div class="fcc-vmark">RISER</div>
          </div>

          <div class="fcc-feed-strip">VGO FEED<div class="fcc-strip-sub">tap molecules</div></div>
        </div>

        <!-- PIPE COLUMN -->
        <div class="fcc-pipe-col" aria-hidden="true">
          <div class="fcc-pipe-zone">
            <div class="fcc-pipe-line fcc-pipe-line-spent"></div>
            <div class="fcc-pipe-line fcc-pipe-line-fresh"></div>
            <div class="fcc-pipe-x"></div>
          </div>
          <div class="fcc-pipe-strip"></div>
        </div>

        <!-- REGENERATOR -->
        <div class="fcc-vessel-col">
          <div class="fcc-col-lbl fcc-col-lbl--rg">Regenerator<small>Burn coke off</small></div>

          <div class="fcc-vessel-regen" id="fcc-regen">
            <div class="fcc-vtop-lbl fcc-vtop-lbl--regen">↑ Flue Gas</div>

            <!-- Dense bed (fluidized solids) -->
            <div class="fcc-regen-bed" id="fcc-regen-bed" aria-hidden="true"></div>

            <!-- Drop zone anchored to dense bed -->
            <div class="fcc-drop-zone" id="fcc-drop-zone">Drop spent catalyst<br>into dense bed 🔄</div>

            <div class="fcc-regen-flame" aria-hidden="true">🔥</div>
            <div class="fcc-vmark">REGEN</div>
          </div>

          <div class="fcc-air-strip">Air <span class="fcc-blower">🌀</span></div>
        </div>

      </div>

      <div class="fcc-actions">
        <button id="fcc-done-btn" class="btn hidden" onclick="Game.routeToGasoline()">To Gasoline Blending!</button>
        <button id="fcc-restart-btn" class="btn hidden" onclick="Game.mapJump('fcc')">Restart FCC</button>
      </div>

    </div>
  `;

    // ── ELEMENTS ─────────────────────────────────────────────────────────────
    const reactor = getEl('fcc-reactor');
    const bed = getEl('fcc-regen-bed');
    const dropZone = getEl('fcc-drop-zone');

    const actFill = getEl('fcc-act-fill');
    const actVal = getEl('fcc-act-val');
    const crackNum = getEl('fcc-crack-num');

    const doneBtn = getEl('fcc-done-btn');
    const restartBtn = getEl('fcc-restart-btn');

    // Seed bed specks (cheap “fluid solids” cue)
    seedRegenBed();

    function updateMetrics() {
        const pct = Math.max(0, Math.min(100, activity));
        actFill.style.width = pct + '%';
        actVal.textContent = Math.round(pct) + '%';

        actFill.classList.remove('fcc-metric-bar-fill--warn', 'fcc-metric-bar-fill--danger');
        actVal.classList.remove('fcc-metric-value--warn', 'fcc-metric-value--danger');

        if (pct < 20) {
            actFill.classList.add('fcc-metric-bar-fill--danger');
            actVal.classList.add('fcc-metric-value--danger');
            reactor.classList.add('fcc-reactor--danger');
        } else if (pct < 50) {
            actFill.classList.add('fcc-metric-bar-fill--warn');
            actVal.classList.add('fcc-metric-value--warn');
            reactor.classList.remove('fcc-reactor--danger');
        } else {
            reactor.classList.remove('fcc-reactor--danger');
        }


        if (pct <= 0 && !isOver) lose();
    }

    function updateCounts() {
        crackNum.textContent = cracked;
    }

    // Drain activity
    window.fccIntervals.push(setInterval(() => {
        if (isOver) return;
        activity = Math.max(0, activity - (ACT_DRAIN_PER_SEC / 10));
        updateMetrics();
    }, 100));

    // Spawn feed molecules
    window.fccIntervals.push(setInterval(spawnMolecule, MOL_SPAWN_MS));
    setTimeout(spawnMolecule, 400);
    setTimeout(spawnMolecule, 1200);

    // Spawn periodic spent catalyst pressure
    window.fccIntervals.push(setInterval(() => {
        if (isOver) return;
        spawnSpentCat();
    }, CAT_SPAWN_MS));

    updateMetrics();

    // ── FUNCTIONS ────────────────────────────────────────────────────────────
    function spawnMolecule() {
        if (isOver) return;
        if (reactor.querySelectorAll('.fcc-feed-mol').length >= MOL_MAX) return;

        const mol = document.createElement('div');
        mol.className = 'fcc-feed-mol interactive-element';

        const size = 36 + Math.floor(Math.random() * 14);
        mol.style.width = size + 'px';
        mol.style.height = size + 'px';
        mol.style.left = (10 + Math.random() * 70) + '%';
        mol.style.top = (32 + Math.random() * 52) + '%';

        let tapsLeft = TAPS_TO_CRACK;
        mol.innerHTML = `<span class="fcc-feed-mol-lbl">${tapsLeft}×</span>`;

        mol.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (isOver) return;

            tapsLeft--;
            mol.classList.add('fcc-tap-pop');
            setTimeout(() => mol.classList.remove('fcc-tap-pop'), 140);

            if (tapsLeft > 0) {
                mol.querySelector('.fcc-feed-mol-lbl').textContent = tapsLeft + '×';
                return;
            }

            // Crack success
            cracked++;
            updateCounts();

            burstProducts(mol);

            // Spawn spent catalyst at crack site
            setTimeout(() => spawnSpentCat(mol.style.left, mol.style.top), 240);

            mol.remove();

            if (cracked >= CRACK_TARGET) win();
        });

        reactor.appendChild(mol);
    }

    function burstProducts(mol) {
        const startLeft = parseFloat(mol.style.left);
        const startTop = parseFloat(mol.style.top);

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'fcc-product-dot';
            dot.style.left = (startLeft + (Math.random() * 16 - 8)) + '%';
            dot.style.top = startTop + '%';
            dot.style.setProperty('--pdot', i === 0 ? '#fde047' : i === 1 ? '#bae6fd' : '#fca5a5');
            reactor.appendChild(dot);
            setTimeout(() => dot.remove(), 1100);
        }
    }

    function spawnSpentCat(startLeft, startTop) {
        if (isOver) return;

        const existing = reactor.querySelectorAll('.fcc-cat.fcc-cat--spent').length;
        if (existing >= CAT_MAX) {
            activity = Math.max(0, activity - ACT_COKE_PENALTY);
            updateMetrics();
        }

        const cat = document.createElement('div');
        cat.className = 'fcc-cat fcc-cat--spent interactive-element';
        cat.dataset.homeLeft = startLeft || (10 + Math.random() * 70) + '%';
        cat.dataset.homeTop = startTop || (62 + Math.random() * 22) + '%';
        cat.style.left = cat.dataset.homeLeft;
        cat.style.top = cat.dataset.homeTop;

        cat.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (isOver) return;

            cat.setPointerCapture(e.pointerId);
            cat.classList.add('fcc-dragging');

            const homeLeft = cat.dataset.homeLeft;
            const homeTop = cat.dataset.homeTop;

            cat.style.position = 'fixed';

            const onMove = (ev) => {
                cat.style.left = (ev.clientX - 10) + 'px';
                cat.style.top = (ev.clientY - 10) + 'px';

                const dz = dropZone.getBoundingClientRect();
                const over = ev.clientX > dz.left && ev.clientX < dz.right &&
                    ev.clientY > dz.top && ev.clientY < dz.bottom;
                dropZone.classList.toggle('fcc-drop-zone--hot', over);
            };

            const onUp = (ev) => {
                cat.removeEventListener('pointermove', onMove);
                cat.removeEventListener('pointerup', onUp);
                dropZone.classList.remove('fcc-drop-zone--hot');
                cat.classList.remove('fcc-dragging');

                const dz = dropZone.getBoundingClientRect();
                const hit = ev.clientX > dz.left && ev.clientX < dz.right &&
                    ev.clientY > dz.top && ev.clientY < dz.bottom;

                if (!hit) {
                    cat.style.position = 'absolute';
                    cat.style.left = homeLeft;
                    cat.style.top = homeTop;
                    return;
                }

                runRegen(cat);
            };

            cat.addEventListener('pointermove', onMove);
            cat.addEventListener('pointerup', onUp);
        });

        reactor.appendChild(cat);
    }

    function runRegen(cat) {
        if (isOver) return;

        // Move into dense bed
        cat.style.position = 'absolute';
        cat.style.left = (12 + Math.random() * 76) + '%';
        cat.style.top = (60 + Math.random() * 30) + '%';
        bed.appendChild(cat);

        cat.classList.add('fcc-cat--burning');

        // Bubble puffs during burn
        const bubInt = setInterval(() => {
            if (isOver) { clearInterval(bubInt); return; }
            const b = document.createElement('div');
            b.className = 'fcc-air-bub';
            b.style.left = (10 + Math.random() * 80) + '%';
            bed.appendChild(b);
            setTimeout(() => b.remove(), 1700);
        }, 180);
        window.fccIntervals.push(bubInt);


        setTimeout(() => {
            clearInterval(bubInt);
            if (isOver) return;

            cat.classList.add('fcc-fade-out');
            setTimeout(() => cat.remove(), 350);

            // Emit fresh catalyst cue back to riser base
            const fresh = document.createElement('div');
            fresh.className = 'fcc-cat fcc-cat--fresh';
            fresh.style.left = (8 + Math.random() * 76) + '%';
            fresh.style.top = '84%';
            reactor.appendChild(fresh);
            setTimeout(() => fresh.remove(), 900);

            // Ramp activity up (process feel)
            const gainPer = ACT_REGEN_GAIN / REGEN_RAMP_STEPS;
            let i = 0;
            const ramp = setInterval(() => {
                if (isOver) { clearInterval(ramp); return; }
                activity = Math.min(ACT_START, activity + gainPer);
                updateMetrics();
                i++;
                if (i >= REGEN_RAMP_STEPS) clearInterval(ramp);
            }, REGEN_RAMP_STEP_MS);
            window.fccIntervals.push(ramp);


        }, REGEN_BURN_MS);
    }

    function seedRegenBed() {
        if (!bed) return;
        for (let i = 0; i < 10; i++) {
            const s = document.createElement('div');
            s.className = 'fcc-rcat';
            s.style.left = (8 + Math.random() * 84) + '%';
            s.style.top = (58 + Math.random() * 34) + '%';
            bed.appendChild(s);
        }
    }

    function win() {
        if (isOver) return;
        isOver = true;

        markUnitComplete('fcc');
        window.fccIntervals.forEach(clearInterval);

        // Prevent mobile browsers from "helpfully" jumping the page when layout changes
        const scrollY = window.scrollY;

        // Smoothly collapse the FCC minigame so the screen doesn't grow
        const h = container.offsetHeight;
        container.style.maxHeight = h + 'px';
        container.style.overflow = 'hidden';

        // Force reflow so maxHeight applies before we collapse
        void container.offsetHeight;

        // Animate collapse (CSS class you’ll add in styles.css)
        container.classList.add('fcc-collapse');

        // After 1s: hide minigame completely, restore scroll, show fractionator
        setTimeout(() => {
            window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });

            container.classList.add('hidden');
            container.classList.remove('fcc-collapse');
            container.style.maxHeight = '';
            container.style.overflow = '';

            const frac = getEl('fcc-frac');
            if (frac) {
                frac.classList.remove('hidden');
                frac.classList.add('fcc-frac-reveal');
                setTimeout(() => frac.classList.remove('fcc-frac-reveal'), 600);
            }
        }, 300);
    }

    function lose() {
        if (isOver) return;
        isOver = true;
        window.fccIntervals.forEach(clearInterval);

        // Show lose message in the reactor
        const loseMsg = document.createElement('div');
        loseMsg.className = 'fcc-lose-msg';
        loseMsg.innerHTML = `⚠️ Catalyst Activity Depleted!<br><small>Too much coke buildup deactivated the catalyst. Drag spent catalyst to the regenerator to burn off coke and restore activity.</small>`;
        reactor.appendChild(loseMsg);

        restartBtn.classList.remove('hidden');
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
// =============================================================================
// CHANGE 2: NEW CONSTANTS BLOCK
// Location: Paste this entire block IMMEDIATELY BEFORE the setupMinigame()
//           function definition. Do NOT paste inside it.
// =============================================================================

/* ── Gasoline Blender Constants ── */
const GAS_COMPONENTS = {
    naphtha: { octane: 60, rvp: 4, color: '#d4a017', label: 'Naphtha', desc: 'Base stock, low octane' },
    butane: { octane: 93, rvp: 50.0, color: '#5bc8f5', label: 'Butane', desc: 'Boosts octane, raises RVP fast' },
    reformate: { octane: 100, rvp: 0, color: '#f4a261', label: 'Reformate', desc: 'High octane, low RVP' },
    alkylate: { octane: 93, rvp: 4, color: '#90e0ef', label: 'Alkylate', desc: 'Clean, high octane' },
    fccgasoline: { octane: 84, rvp: 7, color: '#e07b39', label: 'FCC Gas', desc: 'Base blendstock' }
};

const GAS_PRODUCTS = {
    '87summer': { label: '87 Summer', minOctane: 87, maxRVP: 9.0, idealOctane: 87.5, idealRVP: 8.6 },
    '93summer': { label: '93 Summer', minOctane: 93, maxRVP: 9.0, idealOctane: 93.5, idealRVP: 8.6 },
    '87winter': { label: '87 Winter', minOctane: 87, maxRVP: 13.5, idealOctane: 87.5, idealRVP: 13.0 },
    '93winter': { label: '93 Winter', minOctane: 93, maxRVP: 13.5, idealOctane: 93.5, idealRVP: 13.0 }
};

const GAS_RECIPES = {
    '87summer': {
        mix: { naphtha: 1, butane: 1, reformate: 3, alkylate: 0, fccgasoline: 5 },
        octane: 87.3, rvp: 8.9,
        tip: 'This is core gasoline using FCC Gasoline which accounts for ~40% of global gasoline. One Butane adds a small RVP bump.'
    },
    '93summer': {
        mix: { naphtha: 0, butane: 1, reformate: 3, alkylate: 4, fccgasoline: 2 },
        octane: 93.3, rvp: 8.0,
        tip: 'Premium demands heavy Alkylate. Skip Naphtha entirely — its 60 octane will pull you under. One Butane is safe; two would blow the 9.0 RVP limit.'
    },
    '87winter': {
        mix: { naphtha: 2, butane: 2, reformate: 3, alkylate: 2, fccgasoline: 1 },
        octane: 87.6, rvp: 12.3,
        tip: 'Winter\'s higher RVP limit (13.5) lets you use both Butane units. Butane is cheap and boosts octane, which let\'s you blend cheap naphtha too!'
    },
    '93winter': {
        mix: { naphtha: 0, butane: 2, reformate: 3, alkylate: 3, fccgasoline: 2 },
        octane: 93.3, rvp: 12.6,
        tip: 'Both Butane units plus heavy Alkylate and Reformate. High octane and high RVP specs let you blend significant butane with filler from FCC gasoline.'
    }
};

function showGasRecipePopup() {
    const existing = document.querySelector('.recipe-popup-overlay');
    if (existing) existing.remove();

    const grade = state.gasProduct;
    const recipe = GAS_RECIPES[grade];
    const spec = GAS_PRODUCTS[grade];
    if (!recipe) return;

    const overlay = document.createElement('div');
    overlay.className = 'recipe-popup-overlay';

    const compRows = Object.entries(recipe.mix).map(([k, qty]) => {
        const c = GAS_COMPONENTS[k];
        const bar = '█'.repeat(qty) + '░'.repeat((k === 'naphtha' || k === 'butane' ? 2 : 5) - qty);
        return `<div class="recipe-row">
            <span class="recipe-comp-name" style="color:${c.color}">${c.label}</span>
            <span class="recipe-bar">${bar}</span>
            <strong>${qty}</strong>
        </div>`;
    }).join('');

    overlay.innerHTML = `
        <div class="recipe-popup">
            <button class="recipe-close" id="recipe-close-btn">&times;</button>
            <h3>📋 Recommended: ${spec.label}</h3>
            <div class="recipe-specs">
                Target: Octane ≥${spec.minOctane} | RVP ≤${spec.maxRVP}
            </div>
            <div class="recipe-grid">
                ${compRows}
            </div>
            <div class="recipe-result">
                Expected → <strong>Octane ${recipe.octane}</strong> RON, <strong>RVP ${recipe.rvp}</strong> psi
            </div>
            <p class="recipe-tip">💡 ${recipe.tip}</p>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay || e.target.id === 'recipe-close-btn') overlay.remove();
    });
}


function calculateBlend(volumes) {
    const keys = Object.keys(volumes);
    const total = keys.reduce((s, k) => s + volumes[k], 0);
    if (total === 0) return { octane: 0, rvp: 0, total: 0 };
    let octane = 0, rvp = 0;
    keys.forEach(k => {
        const frac = volumes[k] / total;
        octane += frac * GAS_COMPONENTS[k].octane;
        rvp += frac * GAS_COMPONENTS[k].rvp;
    });
    return { octane: Math.round(octane * 10) / 10, rvp: Math.round(rvp * 10) / 10, total };
}

function evaluateGasBlend(volumes, productKey) {
    const spec = GAS_PRODUCTS[productKey];
    const blend = calculateBlend(volumes);
    if (blend.total === 0) return { grade: 'fail', msg: 'No components blended!', blend };
    if (blend.octane < spec.minOctane) {
        return {
            grade: 'fail', blend,
            msg: `Under octane spec — ${blend.octane} RON vs ${spec.minOctane} min. Selling this would cause engine knocking and EPA fines. Try adding more Reformate or less Naphtha!`
        };
    }
    if (blend.rvp > spec.maxRVP) {
        return {
            grade: 'fail', blend,
            msg: `RVP too high — ${blend.rvp} psi vs ${spec.maxRVP} psi max. This blend violates vapor pressure regulations. Try using less Butane!`
        };
    }
    const octaneGiveaway = blend.octane - spec.minOctane;
    const rvpHeadroom = spec.maxRVP - blend.rvp;
    if (octaneGiveaway > 1.5 || rvpHeadroom > 1.5) {
        return {
            grade: 'warning', blend,
            msg: `Passes but you left money on the table — ${octaneGiveaway.toFixed(1)} octane points and ${rvpHeadroom.toFixed(1)} psi RVP unused as headroom. Proceed or try for a tighter blend?`
        };
    }
    return {
        grade: 'pass', blend,
        msg: `Perfect ${spec.label} blend! ${blend.octane} RON, ${blend.rvp} psi RVP — tight on spec and cost-efficient. `
    };
}

function updateBlendDisplay(volumes, productKey) {
    const blend = calculateBlend(volumes);
    const spec = GAS_PRODUCTS[productKey];
    const readout = getEl('blend-live-readout');
    if (!readout) return;
    const octaneOk = blend.total > 0 && blend.octane >= spec.minOctane;
    const rvpOk = blend.total > 0 && blend.rvp <= spec.maxRVP;
    readout.innerHTML = `
        <span style="color:${blend.total > 0 ? (octaneOk ? '#2e7d32' : '#c53030') : '#666'}">
            Octane: <strong>${blend.total > 0 ? blend.octane + ' RON' : '--'}</strong>
        </span>
        <span style="color:${blend.total > 0 ? (rvpOk ? '#2e7d32' : '#c53030') : '#666'}">
            RVP: <strong>${blend.total > 0 ? blend.rvp + ' psi' : '--'}</strong>
        </span>
    `;
    // Fill the blend tank visual
    const totalVol = Object.values(volumes).reduce((s, v) => s + v, 0);
    const fillEl = getEl('blend-tank-fill');
    if (fillEl) {
        fillEl.style.height = Math.min(100, totalVol * 10) + '%';
        fillEl.style.background = blend.total > 0
            ? (octaneOk && rvpOk ? 'linear-gradient(to top, #48bb78, #68d391)' : 'linear-gradient(to top, #f56565, #fc8181)')
            : '#ddd';
    }
}


/* ── ULSD Treatment Constants ── */
const ULSD_TREATMENT_POOL = [
    {
        id: 'cfpp', name: 'Cold Flow Improver', unit: 'ppm', target: 200, step: 20, color: '#60a5fa', emoji: '❄️',
        hint: 'Prevents wax crystals at cold temperatures'
    },
    {
        id: 'corr', name: 'Corrosion Inhibitor', unit: 'ppm', target: 10, step: 1, color: '#f87171', emoji: '🛡️',
        hint: 'Protects metal pipeline and storage tank walls'
    },
    {
        id: 'lub', name: 'Lubricity Additive', unit: 'ppm', target: 300, step: 25, color: '#34d399', emoji: '⚙️',
        hint: 'Ultra-low sulfur diesel needs to slip and slide through pipes; this helps it'
    },
    {
        id: 'stat', name: 'Static Dissipator', unit: 'ppm', target: 2, step: 1, color: '#a78bfa', emoji: '⚡',
        hint: 'Prevents static electricity buildup during high-speed pipeline flow'
    },
    {
        id: 'stab', name: 'Fuel Stabilizer', unit: 'ppm', target: 50, step: 5, color: '#fbbf24', emoji: '🔋',
        hint: 'Prevents oxidation and gum buildup during long storage'
    }
];

function pickULSDTreatments() {
    const pool = [...ULSD_TREATMENT_POOL];
    const picked = [];
    // Always include lubricity (educational anchor — ULSD story)
    const lubIdx = pool.findIndex(t => t.id === 'lub');
    picked.push(pool.splice(lubIdx, 1)[0]);
    // Pick 2 more at random to make 3 total
    while (picked.length < 3) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
}



function evaluateULSD(doses, treatments) {
    let allPerfect = true;
    let anyFail = false;
    let anyWarn = false;
    const results = treatments.map(t => {
        const dose = doses[t.id] || 0;
        const ratio = dose / t.target;
        if (dose < t.target) {
            anyFail = true; allPerfect = false;
            return { id: t.id, grade: 'fail', msg: `Under-treated — ${dose} vs ${t.target} ${t.unit} target` };
        }
        if (ratio > 2.0) {
            anyFail = true; allPerfect = false;
            return { id: t.id, grade: 'fail', msg: `Gross over-treat (${dose} ${t.unit}) — cost overrun and potential fuel degradation` };
        }
        if (ratio > 1.2) {
            anyWarn = true; allPerfect = false;
            return { id: t.id, grade: 'warning', msg: `Over-treated by ${Math.round((ratio - 1) * 100)}% — passes but cost more than needed` };
        }
        return { id: t.id, grade: 'pass', msg: `✅ Spot on` };
    });
    let overallGrade = allPerfect ? 'pass' : anyFail ? 'fail' : 'warning';
    return { results, overallGrade };
}

/* ── Jet Batch Inspector Constants ── */
const JET_LIMITS = {
    flash: { min: 100, max: 999, unit: '°F', label: 'Flash Pt', emoji: '🔥', range: '≥ 100°F' },
    freeze: { min: -999, max: -40, unit: '°F', label: 'Freeze Pt', emoji: '❄️', range: '≤ -40°F' },
    sulfur: { min: 0, max: 3000, unit: 'ppm', label: 'Sulfur', emoji: '💨', range: '≤ 3000 ppm' },
    density: { min: 0.775, max: 0.817, unit: 'kg/L', label: 'Density', emoji: '⚖️', range: '0.775–0.817' },
    smoke: { min: 25, max: 999, unit: 'mm', label: 'Smoke Pt', emoji: '🕯️', range: '≥ 25 mm' }
};

const JET_BATCH_POOL = [
    // good batches
    { id: 1, good: true, flash: 112, freeze: -48, sulfur: 800, density: 0.796, smoke: 28 },
    { id: 2, good: true, flash: 125, freeze: -52, sulfur: 1200, density: 0.800, smoke: 30 },
    { id: 3, good: true, flash: 105, freeze: -42, sulfur: 2800, density: 0.792, smoke: 26 },
    { id: 4, good: true, flash: 130, freeze: -55, sulfur: 500, density: 0.805, smoke: 32 },
    { id: 5, good: true, flash: 118, freeze: -46, sulfur: 1500, density: 0.798, smoke: 27 },
    { id: 6, good: true, flash: 108, freeze: -50, sulfur: 600, density: 0.794, smoke: 29 },
    // bad batches — explicitly defined for feedback
    { id: 7, good: false, flash: 90, freeze: -48, sulfur: 800, density: 0.796, smoke: 28, failSpec: 'flash', failMsg: 'Flash point is too low — extreme fire hazard during handling.' },
    { id: 8, good: false, flash: 115, freeze: -25, sulfur: 800, density: 0.796, smoke: 28, failSpec: 'freeze', failMsg: 'Freeze point too warm — fuel would gel in aircraft tanks at altitude.' },
    { id: 9, good: false, flash: 105, freeze: -45, sulfur: 3400, density: 0.796, smoke: 28, failSpec: 'sulfur', failMsg: 'Sulfur exceeds 3000 ppm — causes turbine corrosion and violates emissions.' },
    { id: 10, good: false, flash: 110, freeze: -42, sulfur: 900, density: 0.822, smoke: 28, failSpec: 'density', failMsg: 'Density out of range — fuel metering will be incorrect, risking engine stall.' },
    { id: 11, good: false, flash: 110, freeze: -42, sulfur: 900, density: 0.800, smoke: 18, failSpec: 'smoke', failMsg: 'Smoke point too low — combustion will be incomplete and produce excessive soot.' }
];



function buildJetBatchQueue() {
    // 1. Separate and shuffle the pools so we get random selections
    const good = JET_BATCH_POOL.filter(b => b.good).sort(() => Math.random() - 0.5);
    const bad = JET_BATCH_POOL.filter(b => !b.good).sort(() => Math.random() - 0.5);

    let gi = 0, bi = 0;

    // 2. HARDENING: Guarantee at least 2 bad batches in the first 4
    // We pull 2 good and 2 bad, then shuffle this specific mini-batch
    const firstFour = [
        { ...good[gi++] },
        { ...good[gi++] },
        { ...bad[bi++] },
        { ...bad[bi++] }
    ].sort(() => Math.random() - 0.5);

    // 3. Initialize the queue with our stacked deck
    const queue = [...firstFour];

    // 4. Fill the remaining 6 slots using the standard 60/40 ratio
    while (queue.length < 10) {
        if (gi < good.length && (bi >= bad.length || Math.random() < 0.6)) {
            queue.push({ ...good[gi++] });
        } else if (bi < bad.length) {
            queue.push({ ...bad[bi++] });
        } else {
            // Fallback if we run out of unique bad batches
            queue.push({ ...good[gi++ % good.length] });
        }
    }

    return queue;
}
// =============================================================================
//blending minigames
// =============================================================================

function resetLabUI() {
    const labCheck = getEl('lab-check');
    const progressContainer = getEl('test-progress-container');
    const bar = getEl('test-progress');
    const resultEl = getEl('test-result');
    const testBtn = getEl('test-btn');

    // Hide gating UI
    if (labCheck) labCheck.classList.add('hidden');

    // Reset progress
    if (progressContainer) progressContainer.classList.add('hidden');
    if (bar) {
        bar.style.width = '0%';
        bar.style.backgroundColor = '#48bb78';
    }

    // Reset result
    if (resultEl) {
        resultEl.classList.add('hidden');
        resultEl.innerHTML = '';
        resultEl.style.background = '';
        resultEl.style.border = '';
        resultEl.style.color = '';
    }

    // Reset test button
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.innerText = '';
        testBtn.onclick = null;
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

    // Clear any running timers from previous game
    // Clear any running timers from previous game
    if (state.jetTimerInterval) { clearInterval(state.jetTimerInterval); state.jetTimerInterval = null; }
    if (state.ulsdTimerInterval) { clearInterval(state.ulsdTimerInterval); state.ulsdTimerInterval = null; }
    if (window.ulsdToteIntervals) {
        window.ulsdToteIntervals.forEach(clearInterval);
        window.ulsdToteIntervals = [];
    }
    resetLabUI();
    container.innerHTML = '';
    state.itemsAdded = 0;

    if (testBtn) {
        testBtn.disabled = true;      // default: disabled until a minigame enables it
        testBtn.innerText = '';       // prevents Jet inheriting ULSD/Gas text
        testBtn.onclick = null;       // prevents Jet inheriting ULSD click handler
    }

    // ── GASOLINE BLENDER ──────────────────────────────────────────────────────
    if (state.product === 'gasoline' || state.product === 'lpg' || state.product === 'naphtha') {
        state.product = 'gasoline';
        state.gasProduct = state.gasProduct || '87summer';
        state.gasVolumes = { naphtha: 0, butane: 0, reformate: 0, alkylate: 0, fccgasoline: 0 };
        const MAX_PER_COMPONENT = 5;
        const COMPONENT_CAPS = { naphtha: 2, butane: 2, reformate: 5, alkylate: 5, fccgasoline: 5 };


        // Build grade buttons with completion badges
        const gradeButtons = Object.entries(GAS_PRODUCTS).map(([key, p]) => {
            const done = state.gasGradesCompleted.includes(key);
            return `<button class="grade-btn ${key === state.gasProduct ? 'active' : ''} ${done ? 'grade-done' : ''}"
                data-grade="${key}">${done ? '✅ ' : ''}${p.label}</button>`;
        }).join('');

        const spec = GAS_PRODUCTS[state.gasProduct];

        container.innerHTML = `
                        <div class="blend-top">
                <h3 style="margin:0 0 8px">⛽ Gasoline Blender</h3>
                
                <div style="background: var(--color-action-bg); border: 1px solid var(--color-action-border); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <span style="font-weight: bold; color: var(--color-navy); font-size: 0.95rem;">🎯 Goal: Blend at least TWO different grades to unlock shipping!</span>
                </div>
                
                <p class="blend-hint" style="margin-top: 0; font-size: 0.85rem; line-height: 1.5; color: #444;">
                    Pick a grade, then tap the tanks below to mix your fuel. Green arrows help your spec.<br>
                    <span style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-top: 6px; font-weight: bold; color: #2b6cb0;">
                        Need a recipe? Tap <button class="recipe-help-btn" id="recipe-help-btn" style="margin: 0;">❓</button> for hints!
                    </span>
                </p>
            </div>


            <div class="grade-selector">${gradeButtons}</div>

            <div class="blend-spec-bar">
                🎯 Octane ≥<strong id="spec-octane">${spec.minOctane}</strong>
                &nbsp;|&nbsp; RVP ≤<strong id="spec-rvp">${spec.maxRVP}</strong>
                &nbsp;&nbsp;<span id="vol-total-display" style="color:#888">0/10</span>
            </div>

            <div class="comp-tanks-row" id="comp-tanks-row">
                ${Object.entries(GAS_COMPONENTS).map(([key, c]) => `
                    <div class="comp-tank-unit" data-comp="${key}">
                        <div class="comp-tank-body${key === 'butane' ? ' comp-tank-body--sphere' : ''}" style="border-color:${c.color}" data-comp="${key}">
                            <div class="comp-tank-fill" id="cfill-${key}" style="background:${c.color};height:100%"></div>
                            <span class="comp-count" id="vol-${key}">0</span>
                        </div>
                                                                                                            <div class="comp-tank-label">
                                <strong>${c.label}</strong>
                                <div class="comp-impact" id="impact-${key}"></div>
                            </div>
                    </div>
                                `).join('')}
            </div>

            <div class="blend-header-manifold">
                <div class="manifold-pipe"></div>
                <div class="manifold-drop">
                    <div class="manifold-drop-arrow">↓</div>
                </div>
            </div>

            <div class="blend-tank-wrapper">
                <div class="blend-tank-body">
                    <div class="blend-tank-fill" id="blend-tank-fill" style="height:0%"></div>
                    <div class="blend-live-readout" id="blend-live-readout">
                        <span style="color:#999">Octane: --</span>
                        <span style="color:#999">RVP: --</span>
                    </div>
                </div>
                <div class="blend-tank-label">Blend Tank</div>
            </div>

        `;

        // --- Impact arrow updater ---
        function updateImpactArrows() {
            const spec = GAS_PRODUCTS[state.gasProduct];
            const blend = calculateBlend(state.gasVolumes);
            const total = blend.total;

            Object.entries(GAS_COMPONENTS).forEach(([key, c]) => {
                const impactEl = getEl(`impact-${key}`);
                if (!impactEl) return;

                let octArrow, octClass;
                if (total === 0) {
                    octArrow = c.octane >= spec.minOctane ? '↑' : '↓';
                    octClass = c.octane >= spec.minOctane ? 'arrow-good' : 'arrow-bad';
                } else {
                    octArrow = c.octane > blend.octane ? '↑' : '↓';
                    const needMore = blend.octane < spec.minOctane;
                    const raises = c.octane > blend.octane;
                    octClass = (needMore && raises) || (!needMore && !raises) ? 'arrow-good'
                        : (needMore && !raises) ? 'arrow-bad' : 'arrow-neutral';
                }

                let rvpArrow, rvpClass;
                if (total === 0) {
                    rvpArrow = c.rvp <= spec.maxRVP ? '↓' : '↑';
                    rvpClass = c.rvp <= spec.maxRVP ? 'arrow-good' : 'arrow-bad';
                } else {
                    rvpArrow = c.rvp < blend.rvp ? '↓' : '↑';
                    const tooHigh = blend.rvp > spec.maxRVP * 0.9;
                    const lowers = c.rvp < blend.rvp;
                    rvpClass = (tooHigh && lowers) || (!tooHigh && lowers) ? 'arrow-good'
                        : (tooHigh && !lowers) ? 'arrow-bad' : 'arrow-neutral';
                }

                impactEl.innerHTML = `
                    <div class="comp-spec-line"><b class="comp-spec-tag">Oct:</b> ${c.octane} <span class="${octClass}">${octArrow}</span></div>
                    <div class="comp-spec-line"><b class="comp-spec-tag">RVP:</b> ${c.rvp} <span class="${rvpClass}">${rvpArrow}</span></div>
                `;
            });
        }

        // --- Help button ---
        const helpBtn = getEl('recipe-help-btn');
        if (helpBtn) helpBtn.addEventListener('click', showGasRecipePopup);


        // --- Grade selector buttons ---
        container.querySelectorAll('.grade-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.gasProduct = btn.dataset.grade;
                state.gasVolumes = { naphtha: 0, butane: 0, reformate: 0, alkylate: 0, fccgasoline: 0 };

                container.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const s = GAS_PRODUCTS[state.gasProduct];
                const so = getEl('spec-octane'); if (so) so.textContent = s.minOctane;
                const sr = getEl('spec-rvp'); if (sr) sr.textContent = s.maxRVP;

                Object.keys(GAS_COMPONENTS).forEach(k => {
                    const vEl = getEl(`vol-${k}`); if (vEl) vEl.textContent = '0';
                    const fEl = getEl(`cfill-${k}`); if (fEl) fEl.style.height = '100%';
                });
                const vt = getEl('vol-total-display'); if (vt) vt.textContent = '0/10';
                const readout = getEl('blend-live-readout');
                if (readout) readout.innerHTML = '<span>Octane: <strong>--</strong></span><span>RVP: <strong>--</strong></span>';
                if (labCheck) labCheck.classList.add('hidden');
                if (testBtn) testBtn.disabled = true;
                updateImpactArrows();
            });
        });

        // --- Tap-to-add on tank bodies ---
        container.querySelectorAll('.comp-tank-body[data-comp]').forEach(tank => {
            tank.addEventListener('pointerdown', e => {
                e.preventDefault();
                const comp = tank.dataset.comp;
                const total = Object.values(state.gasVolumes).reduce((s, v) => s + v, 0);

                const cap = COMPONENT_CAPS[comp] || MAX_PER_COMPONENT;
                if (state.gasVolumes[comp] >= cap) return;

                if (total >= 10) return;
                state.gasVolumes[comp]++;

                tank.classList.add('just-used');
                setTimeout(() => tank.classList.remove('just-used'), 200);

                const vEl = getEl(`vol-${comp}`);
                if (vEl) vEl.textContent = state.gasVolumes[comp];

                const cap2 = COMPONENT_CAPS[comp] || MAX_PER_COMPONENT;
                const remaining = cap2 - state.gasVolumes[comp];
                const fEl = getEl(`cfill-${comp}`);
                if (fEl) fEl.style.height = (remaining / cap2 * 100) + '%';

                const newTotal = Object.values(state.gasVolumes).reduce((s, v) => s + v, 0);
                const vt = getEl('vol-total-display'); if (vt) vt.textContent = `${newTotal}/10`;

                updateBlendDisplay(state.gasVolumes, state.gasProduct);
                updateImpactArrows();

                if (newTotal === 10) {
                    if (labCheck) labCheck.classList.remove('hidden');
                    if (testBtn) testBtn.disabled = false;
                } else {
                    if (labCheck) labCheck.classList.add('hidden');
                    if (testBtn) testBtn.disabled = true;
                }
            });
        });

        updateImpactArrows();

        if (testBtn) {
            testBtn.innerText = '🧪 Send to Lab';
            testBtn.onclick = () => {
                const result = evaluateGasBlend(state.gasVolumes, state.gasProduct);
                runLabTest('', () => result, result.grade);
            };
        }

        // ── JET FUEL COA INSPECTOR ───────────────────────────────────────────────
    } else if (state.product === 'jetfuel') {
        state.jetBatches = buildJetBatchQueue();
        state.jetBatchIndex = 0;
        state.jetTankLevel = 0;
        state.jetTimeLeft = 90;
        state.jetLostBbl = 0;
        state.jetCoaCount = 0;

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div>
                    <h3 style="margin: 0 0 4px 0;">✈️ Jet A — Certificate Of Analysis</h3>
                    <p style="font-size:0.75rem;color:#555;margin:0;max-width:220px;">
                        Approve on-spec fuel to fill the Cargo Tank. One bad batch ruins the whole cargo!
                    </p>
                </div>
                <div style="text-align: right; font-size: 0.8rem; flex-shrink: 0;">
                    <div>⏱ <strong id="jet-timer">90</strong>s</div>
                    <div>📋 <strong id="jet-coa-count">0</strong> COAs</div>
                    <div id="jet-lost-hud" class="hidden" style="color:#c53030; font-size:0.75rem;">⚠️ <strong id="jet-lost-bbl">0</strong> bbl lost</div>
                </div>
            </div>

            <div class="jet-tanks-display">
                <div class="jet-tank-col">
                    <div class="jet-test-tank" id="jet-test-tank">
                        <div class="jet-test-fill" id="jet-test-fill"></div>
                    </div>
                    <div class="jet-tank-title">Test Tank</div>
                </div>
                
                <div class="jet-flow-arrow" id="jet-flow-arrow">→</div>

                <div class="jet-tank-col">
                    <div class="jet-cargo-tank">
                        <div id="jet-tank-fill" class="jet-cargo-fill" style="height:0%"></div>
                        <div id="jet-tank-pct" class="jet-cargo-pct">0%</div>
                    </div>
                    <div class="jet-tank-title">Cargo Tank</div>
                </div>
            </div>

            <div class="jet-batch-card" id="jet-batch-card">
                <p style="text-align:center;padding:16px;color:#888">Filling test tank…</p>
            </div>

            <div id="jet-feedback" class="jet-feedback hidden"></div>

            <div class="jet-action-btns">
                <button class="btn jet-reject-btn interactive-element" id="jet-reject" disabled>❌ Reject (Slop)</button>
                <button class="btn jet-accept-btn interactive-element" id="jet-accept" disabled>✅ Approve COA</button>
            </div>
        `;


        if (testBtn) {
            testBtn.innerText = '🧪 Certify Jet Tank';
            testBtn.disabled = true;
            testBtn.onclick = null;
        }

        startJetCOAGame(container, labCheck);

        // ── ULSD TREATMENT ────────────────────────────────────────────────────────
    } else if (state.product === 'diesel') {
        state.ulsdTreatments = pickULSDTreatments();
        state.ulsdDoses = {};
        state.ulsdTimeLeft = 60;
        state.ulsdTreatments.forEach(t => { state.ulsdDoses[t.id] = 0; });
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                <div style="text-align: left;">
                    <h3 style="margin:0 0 2px">⚗️ ULSD Treatment</h3>
                    <p style="font-size:0.75rem;color:#555;margin:0">Add precise ppm doses.</p>
                </div>
                <div class="ulsd-timer-bar" style="margin:0; padding:4px 10px;">
                    ⏱ <strong id="ulsd-timer">60</strong>s
                </div>
            </div>

            <div class="ulsd-visual-tank" id="ulsd-visual-tank">
                <div class="ulsd-tank-liquid">
                    <span class="ulsd-tank-label">1,000,000 Parts ULSD</span>
                </div>
            </div>
            
            <p style="font-size:0.8rem;color:#888;margin:0 0 6px;">Tap 👇 each tote ❄️🛡️⚙️⚡🔋 to drop treatment into the cargo tank. Hold for continuous flow.</p>

            <div class="ulsd-totes-row" id="ulsd-totes-row">

                ${state.ulsdTreatments.map(t => `
                    <div class="ulsd-tote-unit" id="tote-${t.id}">
                        <div class="ulsd-tote-icon" style="background:${t.color}">
                            ${t.emoji}
                        </div>
                        <div class="ulsd-tote-label">
                            <strong style="font-size:0.75rem">${t.name}</strong>
                            <span style="font-size:0.68rem;color:#666">${t.hint}</span>
                            <span style="font-size:0.72rem">Target: <strong>${t.target} ${t.unit}</strong></span>
                        </div>
                        <div class="ulsd-gauge-wrapper">
                            <div class="ulsd-gauge-bg">
                                <div class="ulsd-gauge-fill" id="gauge-${t.id}" style="width:0%;background:${t.color}"></div>
                                <div class="ulsd-gauge-target" style="left:50%"></div>
                                <div class="ulsd-gauge-overtx" style="left:60%"></div>
                            </div>
                            <span class="ulsd-dose-display" id="dose-${t.id}">0 ${t.unit}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div id="ulsd-feedback" class="ulsd-feedback hidden"></div>
        `;

        setupULSDTreatmentHandlers(container, labCheck);
        startULSDTimer(container, labCheck);

        if (testBtn) {
            testBtn.innerText = '🧪 Lab Check';
            testBtn.onclick = () => {
                if (state.ulsdTimerInterval) { clearInterval(state.ulsdTimerInterval); state.ulsdTimerInterval = null; }
                const eval_ = evaluateULSD(state.ulsdDoses, state.ulsdTreatments);
                runLabTest('', () => ({
                    pass: eval_.overallGrade !== 'fail', grade: eval_.overallGrade, results: eval_.results,
                    msg: eval_.overallGrade === 'pass'
                        ? 'All treatments perfectly dosed! ULSD is lab-certified and ready to ship. ✅'
                        : eval_.overallGrade === 'warning'
                            ? 'Blend passes but overtreatment cost money. Real refineries track additive costs carefully.'
                            : 'Treatment failure — one or more additives are out of spec. Product cannot be released.'
                }), eval_.overallGrade);
            };
        }
    }
}

// ── JET COA GAME HELPERS ────────────────────────────────────────────────────

function renderJetCOA() {
    const card = getEl('jet-batch-card');
    if (!card) return;
    const batches = state.jetBatches;
    if (state.jetBatchIndex >= batches.length) {
        card.innerHTML = '<p style="text-align:center;padding:16px;color:#888">⏳ Awaiting next batch…</p>';
        return;
    }
    const batch = batches[state.jetBatchIndex];
    const batchNum = state.jetBatchIndex + 1;

    function specRow(key, value, delay) {
        const lim = JET_LIMITS[key];
        const inSpec = value >= lim.min && value <= lim.max;
        const display = key === 'freeze' ? value + lim.unit : value + ' ' + lim.unit;
        // Removed the instant red background so the user has to evaluate the numbers!
        return `<div class="jet-spec-row" style="animation:specReveal 0.3s ease ${delay}s both">
            <span class="jet-spec-name">${lim.emoji} ${lim.label}</span>
            <span class="jet-spec-range">${lim.range}</span>
            <strong style="color:#333">${display} <span class="jet-hint-fade" style="color:${inSpec ? '#2e7d32' : '#c53030'}">${inSpec ? '✅' : '❌'}</span></strong>
        </div>`;
    }

    card.innerHTML = `
        <div class="jet-batch-header">📋 COA — Batch ${batchNum} of ${batches.length}</div>
        ${specRow('flash', batch.flash, 0.0)}
        ${specRow('freeze', batch.freeze, 0.1)}
        ${specRow('sulfur', batch.sulfur, 0.2)}
        ${specRow('density', batch.density, 0.3)}
        ${specRow('smoke', batch.smoke, 0.4)}
    `;

}

function fillTestTank(callback) {
    const fill = getEl('jet-test-fill');
    const arrow = getEl('jet-flow-arrow');
    if (fill) {
        fill.className = 'jet-test-fill';
        fill.style.height = '0%';
        void fill.offsetWidth; // force reflow
        fill.classList.add('jet-test-filling');
    }
    if (arrow) { arrow.textContent = '→'; arrow.className = 'jet-flow-arrow'; }
    setTimeout(callback, 1200);
}

function drainTestTank(mode) {
    // mode: 'approve', 'reject-good', 'reject-bad'
    const fill = getEl('jet-test-fill');
    const arrow = getEl('jet-flow-arrow');
    if (!fill) return;

    fill.classList.remove('jet-test-filling');

    if (mode === 'approve') {
        fill.classList.add('jet-test-draining-good');
        if (arrow) { arrow.textContent = '→ ✅'; arrow.classList.add('jet-flow-good'); }
    } else if (mode === 'reject-bad') {
        fill.classList.add('jet-test-draining-bad');
        if (arrow) { arrow.textContent = '↓ 🚫'; arrow.classList.add('jet-flow-bad'); }
    } else {
        fill.classList.add('jet-test-draining-warn');
        if (arrow) { arrow.textContent = '↓ ⚠️'; arrow.classList.add('jet-flow-warn'); }
    }
}

function startJetCOAGame(container, labCheck) {
    const timerEl = getEl('jet-timer');
    const acceptBtn = getEl('jet-accept');
    const rejectBtn = getEl('jet-reject');
    const testBtn = getEl('test-btn');
    if (!acceptBtn || !rejectBtn) return;

    function updateJetHUD() {
        const fillEl = getEl('jet-tank-fill');
        const pctEl = getEl('jet-tank-pct');
        const coaEl = getEl('jet-coa-count');
        const lostEl = getEl('jet-lost-bbl');
        const lostHud = getEl('jet-lost-hud');
        if (fillEl) fillEl.style.height = state.jetTankLevel + '%';
        if (pctEl) pctEl.textContent = state.jetTankLevel + '%';
        if (coaEl) coaEl.textContent = state.jetCoaCount;
        if (lostEl) lostEl.textContent = state.jetLostBbl.toLocaleString();
        if (lostHud && state.jetLostBbl > 0) lostHud.classList.remove('hidden');
        if (timerEl) timerEl.textContent = state.jetTimeLeft;
    }

    function presentBatch() {
        if (state.jetBatchIndex >= state.jetBatches.length) {
            // Ran out of batches — rebuild queue and continue
            state.jetBatches = buildJetBatchQueue();
            state.jetBatchIndex = 0;
        }
        acceptBtn.disabled = true;
        rejectBtn.disabled = true;

        fillTestTank(() => {
            renderJetCOA();
            acceptBtn.disabled = false;
            rejectBtn.disabled = false;
        });
    }

    function handleJetDecision(accepted) {
        if (state.jetBatchIndex >= state.jetBatches.length) return;
        const batch = state.jetBatches[state.jetBatchIndex];
        const fb = getEl('jet-feedback');
        acceptBtn.disabled = true;
        rejectBtn.disabled = true;

        if (accepted && !batch.good) {
            // INSTANT FAIL — contamination
            if (state.jetTimerInterval) { clearInterval(state.jetTimerInterval); state.jetTimerInterval = null; }
            drainTestTank('approve');
            const cargoFill = getEl('jet-tank-fill');
            if (cargoFill) cargoFill.style.background = 'linear-gradient(to top, #fca5a5, #ef4444)';
            if (fb) {
                fb.classList.remove('hidden');
                fb.className = 'jet-feedback fail-flash';
                fb.innerHTML = `❌ CONTAMINATION — You approved an off-spec batch!<br>
                    <small>${batch.failMsg}</small><br>
                    <small style="color:#c53030;font-weight:bold">One bad COA contaminates the entire cargo tank. In aviation, this grounds the fleet.</small>`;
            }
            setTimeout(() => setupMinigame(), 5000);
            return;
        }

        let fbMsg = '', fbClass = 'jet-feedback';

        if (accepted && batch.good) {
            state.jetTankLevel = Math.min(100, state.jetTankLevel + 25);
            state.jetTimeLeft = Math.min(120, state.jetTimeLeft + 3);
            state.jetCoaCount++;
            drainTestTank('approve');
            fbMsg = `✅ COA #${state.jetCoaCount} approved — batch transferred to cargo tank. +25% capacity, +3s`;
            fbClass = 'jet-feedback pass-flash';

        } else if (!accepted && !batch.good) {
            state.jetTimeLeft = Math.max(0, state.jetTimeLeft - 2);
            state.jetCoaCount++;
            drainTestTank('reject-bad');
            const failLim = JET_LIMITS[batch.failSpec];
            fbMsg = `🛡️ Smart catch! ${failLim ? failLim.emoji + ' ' + failLim.label + ' out of spec.' : 'Off-spec detected.'} Batch diverted to slop tank. -2s<br><small style="color:#15803d;font-weight:bold">${batch.failMsg}</small>`;
            fbClass = 'jet-feedback warn-flash';


        } else if (!accepted && batch.good) {
            state.jetTimeLeft = Math.max(0, state.jetTimeLeft - 5);
            state.jetLostBbl += 1000;
            drainTestTank('reject-good');
            fbMsg = `❗ That batch was on-spec! All 5 specs passed — 1,000 bbl of good jet fuel wasted. -5s penalty`;
        }

        if (fb) {
            fb.className = fbClass;
            fb.innerHTML = fbMsg;
            fb.classList.remove('hidden');
            setTimeout(() => fb.classList.add('hidden'), 2800);
        }

        updateJetHUD();
        state.jetBatchIndex++;

        // Check win
        if (state.jetTankLevel >= 100) {
            if (state.jetTimerInterval) { clearInterval(state.jetTimerInterval); state.jetTimerInterval = null; }
            const card = getEl('jet-batch-card');
            if (card) card.innerHTML = `<div style="text-align:center;padding:16px;color:#2e7d32;font-weight:bold">
                ✈️ Cargo tank full! Jet A certified for delivery.<br>
                <small>COAs reviewed: ${state.jetCoaCount} | ${state.jetLostBbl > 0 ? 'Product lost: ' + state.jetLostBbl.toLocaleString() + ' bbl' : 'Zero product loss — perfect run!'}</small>
            </div>`;
            if (labCheck) labCheck.classList.remove('hidden');
            if (testBtn) {
                testBtn.innerText = '🧪 Certify Jet Tank';
                testBtn.disabled = false;
                testBtn.onclick = () => {
                    runLabTest('Cargo tank certified. Jet A COA package complete. ✅', null, 'pass');
                };
            }
            return;
        }

        // Next batch after drain animation
        setTimeout(() => presentBatch(), 1400);
    }

    acceptBtn.onpointerdown = (e) => { e.preventDefault(); handleJetDecision(true); };
    rejectBtn.onpointerdown = (e) => { e.preventDefault(); handleJetDecision(false); };

    // Start timer
    state.jetTimerInterval = setInterval(() => {
        state.jetTimeLeft--;
        if (timerEl) timerEl.textContent = state.jetTimeLeft;
        if (state.jetTimeLeft <= 0) {
            clearInterval(state.jetTimerInterval); state.jetTimerInterval = null;
            acceptBtn.disabled = true; rejectBtn.disabled = true;
            const card = getEl('jet-batch-card');
            if (card) card.innerHTML = `<div style="text-align:center;padding:16px;color:#c53030;font-weight:bold">
                ⏱ You missed the delivery window!<br>
                <small>Cargo tank only reached ${state.jetTankLevel}%. Real aviation operations require consistent COA review to keep product flowing. Try again!</small>
            </div>`;
            setTimeout(() => setupMinigame(), 4000);
        }
    }, 1000);

    // Present first batch
    presentBatch();
}

// ── ULSD GAME HELPERS ─────────────────────────────────────────────────────────

function setupULSDTreatmentHandlers(container, labCheck) {
    function spawnPpmDrop(color) {
        const tank = getEl('ulsd-visual-tank');
        if (!tank) return;
        const drop = document.createElement('div');
        drop.className = 'ulsd-ppm-drop';
        drop.style.background = color;
        // Randomize the drop position along the top of the tank
        drop.style.left = (10 + Math.random() * 80) + '%';
        tank.appendChild(drop);
        // Clean up the DOM element after the animation finishes
        setTimeout(() => drop.remove(), 1200);
    }

    state.ulsdTreatments.forEach(t => {
        const toteEl = getEl(`tote-${t.id}`);
        const gaugeEl = getEl(`gauge-${t.id}`);
        const doseEl = getEl(`dose-${t.id}`);
        if (!toteEl) return;

        let holdInterval = null;

        function addDose() {
            const prevDose = state.ulsdDoses[t.id];
            state.ulsdDoses[t.id] = Math.min(t.target * 3, state.ulsdDoses[t.id] + t.step);
            const dose = state.ulsdDoses[t.id];

            // Fire the visual drops only if the tank actually accepted more fluid
            if (dose > prevDose) {
                // Scale the visual drops based on the actual ppm step size!
                // 1 ppm = 1 drop. 25 ppm = ~7 drops per tick.
                const dropsToSpawn = Math.max(1, Math.ceil(t.step / 4));
                for (let i = 0; i < dropsToSpawn; i++) {
                    // Stagger the spawns slightly so it looks like a natural shower of droplets
                    setTimeout(() => spawnPpmDrop(t.color), Math.random() * 150);
                }
            }

            if (doseEl) doseEl.textContent = dose + ' ' + t.unit;
            // Fill bar: target = 50% of bar; 2x target = 100%
            const pct = Math.min(100, (dose / (t.target * 2)) * 100);
            if (gaugeEl) {
                gaugeEl.style.width = pct + '%';
                const ratio = dose / t.target;
                gaugeEl.style.background = ratio < 1 ? '#f87171' : ratio <= 1.2 ? t.color : ratio <= 2 ? '#fbbf24' : '#c53030';
            }
            // Check if all treated

            const allTreated = state.ulsdTreatments.every(tx => (state.ulsdDoses[tx.id] || 0) >= tx.target);
            const testBtn = getEl('test-btn');

            if (allTreated) {
                if (labCheck) labCheck.classList.remove('hidden');
                if (testBtn) testBtn.disabled = false;
            } else {
                if (labCheck) labCheck.classList.add('hidden');
                if (testBtn) testBtn.disabled = true;
            }

        }

        function stopDose(e) {
            if (holdInterval) {
                clearInterval(holdInterval);
                holdInterval = null;
            }
            // Release the pointer back to the browser safely
            if (e && e.pointerId) {
                try { toteEl.releasePointerCapture(e.pointerId); } catch (err) { }
            }
        }

        toteEl.addEventListener('pointerdown', e => {
            e.preventDefault();
            stopDose(); // Safety clear
            try { toteEl.setPointerCapture(e.pointerId); } catch (err) { } // Prevent scrolling while holding

            addDose();
            holdInterval = setInterval(addDose, 120);

            // Track globally for hard resets
            if (!window.ulsdToteIntervals) window.ulsdToteIntervals = [];
            window.ulsdToteIntervals.push(holdInterval);
        });

        toteEl.addEventListener('pointerup', stopDose);
        toteEl.addEventListener('pointerleave', stopDose);
        toteEl.addEventListener('pointercancel', stopDose); // Fires when scrolling hijacks the touch!
        toteEl.addEventListener('contextmenu', stopDose);   // Fires on long-press menus
    });
}


function startULSDTimer(container, labCheck) {
    const timerEl = getEl('ulsd-timer');
    const testBtn = getEl('test-btn');
    state.ulsdTimerInterval = setInterval(() => {
        state.ulsdTimeLeft--;
        if (timerEl) timerEl.textContent = state.ulsdTimeLeft;
        if (state.ulsdTimeLeft <= 0) {
            clearInterval(state.ulsdTimerInterval); state.ulsdTimerInterval = null;
            const fb = getEl('ulsd-feedback');
            if (fb) {
                fb.className = 'ulsd-feedback fail-flash';
                fb.textContent = '⏱ Time expired! Treatment incomplete — batch must be redone.';
                fb.classList.remove('hidden');
            }
            setTimeout(() => setupMinigame(), 3500);
        }
    }, 1000);
}

// =============================================================================
// CHANGE 4: REPLACE runLabTest() FUNCTION
// Location: Find `function runLabTest(defaultMsg, validateFn) {` and replace
//           the entire function with the one below.
// The change adds support for a 'warning' (yellow) grade with proceed/retry
// options, and product-unique lab messages.
// =============================================================================

function runLabTest(defaultMsg, validateFn, gradeHint) {
    const testBtn = getEl('test-btn');
    const progressContainer = getEl('test-progress-container');
    const bar = getEl('test-progress');

    if (testBtn) testBtn.disabled = true;
    if (progressContainer) progressContainer.classList.remove('hidden');
    let width = 0;
    if (bar) {
        bar.style.width = '0%';
        bar.style.backgroundColor = '#48bb78';
    }

    const loadInterval = setInterval(() => {
        width += 20;
        if (bar) bar.style.width = width + '%';

        if (width >= 100) {
            clearInterval(loadInterval);

            let grade = 'pass';
            let finalMsg = defaultMsg;
            let resultDetails = null;

            if (validateFn) {
                const resultObj = validateFn();
                grade = resultObj.grade || (resultObj.pass === false ? 'fail' : 'pass');
                finalMsg = resultObj.msg || defaultMsg;
                resultDetails = resultObj;
            }
            if (gradeHint) grade = gradeHint; // override from caller

            const resultEl = getEl('test-result');

            // Lab message unique to product
            const labIntro = {
                gasoline: '⛽ Gasoline Lab: ',
                jetfuel: '✈️ Jet Lab: ',
                diesel: '🛢️ ULSD Lab: '
            }[state.product] || '🧪 Lab: ';

            if (resultEl) {
                resultEl.classList.remove('hidden');
                resultEl.style.transition = 'color 0.3s';

                if (grade === 'pass') {
                    // --- V-804: Track gasoline grade completion ---
                    if (state.product === 'gasoline' && state.gasProduct) {
                        if (!state.gasGradesCompleted.includes(state.gasProduct)) {
                            state.gasGradesCompleted.push(state.gasProduct);
                        }
                        markUnitComplete('gasoline');
                        const gradeBtn = document.querySelector(`.grade-btn[data-grade="${state.gasProduct}"]`);
                        if (gradeBtn) { gradeBtn.classList.add('grade-done'); gradeBtn.innerHTML = '✅ ' + GAS_PRODUCTS[state.gasProduct].label; }
                    }
                    // --- V-804: Track ULSD completion ---
                    if (state.product === 'diesel') {
                        markUnitComplete('ulsd');
                    }
                    if (state.product === 'jetfuel') {
                        markUnitComplete('jetfuel');
                    }


                    resultEl.style.color = '#2e7d32';
                    resultEl.style.background = '#f0fdf4';
                    resultEl.style.border = '2px solid #48bb78';

                    if (state.product === 'gasoline') {
                        const done = state.gasGradesCompleted.length;
                        const canProceed = done >= 2;
                        resultEl.innerHTML = `✅ PASS! ${labIntro}${finalMsg}
                            <div style="margin-top:8px;font-size:0.8rem;color:#555">${done}/4 grades certified${canProceed ? ' — ready to ship!' : ' — need 2 to ship'}</div>
                            <div style="margin-top:8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                                <button class="btn interactive-element" id="lab-retry-btn"
                                    style="background:#2b6cb0;color:#fff;padding:6px 14px;font-size:0.85rem">
                                    🔄 Blend Another Grade
                                </button>
                                ${canProceed ? `<button class="btn interactive-element" id="lab-proceed-btn"
                                    style="background:#2e7d32;color:#fff;padding:6px 14px;font-size:0.85rem">
                                    🚛 Ship to Logistics
                                </button>` : ''}
                            </div>`;
                        setTimeout(() => {
                            const retryBtn = getEl('lab-retry-btn');
                            const proceedBtn = getEl('lab-proceed-btn');
                            if (retryBtn) retryBtn.onclick = () => setupMinigame();
                            if (proceedBtn) proceedBtn.onclick = () => {
                                showFunFact('blending', () => { updateProductIcon(); showPhase('5'); });
                            };
                        }, 100);
                        if (bar) bar.style.backgroundColor = '#48bb78';
                        return; // Don't auto-advance for gasoline
                    }

                    resultEl.innerText = `✅ PASS! ${labIntro}${finalMsg}`;
                    if (bar) bar.style.backgroundColor = '#48bb78';

                } else if (grade === 'warning') {
                    resultEl.style.color = '#92400e';
                    resultEl.style.background = '#fffbeb';
                    resultEl.style.border = '2px solid #f59e0b';
                    resultEl.innerHTML = `⚠️ PASS WITH GIVEAWAY<br><small>${labIntro}${finalMsg}</small>
                        <div style="margin-top:8px;display:flex;gap:8px;justify-content:center">
                            <button class="btn interactive-element" id="lab-proceed-btn"
                                style="background:#f59e0b;color:#fff;padding:6px 14px;font-size:0.85rem">
                                Proceed Anyway
                            </button>
                            <button class="btn interactive-element" id="lab-retry-btn"
                                style="background:#fff;color:#92400e;border:1px solid #f59e0b;padding:6px 14px;font-size:0.85rem">
                                Try for Perfect
                            </button>
                        </div>`;
                    if (bar) bar.style.backgroundColor = '#f59e0b';

                    // Bind proceed/retry
                    setTimeout(() => {
                        const proceedBtn = getEl('lab-proceed-btn');
                        const retryBtn = getEl('lab-retry-btn');
                        if (proceedBtn) proceedBtn.onclick = () => {
                            // Track grade completion on proceed-with-warning
                            if (state.product === 'gasoline' && state.gasProduct) {
                                if (!state.gasGradesCompleted.includes(state.gasProduct)) {
                                    state.gasGradesCompleted.push(state.gasProduct);
                                }
                                markUnitComplete('gasoline');
                                if (state.gasGradesCompleted.length < 2) { setupMinigame(); return; }
                            }
                            if (state.product === 'diesel') markUnitComplete('ulsd');
                            showFunFact('blending', () => {
                                updateProductIcon();
                                showPhase('5');
                            });
                        };
                        if (retryBtn) retryBtn.onclick = () => setupMinigame();
                    }, 100);
                    return; // Don't auto-advance

                } else {
                    // FAIL
                    resultEl.style.color = '#c53030';
                    resultEl.style.background = '#fff5f5';
                    resultEl.style.border = '2px solid #c53030';
                    resultEl.innerText = `❌ FAIL ${labIntro}${finalMsg}`;
                    if (bar) bar.style.backgroundColor = '#c53030';
                }
            }

            if (grade === 'pass') {
                setTimeout(() => {
                    showFunFact('blending', () => {
                        updateProductIcon();
                        showPhase('5');
                    });
                }, 1800);
            } else if (grade === 'fail') {
                setTimeout(() => setupMinigame(), 3500);
            }
        }
    }, 200);
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
    markUnitComplete('logistics');
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
    registerPhaseTimeout('transport', () => {
        const finaleMsg = getEl('finale-message');
        if (finaleMsg) finaleMsg.innerText = info.message;

        showPhase('finale');

        // Reveal game map on completionref
        const gameMap = getEl('game-map');
        if (gameMap) gameMap.classList.remove('hidden');

        registerPhaseTimeout('finale', triggerConfetti, 500);
    }, 3200);
}

/* =========================================
   PIPE X-RAY MINIGAME LOGIC
========================================= */
const PIPE_XRAY_DURATION = 45;
const NUM_PIPE_DEFECTS = 3;

function cleanupPipeXray() {
    if (state.pipeGameState.timer) {
        clearInterval(state.pipeGameState.timer);
        state.pipeGameState.timer = null;
    }

    const wrapper = getEl('pipe-xray-wrapper');
    if (wrapper) {
        // Remove global event listeners specifically bound to this element
        // (Using cloneNode is a clean way to strip all event listeners in vanilla JS)
        const newWrapper = wrapper.cloneNode(true);
        wrapper.parentNode.replaceChild(newWrapper, wrapper);
    }

    const lens = getEl('xray-scanner-lens');
    if (lens) lens.style.display = 'none';

    // Remove all thin spots
    document.querySelectorAll('.thin-spot').forEach(el => el.remove());
}

function setXrayTool(toolName) {
    state.pipeGameState.activeTool = toolName;

    const btnScanner = getEl('tool-scanner');
    const btnClamp = getEl('tool-clamp');
    const lens = getEl('xray-scanner-lens');

    if (toolName === 'scanner') {
        btnScanner.classList.add('active');
        btnScanner.style.background = '';
        btnClamp.classList.remove('active');
        btnClamp.style.background = 'var(--color-gray-600)';
        if (lens) lens.style.display = 'block';
    } else {
        btnClamp.classList.add('active');
        btnClamp.style.background = '';
        btnScanner.classList.remove('active');
        btnScanner.style.background = 'var(--color-gray-600)';
        if (lens) lens.style.display = 'none';
    }
};

function setupPipeXray() {
    cleanupPipeXray(); // Ensure clean slate
    state.product = pipeXrayRouteContext.product || DEFAULT_PIPE_XRAY_ROUTE.product;

    state.pipeGameState = {
        timer: null,
        timeLeft: PIPE_XRAY_DURATION,
        spotsClamped: 0,
        activeTool: 'scanner'
    };

    const timerDisplay = getEl('pxray-timer');
    const timeBar = getEl('pxray-time-bar');
    const scoreDisplay = getEl('pxray-score');
    const restartBtn = getEl('pxray-restart-btn');
    const wrapper = getEl('pipe-xray-wrapper');
    const playArea = getEl('pipe-xray-playarea');
    const lens = getEl('xray-scanner-lens');

    if (!wrapper || !playArea) return;

    // Reset UI
    if (timerDisplay) { timerDisplay.textContent = PIPE_XRAY_DURATION.toFixed(1) + 's'; timerDisplay.style.color = 'var(--color-navy)'; }
    if (timeBar) { timeBar.style.width = '100%'; timeBar.style.background = '#48bb78'; }
    if (scoreDisplay) scoreDisplay.textContent = `0/${NUM_PIPE_DEFECTS}`;
    if (restartBtn) restartBtn.classList.add('hidden');
    wrapper.style.pointerEvents = 'auto'; // Re-enable interaction
    wrapper.style.border = '';

    // Force scanner tool default
    setXrayTool('scanner');

    // Spawn hidden defects
    const defects = [];
    const padding = 30; // Don't spawn right on the edge

    for (let i = 0; i < NUM_PIPE_DEFECTS; i++) {
        const spot = document.createElement('div');
        spot.className = 'thin-spot';

        // Lock Y position to the center of one of the 3 horizontal pipes
        const w = playArea.clientWidth || 400;
        const pipeCenters = [43, 100, 157]; // Aligns with CSS flex space-evenly layout

        const x = padding + Math.random() * (w - padding * 2);
        const y = pipeCenters[Math.floor(Math.random() * pipeCenters.length)];

        spot.style.left = `${x}px`;
        spot.style.top = `${y}px`;
        spot.dataset.id = `defect-${i}`;
        spot.dataset.clamped = 'false';

        playArea.appendChild(spot);

        defects.push({
            element: spot,
            x: x,
            y: y,
            clamped: false
        });
    }

    // Pointer event handling for the wrapper
    wrapper.addEventListener('pointermove', handlePointerMove);
    wrapper.addEventListener('pointerdown', handlePointerDown);

    // Prevent default touch actions (crucial for drag)
    wrapper.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

    function updateScannerPosition(clientX, clientY) {
        const rect = wrapper.getBoundingClientRect();
        let x = clientX - rect.left;
        let y = clientY - rect.top;

        // Constrain to container
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x > rect.width) x = rect.width;
        if (y > rect.height) y = rect.height;

        if (lens) {
            lens.style.left = `${x}px`;
            lens.style.top = `${y}px`;
        }

        // Check for overlaps if scanner is active
        if (state.pipeGameState.activeTool === 'scanner') {
            const scannerRadius = 45; // Half of 90px width

            defects.forEach(defect => {
                if (defect.clamped) return;

                const dx = x - defect.x;
                const dy = y - defect.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Defect rad is 20px. Overlap if distance < (scannerRad + defectRad)
                if (distance < (scannerRadius + 20)) {
                    defect.element.classList.add('revealed');
                } else {
                    defect.element.classList.remove('revealed');
                }
            });
        }
    }

    function handlePointerMove(e) {
        if (state.pipeGameState.timeLeft <= 0 || state.pipeGameState.spotsClamped >= NUM_PIPE_DEFECTS) return; // Game over
        if (state.pipeGameState.activeTool === 'scanner') {
            updateScannerPosition(e.clientX, e.clientY);
        }
    }

    function handlePointerDown(e) {
        if (state.pipeGameState.timeLeft <= 0 || state.pipeGameState.spotsClamped >= NUM_PIPE_DEFECTS) return; // Game over

        const rect = wrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Scanner tool logic: mark spots
        if (state.pipeGameState.activeTool === 'scanner') {
            updateScannerPosition(e.clientX, e.clientY);
            try { wrapper.setPointerCapture(e.pointerId); } catch (err) { }

            // If scanning over a spot, mark it for later
            defects.forEach(defect => {
                if (defect.clamped || defect.marked) return;

                const dx = clickX - defect.x;
                const dy = clickY - defect.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Slightly tighter radius for explicitly marking
                const scannerRadius = 45;
                if (distance < (scannerRadius + 15)) {
                    defect.marked = true;
                    defect.element.classList.add('marked');
                    // Optional: play a small sound or log it
                }
            });

            return;
        }

        // Clamp tool logic: fix spots
        if (state.pipeGameState.activeTool === 'clamp') {
            // Check if they clicked near a revealed OR marked defect
            defects.forEach(defect => {
                if (defect.clamped) return;

                const dx = clickX - defect.x;
                const dy = clickY - defect.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // To clamp, it MUST be marked, or they happen to be clicking 
                // exactly where they remembered it was. Marking makes it obvious.
                if (distance < 30 && (defect.marked || defect.element.classList.contains('revealed'))) {
                    defect.clamped = true;
                    defect.element.dataset.clamped = 'true';
                    defect.element.classList.add('clamped');
                    defect.element.classList.remove('revealed');
                    defect.element.classList.remove('marked');

                    // Change visual to clamp
                    defect.element.style.background = '#4a5568';
                    defect.element.style.border = '2px solid #2d3748';
                    defect.element.style.boxShadow = 'inset 0 0 10px rgba(0,0,0,0.8)';
                    defect.element.style.filter = 'none';
                    defect.element.innerText = '🔧';
                    defect.element.style.display = 'flex';
                    defect.element.style.alignItems = 'center';
                    defect.element.style.justifyContent = 'center';
                    defect.element.style.fontSize = '2rem';

                    state.pipeGameState.spotsClamped++;
                    if (scoreDisplay) scoreDisplay.textContent = `${state.pipeGameState.spotsClamped}/${NUM_PIPE_DEFECTS}`;

                    // Check Win
                    if (state.pipeGameState.spotsClamped >= NUM_PIPE_DEFECTS) {
                        winPipeXray();
                    }
                }
            });
        }
    }

    // Start Timer
    const tickRate = 100; // ms
    state.pipeGameState.timer = setInterval(() => {
        state.pipeGameState.timeLeft -= (tickRate / 1000);

        if (state.pipeGameState.timeLeft <= 0) {
            state.pipeGameState.timeLeft = 0;
            losePipeXray();
        }

        // Update UI
        if (timerDisplay) {
            timerDisplay.textContent = state.pipeGameState.timeLeft.toFixed(1) + 's';
            if (state.pipeGameState.timeLeft < 10) {
                timerDisplay.style.color = 'var(--color-red)';
            }
        }
        if (timeBar) {
            const pct = (state.pipeGameState.timeLeft / PIPE_XRAY_DURATION) * 100;
            timeBar.style.width = `${pct}%`;
            if (pct < 25) {
                timeBar.style.background = 'var(--color-red)';
            } else if (pct < 50) {
                timeBar.style.background = 'var(--color-orange)';
            }
        }

    }, tickRate);
}

function winPipeXray() {
    clearInterval(state.pipeGameState.timer);
    state.pipeGameState.timer = null;

    const wrapper = getEl('pipe-xray-wrapper');
    const lens = getEl('xray-scanner-lens');

    if (wrapper) wrapper.style.pointerEvents = 'none';
    if (lens) lens.style.display = 'none';

    markUnitComplete('pipe-xray');

    registerPhaseTimeout('pipe-xray', () => {
        state.product = pipeXrayRouteContext.product || DEFAULT_PIPE_XRAY_ROUTE.product;
        showFunFact('pipe_xray', () => {
            showPhase(pipeXrayRouteContext.nextPhase || DEFAULT_PIPE_XRAY_ROUTE.nextPhase);
        });
    }, 1500);
}

function losePipeXray() {
    clearInterval(state.pipeGameState.timer);
    state.pipeGameState.timer = null;

    const wrapper = getEl('pipe-xray-wrapper');
    const restartBtn = getEl('pxray-restart-btn');
    const lens = getEl('xray-scanner-lens');
    const timerDisplay = getEl('pxray-timer');

    if (wrapper) {
        wrapper.style.pointerEvents = 'none';
        // Visual leak feedback
        wrapper.style.border = '4px solid var(--color-red)';
    }
    if (lens) lens.style.display = 'none';
    if (timerDisplay) timerDisplay.textContent = 'LEAK DEVELOPED!';

    if (restartBtn) restartBtn.classList.remove('hidden');
}

function setPipeXrayRouteContext(options = {}) {
    const {
        product = DEFAULT_PIPE_XRAY_ROUTE.product,
        nextPhase = DEFAULT_PIPE_XRAY_ROUTE.nextPhase
    } = options;

    pipeXrayRouteContext = { product, nextPhase };
    state.product = product;
    return pipeXrayRouteContext;
}

function startPipeXray(options = {}) {
    const {
        skipShowPhase = false,
        product = pipeXrayRouteContext.product || DEFAULT_PIPE_XRAY_ROUTE.product,
        nextPhase = pipeXrayRouteContext.nextPhase || DEFAULT_PIPE_XRAY_ROUTE.nextPhase
    } = options;

    setPipeXrayRouteContext({ product, nextPhase });
    physicsEngine.world.gravity.y = 1;
    cancelFunFactFlow();
    scrollGameIntoView();

    if (skipShowPhase || activePhaseId === 'pipe-xray') {
        setupPipeXray();
        return;
    }

    showPhase('pipe-xray');
}

// Pipe X-ray definition complete


/* =========================================
 RESET GAME
========================================= */
function resetGame() {
    // Clear saved phase, but remember the map!
    const saved = localStorage.getItem('refineryRunProgress');
    let wasMapUnlocked = false;
    if (saved) {
        wasMapUnlocked = JSON.parse(saved).mapUnlocked;
    }
    localStorage.setItem('refineryRunProgress', JSON.stringify({ phase: '1', product: null, mapUnlocked: wasMapUnlocked, completedUnits: state.completedUnits, gasGradesCompleted: [] }));

    physicsEngine.world.gravity.y = 1;
    if (typeof vacTimeouts !== 'undefined') vacTimeouts.forEach(clearTimeout);
    if (typeof vacIntervals !== 'undefined') vacIntervals.forEach(clearInterval);
    if (typeof cokerIntervals !== 'undefined') cokerIntervals.forEach(clearInterval);
    if (typeof fccIntervals !== 'undefined') fccIntervals.forEach(clearInterval);
    if (typeof alkyIntervals !== 'undefined') alkyIntervals.forEach(clearInterval);
    if (window.ulsdToteIntervals) window.ulsdToteIntervals.forEach(clearInterval);
    document.querySelectorAll('.alky-mol, .alky-tar').forEach(e => e.remove());
    // ---------------------------------------------
    clearPhysics('vac-container');
    clearPhysics('crude-tank');
    clearPhysics('gasoline-vat');
    state.phase = 1;
    state.product = null;
    state.clicks = 0;
    state.gasGradesCompleted = [];
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
    cancelFunFactFlow();

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
   INITIALIZATION & AUTO-LOAD
========================================= */
function loadGame() {
    const saved = localStorage.getItem('refineryRunProgress');

    pendingResume = null;

    if (saved) {
        try {
            const progress = JSON.parse(saved);

            // Preserve the map unlocked behavior exactly as you have it
            if (progress.mapUnlocked) {
                const gameMap = getEl('game-map');
                if (gameMap) gameMap.classList.remove('hidden');
            }

            // Restore V-804 progress
            if (Array.isArray(progress.completedUnits)) {
                state.completedUnits = progress.completedUnits;
            }
            if (Array.isArray(progress.gasGradesCompleted)) {
                state.gasGradesCompleted = progress.gasGradesCompleted;
            }
            updateMapUI();

            // V-804 print handler
            const printBtn = getEl('v804-print-btn');

            if (printBtn) {
                printBtn.onclick = () => {
                    // 1. Gather Inputs
                    const titleEl = getEl('v804-title');
                    const explorerTitle = titleEl ? titleEl.value : 'Refinery Explorer';

                    const nameInput = getEl('v804-name');
                    const name = nameInput ? nameInput.value.trim() : '';

                    if (!name) {
                        alert('Please enter your name.');
                        return;
                    }

                    // Optional tracking
                    if (typeof track === 'function') {
                        track('certificate_printed', { name_length: name.length });
                    }

                    // 2. Safe HTML escape
                    const escapeHTML = (str) =>
                        String(str)
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#39;');

                    const safeName = escapeHTML(name);
                    const safeTitle = escapeHTML(explorerTitle);

                    // 3. Pre-render unit list (in the parent window context)
                    const units = (typeof V804_UNITS !== 'undefined' && Array.isArray(V804_UNITS)) ? V804_UNITS : [];
                    const unitsCount = units.length;

                    const unitsHTML = units
                        .map((u, i) => {
                            const label = escapeHTML(u && u.label ? u.label : `Unit ${i + 1}`);
                            return `<div class="item">☑ ${i + 1}. ${label}</div>`;
                        })
                        .join('');

                    // 4. Open the new window
                    const win = window.open('', '_blank');
                    if (!win) {
                        alert('Popup blocked! Please allow popups for this site to print the certificate.');
                        return;
                    }

                    // 5. QR URL (Base64 obfuscated to prevent URL scraping)
                    const rawBookUrl = atob('aHR0cHM6Ly9zaG9wLmluZ3JhbXNwYXJrLmNvbS9iLzA4ND9wYXJhbXM9bHhiMkVqaVZ3S2VNeHkzaURKOWcxTjdwcnNnZGJCUzZHenREdEw0MG5WOA==');
                    const qrUrl =
                        `https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=10` +
                        `&data=${encodeURIComponent(rawBookUrl)}` +
                        `&t=${Date.now()}`;

                    const issuedDate = new Date().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });

                    // 6. Write print document
                    win.document.write(`<!DOCTYPE html>
                            <html>
                            <head>
                              <meta charset="utf-8" />
                              <title>V-804 Certificate</title>
                              <style>
                                @page { size: letter; margin: 0.5in; }
                            
                                html, body {
                                  margin: 0;
                                  padding: 0;
                                  background: #fff;
                                  -webkit-print-color-adjust: exact;
                                  print-color-adjust: exact;
                                }
                            
                                /* Printable area inside margins: 11in - 1in = 10in height */
                                .page {
                                  box-sizing: border-box;
                                  height: 10in;
                                  width: 100%;
                                  overflow: hidden; /* safe: we scale to fit so nothing should clip */
                                  display: flex;
                                  align-items: center;    /* vertical centering */
                                  justify-content: center;/* horizontal centering */
                                }
                            
                                .certificate {
                                  box-sizing: border-box;
                                  width: 100%;
                                  max-width: 8.5in; /* keeps proportions consistent */
                                  padding: 0.33in;
                                  border: 8px double #1a365d;
                            
                                  font-family: Georgia, serif;
                                  text-align: center;
                            
                                  /* Scaling applied by JS */
                                  transform: scale(var(--scale, 1));
                                  transform-origin: top center;
                                }
                            
                                h1 { color: #1a365d; font-size: 2.05rem; margin: 0 0 4px; }
                                h2 { color: #2e7d32; margin: 6px 0 0; font-size: 1.15rem; font-weight: 600; }
                            
                                p {
                                  font-size: 1rem;
                                  color: #333;
                                  max-width: 700px;
                                  margin: 10px auto;
                                  line-height: 1.32;
                                }
                            
                                .name {
                                  font-size: 1.9rem;
                                  color: #1a365d;
                                  margin: 16px 0 6px;
                                  font-style: italic;
                                }
                            
                                .titleEarned {
                                  font-size: 1.05rem;
                                  color: #1a365d;
                                  margin-bottom: 10px;
                                }
                            
                                .divider {
                                  width: 80%;
                                  max-width: 700px;
                                  height: 1px;
                                  background: #1a365d;
                                  opacity: 0.3;
                                  margin: 14px auto;
                                }
                            
                                .grid {
                                  max-width: 760px;
                                  margin: 0 auto;
                                  display: grid;
                                  grid-template-columns: 1fr 1fr;
                                  gap: 8px 14px;
                                  text-align: left;
                                  font-size: 0.95rem;
                                }
                            
                                .item {
                                  padding: 6px 10px;
                                  border: 1px solid rgba(26, 54, 93, 0.15);
                                  border-radius: 8px;
                                  break-inside: avoid;
                                  page-break-inside: avoid;
                                  line-height: 1.15;
                                }
                            
                                .date { color: #555; font-size: 0.95rem; margin-top: 10px; }
                            
                                .qr {
                                  margin-top: 10px;
                                  display: flex;
                                  flex-direction: column;
                                  align-items: center;
                                  gap: 6px;
                                }
                            
                                .qr img {
                                  width: 140px;  /* slightly smaller to protect bottom space */
                                  height: 140px;
                                  border: 2px solid rgba(26, 54, 93, 0.2);
                                  border-radius: 12px;
                                  display: block;
                                }
                            
                                .footer {
                                  margin-top: 10px;
                                  font-size: 0.85rem;
                                  color: #888;
                                }
                            
                                @media print {
                                  html, body { height: auto; }
                                }
                              </style>
                            </head>
                            <body>
                              <div class="page" id="page">
                                <div class="certificate" id="cert">
                                  <h1>🏅 V-804 Refinery Explorer Certificate</h1>
                                  <h2>Fueling Curiosity · The Great Refinery Run</h2>
                            
                                  <p>This certifies that</p>
                                  <div class="name">${safeName}</div>
                                  <div class="titleEarned">Explorer Title: <strong>${safeTitle}</strong></div>
                            
                                  <p>
                                    has successfully completed an introduction to petroleum refining by tracing
                                    crude oil through processing, conversion, blending, certification,
                                    and delivery to consumers.
                                  </p>
                            
                                  <div class="divider"></div>
                                  <p><strong>Processes Explored (${unitsCount})</strong></p>
                            
                                  <div class="grid">
                                    ${unitsHTML}
                                  </div>
                            
                                  <p class="date">Issued: ${issuedDate}</p>
                            
                                  <div class="qr">
                                    <img id="qrImg" src="${qrUrl}" alt="Fueling Curiosity QR Code" />
                                    <div style="font-size:0.85rem;color:#555;">
                                      Scan for an exclusive discount on the book!<br />
                                      <strong>Fueling Curiosity: The ABCs of Refining</strong>
                                    </div>
                                  </div>
                            
                                  <div class="footer">
                                    FuelingCuriosity.com · © ${new Date().getFullYear()} Fueling Curiosity Press
                                  </div>
                                </div>
                              </div>
                            
                              <script>
                                (function () {
                                  const PRINTABLE_HEIGHT_IN = 10;
                                  const PX_PER_IN = 96;
                                  const MAX_WAIT_MS = 5500;
                                  const MIN_SCALE = 0.78;
                            
                                  const page = document.getElementById('page');
                                  const cert = document.getElementById('cert');
                                  const qr = document.getElementById('qrImg');
                            
                                  function setScale(scale) {
                                    if (!cert) return;
                                    cert.style.setProperty('--scale', String(scale));
                                    // Chromium-friendly assist (often improves print scaling behavior)
                                    cert.style.zoom = scale;
                                  }
                            
                                  function fitToOnePage() {
                                    if (!page || !cert) return;
                            
                                    // Reset scaling to measure natural size
                                    setScale(1);
                            
                                    // Allow layout to settle before measuring
                                    const maxPx = PRINTABLE_HEIGHT_IN * PX_PER_IN;
                            
                                    // Use getBoundingClientRect for more reliable measurements post-layout
                                    const rect = cert.getBoundingClientRect();
                                    const contentHeightPx = rect.height;
                            
                                    if (contentHeightPx > maxPx) {
                                      const scale = Math.max(MIN_SCALE, maxPx / contentHeightPx);
                                      setScale(Number(scale.toFixed(3)));
                                    } else {
                                      setScale(1);
                                    }
                                  }
                            
                                  function doPrintOnce() {
                                    if (window.__didPrint) return;
                                    window.__didPrint = true;
                                    window.focus();
                                    window.print();
                                  }
                            
                                  function readyToPrint() {
                                    // Fit after QR+fonts to avoid reflow clipping
                                    fitToOnePage();
                            
                                    // Two frames ensures zoom/transform applies before print opens
                                    requestAnimationFrame(() => {
                                      requestAnimationFrame(() => {
                                        doPrintOnce();
                                      });
                                    });
                                  }
                            
                                  function waitForFontsThenPrint() {
                                    if (document.fonts && document.fonts.ready) {
                                      document.fonts.ready.then(readyToPrint).catch(readyToPrint);
                                    } else {
                                      readyToPrint();
                                    }
                                  }
                            
                                  function waitForQRThenPrint() {
                                    let done = false;
                            
                                    const finish = () => {
                                      if (done) return;
                                      done = true;
                                      waitForFontsThenPrint();
                                    };
                            
                                    setTimeout(finish, MAX_WAIT_MS);
                            
                                    if (!qr) return finish();
                            
                                    if (qr.complete && qr.naturalWidth > 0) return finish();
                            
                                    qr.onload = finish;
                                    qr.onerror = finish;
                                  }
                            
                                  window.onafterprint = () => {
                                    try { window.close(); } catch (e) {}
                                  };
                            
                                  if (document.readyState === 'loading') {
                                    document.addEventListener('DOMContentLoaded', waitForQRThenPrint);
                                  } else {
                                    waitForQRThenPrint();
                                  }
                                })();
                              </script>
                            </body>
                            </html>`);

                    win.document.close();
                    win.focus();
                };
            }


            // Stash the resume point, but DO NOT jump yet
            pendingResume = {
                phase: progress.phase,
                product: progress.product
            };
        } catch (e) {
            console.warn("Save file corrupted, starting fresh.");
        }
    }

    // Always re-enter at splash, without overwriting the saved resume point
    suppressAutosave = true;
    showPhase('0', { skipSave: true });
    suppressAutosave = false;
}

loadGame();
/* =========================================
   BONUS: PUMP SWAP MINIGAME LOGIC
========================================= */
let pumpState = {
    A: { suction: true, motor: true, discharge: true },
    B: { suction: false, motor: false, discharge: false },
    vibration: 10,
    deadheadTimer: 0,
    lastTickAt: 0,
    routeProduct: DEFAULT_PUMP_SWAP_ROUTE.product,
    nextPhase: DEFAULT_PUMP_SWAP_ROUTE.nextPhase,
    failureType: null
};

const PUMP_VIBRATION_START = 10;
const PUMP_VIBRATION_RISE_PER_SECOND = 1.6;
const PUMP_VIBRATION_MILD_SHAKE = 48;
const PUMP_VIBRATION_HARD_SHAKE = 78;
const PUMP_VIBRATION_MAX = 100;
const PUMP_DEADHEAD_LIMIT = 9;
const pumpComponentMeta = {
    suction: { onText: 'Open', offText: 'Closed' },
    motor: { onText: 'Running', offText: 'Stopped' },
    discharge: { onText: 'Open', offText: 'Closed' }
};
const pumpUi = {
    flowBar: getEl('pump-flow-bar'),
    flowStatus: getEl('pump-flow-status'),
    feedback: getEl('pump-feedback-panel'),
    feedbackTitle: getEl('pump-feedback-title'),
    feedbackBody: getEl('pump-feedback-body'),
    retryButton: getEl('pump-retry-btn'),
    vibrationBar: getEl('pump-a-vib-bar'),
    vibrationText: getEl('pump-a-vib-text'),
    bStateText: getEl('pump-b-state-text'),
    skid: getEl('pump-skid'),
    headerLines: {
        suction: getEl('pump-header-suction-line'),
        discharge: getEl('pump-header-discharge-line')
    },
    overlay: getEl('pump-procedure-overlay'),
    pumps: {
        A: {
            container: getEl('pump-a-container'),
            badge: getEl('pump-a-badge'),
            body: getEl('pump-a-pump-body'),
            lines: {
                suction: getEl('pump-a-suction-line'),
                discharge: getEl('pump-a-discharge-line')
            },
            controls: {
                suction: { button: getEl('btn-a-suction'), state: getEl('pump-a-suction-state') },
                motor: { button: getEl('btn-a-motor'), state: getEl('pump-a-motor-state') },
                discharge: { button: getEl('btn-a-discharge'), state: getEl('pump-a-discharge-state') }
            }
        },
        B: {
            container: getEl('pump-b-container'),
            badge: getEl('pump-b-badge'),
            body: getEl('pump-b-pump-body'),
            lines: {
                suction: getEl('pump-b-suction-line'),
                discharge: getEl('pump-b-discharge-line')
            },
            controls: {
                suction: { button: getEl('btn-b-suction'), state: getEl('pump-b-suction-state') },
                motor: { button: getEl('btn-b-motor'), state: getEl('pump-b-motor-state') },
                discharge: { button: getEl('btn-b-discharge'), state: getEl('pump-b-discharge-state') }
            }
        }
    }
};
var pumpGameLoop = null;

if (pumpUi.overlay) {
    pumpUi.overlay.addEventListener('pointerdown', (event) => {
        if (event.target === pumpUi.overlay) {
            closePumpProcedurePopup();
        }
    });
}

function createPumpState(routeContext = DEFAULT_PUMP_SWAP_ROUTE) {
    return {
        A: { suction: true, motor: true, discharge: true },
        B: { suction: false, motor: false, discharge: false },
        vibration: PUMP_VIBRATION_START,
        deadheadTimer: 0,
        lastTickAt: 0,
        routeProduct: routeContext.product,
        nextPhase: routeContext.nextPhase,
        failureType: null
    };
}

function getPumpFlow(pumpId) {
    const pump = pumpState[pumpId];
    return pump.motor && pump.suction && pump.discharge;
}

function isPumpSpinning(pumpId) {
    const pump = pumpState[pumpId];
    return pump.motor && pump.suction;
}

function setPumpFeedback(title, message, tone = 'info') {
    if (!pumpUi.feedback) return;
    pumpUi.feedback.className = `pump-feedback-panel pump-feedback-panel--${tone}`;
    if (pumpUi.feedbackTitle) pumpUi.feedbackTitle.textContent = title;
    if (pumpUi.feedbackBody) pumpUi.feedbackBody.textContent = message;
}

function setPumpBadge(badgeEl, message, modifier = '') {
    if (!badgeEl) return;
    badgeEl.className = modifier
        ? `pump-train-badge pump-train-badge--${modifier}`
        : 'pump-train-badge';
    badgeEl.textContent = message;
}

function setPumpLineState(lineEl, mode = 'idle') {
    if (!lineEl) return;
    lineEl.classList.remove('is-primed', 'is-flowing', 'is-warning');
    if (mode === 'primed') {
        lineEl.classList.add('is-primed');
    } else if (mode === 'flowing') {
        lineEl.classList.add('is-primed', 'is-flowing');
    } else if (mode === 'warning') {
        lineEl.classList.add('is-primed', 'is-flowing', 'is-warning');
    }
}

function setPumpToggleState(pumpId, component, isOn) {
    const control = pumpUi.pumps[pumpId]?.controls[component];
    const meta = pumpComponentMeta[component];
    if (!control || !meta) return;

    control.button.classList.toggle('is-on', isOn);
    control.button.classList.toggle('is-off', !isOn);
    control.button.setAttribute('aria-pressed', String(isOn));
    control.state.textContent = isOn ? meta.onText : meta.offText;
}

function getStandbyReadinessText() {
    if (getPumpFlow('B')) return 'Carrying feed to the tower';
    if (pumpState.B.motor && pumpState.B.suction && !pumpState.B.discharge) return 'Spinning up on closed discharge';
    if (pumpState.B.suction && !pumpState.B.motor) return 'Flooded and ready to start';
    if (pumpState.B.discharge && !pumpState.B.motor) return 'Discharge open with motor stopped';
    return 'Ready but isolated';
}

function updatePumpTrainVisuals(pumpId, flow, spinning, warning) {
    const refs = pumpUi.pumps[pumpId];
    if (!refs) return;

    const isolated = !pumpState[pumpId].suction && !pumpState[pumpId].motor && !pumpState[pumpId].discharge;
    const primed = pumpState[pumpId].suction && !spinning;

    refs.container.classList.toggle('pump-train--running', flow);
    refs.container.classList.toggle('pump-train--primed', primed);
    refs.container.classList.toggle('pump-train--warning', warning);
    refs.container.classList.toggle('pump-train--isolated', isolated);

    refs.body.classList.toggle('is-primed', pumpState[pumpId].suction);
    refs.body.classList.toggle('is-spinning', spinning);
    refs.body.classList.toggle('is-flowing', flow);
    refs.body.classList.toggle('is-warning', warning);
}

function updatePumpUI() {
    const flowA = getPumpFlow('A');
    const flowB = getPumpFlow('B');
    const spinningA = isPumpSpinning('A');
    const spinningB = isPumpSpinning('B');
    const severeVibration = pumpState.vibration >= PUMP_VIBRATION_HARD_SHAKE;
    const dualFlow = flowA && flowB;
    const feedLost = pumpState.failureType === 'feed-loss';
    const pumpAFailed = pumpState.failureType === 'pump-a-failed'
        || pumpState.failureType === 'pump-a-reverse-flow'
        || pumpState.failureType === 'pump-a-cavitation-safe';
    const pumpBFailed = pumpState.failureType === 'pump-b-deadhead'
        || pumpState.failureType === 'pump-b-dry-start'
        || pumpState.failureType === 'pump-b-reverse-flow';
    const aStarved = pumpState.failureType === 'pump-a-cavitation';

    setPumpToggleState('A', 'suction', pumpState.A.suction);
    setPumpToggleState('A', 'motor', pumpState.A.motor);
    setPumpToggleState('A', 'discharge', pumpState.A.discharge);
    setPumpToggleState('B', 'suction', pumpState.B.suction);
    setPumpToggleState('B', 'motor', pumpState.B.motor);
    setPumpToggleState('B', 'discharge', pumpState.B.discharge);

    if (pumpUi.vibrationBar) {
        pumpUi.vibrationBar.style.width = `${Math.max(0, Math.min(pumpState.vibration, 100))}%`;
        if (pumpState.vibration < PUMP_VIBRATION_MILD_SHAKE) {
            pumpUi.vibrationBar.style.background = 'linear-gradient(90deg, #facc15, #fb923c)';
        } else if (pumpState.vibration < PUMP_VIBRATION_HARD_SHAKE) {
            pumpUi.vibrationBar.style.background = 'linear-gradient(90deg, #fb923c, #ef4444)';
        } else {
            pumpUi.vibrationBar.style.background = 'linear-gradient(90deg, #ef4444, #991b1b)';
        }
    }
    if (pumpUi.vibrationText) {
        pumpUi.vibrationText.textContent = `${Math.round(pumpState.vibration)}%`;
    }
    if (pumpUi.bStateText) {
        pumpUi.bStateText.textContent = getStandbyReadinessText();
    }

    if (pumpUi.flowBar) {
        pumpUi.flowBar.classList.remove('is-warning', 'is-danger');
        if (dualFlow) {
            pumpUi.flowBar.style.width = '100%';
            pumpUi.flowBar.classList.add('is-warning');
        } else if (flowA || flowB) {
            pumpUi.flowBar.style.width = '100%';
        } else {
            pumpUi.flowBar.style.width = '0%';
            pumpUi.flowBar.classList.add('is-danger');
        }
    }
    if (pumpUi.flowStatus) {
        pumpUi.flowStatus.className = 'pump-flow-status';
        if (dualFlow) {
            pumpUi.flowStatus.classList.add('is-warning');
            pumpUi.flowStatus.textContent = 'Flow surging';
        } else if (flowA || flowB) {
            pumpUi.flowStatus.textContent = 'Flow stable';
        } else {
            pumpUi.flowStatus.classList.add('is-danger');
            pumpUi.flowStatus.textContent = 'No feed to unit';
        }
    }

    setPumpLineState(
        pumpUi.headerLines.suction,
        flowA || flowB || spinningA || spinningB ? 'flowing' : (pumpState.A.suction || pumpState.B.suction ? 'primed' : 'idle')
    );
    setPumpLineState(
        pumpUi.headerLines.discharge,
        dualFlow ? 'warning' : (flowA || flowB ? 'flowing' : 'idle')
    );
    setPumpLineState(
        pumpUi.pumps.A.lines.suction,
        spinningA ? 'flowing' : (pumpState.A.suction ? 'primed' : 'idle')
    );
    setPumpLineState(
        pumpUi.pumps.A.lines.discharge,
        dualFlow && flowA ? 'warning' : (flowA ? 'flowing' : 'idle')
    );
    setPumpLineState(
        pumpUi.pumps.B.lines.suction,
        spinningB ? 'flowing' : (pumpState.B.suction ? 'primed' : 'idle')
    );
    setPumpLineState(
        pumpUi.pumps.B.lines.discharge,
        dualFlow && flowB ? 'warning' : (flowB ? 'flowing' : 'idle')
    );

    updatePumpTrainVisuals('A', flowA, spinningA, severeVibration);
    updatePumpTrainVisuals('B', flowB, spinningB, pumpState.deadheadTimer > 0 || pumpBFailed);

    if (pumpUi.pumps.A.container) {
        pumpUi.pumps.A.container.classList.toggle('pump-train--mild-shake', pumpState.A.motor && pumpState.vibration >= PUMP_VIBRATION_MILD_SHAKE && pumpState.vibration < PUMP_VIBRATION_HARD_SHAKE);
        pumpUi.pumps.A.container.classList.toggle('violent-shake', pumpState.A.motor && pumpState.vibration >= PUMP_VIBRATION_HARD_SHAKE);
        pumpUi.pumps.A.container.classList.toggle('pump-train--failed', pumpAFailed);
        pumpUi.pumps.A.container.classList.toggle('pump-train--starved', aStarved);
    }
    if (pumpUi.pumps.B.container) {
        pumpUi.pumps.B.container.classList.toggle('pump-train--failed', pumpBFailed);
    }
    if (pumpUi.pumps.A.body) {
        pumpUi.pumps.A.body.classList.toggle('is-failed', pumpAFailed);
    }
    if (pumpUi.pumps.B.body) {
        pumpUi.pumps.B.body.classList.toggle('is-failed', pumpBFailed);
    }
    if (pumpUi.skid) {
        pumpUi.skid.classList.toggle('is-feed-lost', feedLost);
    }

    if (!pumpState.A.motor && !pumpState.A.suction && !pumpState.A.discharge) {
        setPumpBadge(pumpUi.pumps.A.badge, 'Isolated for maintenance');
    } else if (pumpAFailed) {
        setPumpBadge(pumpUi.pumps.A.badge, 'Pump failed', 'alarm');
    } else if (aStarved) {
        setPumpBadge(pumpUi.pumps.A.badge, 'Lost suction', 'warning');
    } else if (severeVibration) {
        setPumpBadge(pumpUi.pumps.A.badge, 'Severe vibration', 'alarm');
    } else if (flowA) {
        setPumpBadge(pumpUi.pumps.A.badge, 'Primary online', 'alarm');
    } else {
        setPumpBadge(pumpUi.pumps.A.badge, 'Being isolated', 'warning');
    }

    if (flowB) {
        setPumpBadge(pumpUi.pumps.B.badge, 'Standby online', 'running');
    } else if (pumpBFailed) {
        setPumpBadge(pumpUi.pumps.B.badge, 'Pump failed', 'alarm');
    } else if (pumpState.B.motor && pumpState.B.suction && !pumpState.B.discharge) {
        setPumpBadge(pumpUi.pumps.B.badge, 'Spinning up', 'warning');
    } else if (pumpState.B.suction) {
        setPumpBadge(pumpUi.pumps.B.badge, 'Flooded and ready', 'primed');
    } else {
        setPumpBadge(pumpUi.pumps.B.badge, 'Standby isolated');
    }
}

function initializePumpSwapSession() {
    clearPhaseTasks('pump-swap');

    pumpState = createPumpState(pumpSwapRouteContext);
    state.product = pumpSwapRouteContext.product || DEFAULT_PUMP_SWAP_ROUTE.product;
    closePumpProcedurePopup();

    if (pumpUi.retryButton) {
        pumpUi.retryButton.classList.add('hidden');
    }

    setPumpFeedback('Control Room', 'Pump A is still feeding the tower. Flood Pump B first, then bring it online before isolating Pump A.', 'info');
    updatePumpUI();

    if (pumpGameLoop) {
        clearInterval(pumpGameLoop);
    }
    pumpState.lastTickAt = performance.now();
    pumpGameLoop = registerPhaseInterval('pump-swap', () => pumpSystemTick(performance.now()), 250);
}

function startPumpSwap(options = {}) {
    const {
        skipShowPhase = false,
        product = pumpSwapRouteContext.product || DEFAULT_PUMP_SWAP_ROUTE.product,
        nextPhase = pumpSwapRouteContext.nextPhase || DEFAULT_PUMP_SWAP_ROUTE.nextPhase
    } = options;

    pumpSwapRouteContext = { product, nextPhase };
    state.product = product;
    physicsEngine.world.gravity.y = 1;
    cancelFunFactFlow();
    scrollGameIntoView();

    if (skipShowPhase || activePhaseId === 'pump-swap') {
        initializePumpSwapSession();
        return;
    }

    showPhase('pump-swap');
}

function togglePumpComponent(pumpId, component) {
    if (!pumpGameLoop) return;

    pumpState[pumpId][component] = !pumpState[pumpId][component];

    let feedbackMsg = '';
    let feedbackTone = 'info';

    if (component === 'suction' && pumpState[pumpId].suction) {
        feedbackMsg = `Pump ${pumpId} suction opened. The casing can now flood with liquid.`;
    } else if (component === 'suction') {
        feedbackMsg = `Pump ${pumpId} suction closed. The pump is isolated from its source.`;
    } else if (component === 'motor' && pumpState[pumpId].motor) {
        feedbackMsg = `Pump ${pumpId} motor started.`;
    } else if (component === 'motor') {
        feedbackMsg = `Pump ${pumpId} motor stopped.`;
    } else if (component === 'discharge' && pumpState[pumpId].discharge) {
        feedbackMsg = `Pump ${pumpId} discharge opened. Flow can now reach the fractionator header.`;
    } else {
        feedbackMsg = `Pump ${pumpId} discharge closed. The train is cut off from the unit header.`;
    }

    if (pumpId === 'B' && component === 'discharge' && pumpState.B.discharge && !pumpState.B.motor) {
        feedbackMsg = 'Pump B discharge is open with the motor stopped. Start the motor or close the valve to avoid reverse flow.';
        feedbackTone = 'warning';
    }

    setPumpFeedback('Operator Action', feedbackMsg, feedbackTone);
    updatePumpUI();
    evaluatePumpRules();
}

function evaluatePumpRules() {
    const flowB = getPumpFlow('B');

    if (pumpState.B.motor && !pumpState.B.suction) {
        endPumpGame(false, 'pump-b-dry-start', 'Pump B seal failure', 'You started Pump B dry before opening its suction valve. The standby pump is damaged and unavailable.');
        return;
    }

    if (!pumpState.A.motor && pumpState.A.suction && pumpState.A.discharge) {
        endPumpGame(false, 'pump-a-reverse-flow', 'Pump A reverse flowed', 'Pump A was stopped with both valves open. Header pressure spun the idle pump backward and damaged it.');
        return;
    }

    if (!pumpState.B.motor && pumpState.B.suction && pumpState.B.discharge) {
        endPumpGame(false, 'pump-b-reverse-flow', 'Pump B reverse flowed', 'Pump B was stopped with both valves open. Flow reversed through the idle pump and damaged it.');
        return;
    }

    if (pumpState.A.motor && !pumpState.A.suction) {
        if (flowB) {
            endPumpGame(false, 'pump-a-cavitation-safe', 'Pump A damaged during isolation', 'Pump B kept the unit online, but Pump A was still running when you closed its suction. The idle train cavitated and was damaged.');
        } else {
            endPumpGame(false, 'pump-a-cavitation', 'Pump A lost suction', 'Pump A was still running when its suction valve was closed. Feed collapsed and the unit became unstable.');
        }
        return;
    }

    const flowA = getPumpFlow('A');

    if (!flowA && !flowB) {
        endPumpGame(false, 'feed-loss', 'Unit lost feed', 'Neither pump is sending liquid to the fractionator. The feed header is empty and the unit has tripped.');
        return;
    }

    if (!pumpState.A.motor && !pumpState.A.suction && !pumpState.A.discharge &&
        pumpState.B.motor && pumpState.B.suction && pumpState.B.discharge) {
        endPumpGame(true, 'success', 'Pump swap complete', 'Pump B is carrying the feed and Pump A is safely isolated for maintenance.');
    }
}

function pumpSystemTick(now = performance.now()) {
    const elapsedSeconds = Math.max(0.15, Math.min((now - pumpState.lastTickAt) / 1000 || 0.25, 0.35));
    pumpState.lastTickAt = now;

    if (pumpState.A.motor) {
        pumpState.vibration = Math.min(PUMP_VIBRATION_MAX, pumpState.vibration + elapsedSeconds * PUMP_VIBRATION_RISE_PER_SECOND);
        if (pumpState.vibration >= PUMP_VIBRATION_MAX) {
            updatePumpUI();
            endPumpGame(false, 'pump-a-failed', 'Pump A failed', 'Pump A vibration was left unchecked until the bearings failed. This train is now down.');
            return;
        }
    } else {
        pumpState.vibration = Math.max(0, pumpState.vibration - elapsedSeconds * 18);
    }

    if (pumpState.B.motor && pumpState.B.suction && !pumpState.B.discharge) {
        pumpState.deadheadTimer += elapsedSeconds;
        const secondsLeft = Math.max(0, Math.ceil(PUMP_DEADHEAD_LIMIT - pumpState.deadheadTimer));
        setPumpFeedback('Warning', `Pump B is deadheading against a closed discharge. Open the discharge valve within ${secondsLeft}s.`, 'warning');

        if (pumpState.deadheadTimer >= PUMP_DEADHEAD_LIMIT) {
            updatePumpUI();
            endPumpGame(false, 'pump-b-deadhead', 'Pump B overheated', 'Pump B stayed deadheaded too long. The liquid boiled in the casing and the standby pump failed.');
            return;
        }
    } else {
        pumpState.deadheadTimer = 0;

        if (pumpState.A.motor && pumpState.vibration >= PUMP_VIBRATION_HARD_SHAKE && !getPumpFlow('B')) {
            setPumpFeedback('Critical vibration', 'Pump A is near failure. Bring Pump B online and isolate the damaged pump.', 'warning');
        }
    }

    updatePumpUI();
}

function endPumpGame(isWin, failureType, title, detail) {
    clearInterval(pumpGameLoop);
    pumpGameLoop = null;
    pumpState.lastTickAt = 0;
    pumpState.failureType = isWin ? null : failureType;

    if (pumpUi.retryButton) {
        pumpUi.retryButton.classList.toggle('hidden', isWin);
    }

    if (pumpUi.pumps.A.container) {
        pumpUi.pumps.A.container.classList.remove('pump-train--mild-shake', 'violent-shake');
    }

    updatePumpUI();
    setPumpFeedback(title, detail, isWin ? 'success' : 'error');

    if (isWin) {
        markUnitComplete('pump-swap');

        registerPhaseTimeout('pump-swap', () => {
            showFunFact('pump_swap', () => {
                state.product = pumpState.routeProduct || pumpSwapRouteContext.product || DEFAULT_PUMP_SWAP_ROUTE.product;
                showPhase(pumpState.nextPhase || pumpSwapRouteContext.nextPhase || DEFAULT_PUMP_SWAP_ROUTE.nextPhase);
            });
        }, 3000);
    }
}

function showPumpProcedurePopup() {
    if (pumpUi.overlay) {
        pumpUi.overlay.classList.add('is-open');
    }
}

function closePumpProcedurePopup() {
    if (pumpUi.overlay) {
        pumpUi.overlay.classList.remove('is-open');
    }
}

function getSmokeSnapshot() {
    return {
        phase: state.phase,
        activeScreens: Array.from(document.querySelectorAll('.screen.active')).map(node => node.id),
        sulfurAtoms: document.querySelectorAll('#sulfur-container .physics-body').length,
        vacuumAir: document.querySelectorAll('#vac-container .air-molecule').length,
        pumpLoopActive: Boolean(pumpGameLoop),
        mapLocked: mapJumpLocked
    };
}

async function runSmokeSuite() {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const results = [];
    const record = (name, pass) => {
        const snapshot = getSmokeSnapshot();
        results.push({ name, pass, snapshot });
        debugAssert(pass, name, snapshot);
    };

    showPhase('1', { skipSave: true });
    await wait(900);
    record('Only one screen is active after boot.', document.querySelectorAll('.screen.active').length === 1);

    state.product = 'lpg';
    showPhase('3', { skipSave: true });
    await wait(1200);
    record('Hydrotreating spawns sulfur atoms after activation.', document.querySelectorAll('#sulfur-container .physics-body').length === 7);

    showPhase('vac', { skipSave: true });
    await wait(1200);
    record('Vacuum tower spawns air molecules after activation.', document.querySelectorAll('#vac-container .air-molecule').length > 0);

    state.product = 'jetfuel';
    startPumpSwap({ product: 'jetfuel', nextPhase: '3' });
    await wait(900);
    record('Pump swap becomes the only active screen.', document.querySelectorAll('.screen.active').length === 1 && getPhaseScreen('pump-swap')?.classList.contains('active'));

    return results;
}

if (ENABLE_RUNTIME_ASSERTS && /[?&]smokeTest=1(?:&|$)/i.test(window.location.search)) {
    registerPhaseTimeout(activePhaseId, () => {
        runSmokeSuite().then(results => {
            console.table(results.map(result => ({
                test: result.name,
                pass: result.pass,
                phase: result.snapshot.phase,
                activeScreens: result.snapshot.activeScreens.join(', ')
            })));
        });
    }, 900);
}

/* =========================================
   EXPOSE PUBLIC API (single namespace)
========================================= */
window.Game = {
    showPhase,
    startOrResume,
    mapJump,
    goToDistillation,
    chooseProduct,
    chooseCokerProduct,
    startPumpSwap,
    startPipeXray,
    startProcessing,
    routeToGasoline,
    chooseVacPath,
    chooseLogistics,
    resetGame,
    addLiquid,
    addDieselDrop,
    runLabTest,
    renderJetCOA,
    setupULSDTreatmentHandlers,
    calculateBlend,
    evaluateGasBlend,
    markUnitComplete,
    updateMapUI,
    showGasRecipePopup,
    startPumpSwap,
    togglePumpComponent,
    showPumpProcedurePopup,
    closePumpProcedurePopup,
    setupPipeXray,
    setXrayTool,
    __debug: {
        runSmokeSuite,
        getSmokeSnapshot,
        isStaging: IS_STAGING_PATH,
        assertsEnabled: ENABLE_RUNTIME_ASSERTS
    }
};
});
