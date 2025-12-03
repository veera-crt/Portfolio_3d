// 3D Train Game Logic
document.addEventListener('DOMContentLoaded', () => {
    // Check if Three.js is loaded
    if (typeof THREE === 'undefined') {
        console.error('Three.js not loaded');
        return;
    }

    const container = document.getElementById('game-container');
    if (!container) return;

    // --- Sound Manager (Web Audio API) ---
    const SoundManager = {
        ctx: null,
        engineNode: null,
        engineGain: null,
        engineFilter: null, // Store filter to modulate pitch/tone
        isInit: false,

        init: function () {
            if (this.isInit) return;
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.isInit = true;
            this.startEngine();
        },

        startEngine: function () {
            // White Noise Generator for Steam Engine Chug
            const bufferSize = 2 * this.ctx.sampleRate;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;

            // Lowpass Filter to muffle the noise
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 100; // Increased base freq for better audibility

            // Gain for volume
            this.engineGain = this.ctx.createGain();
            this.engineGain.gain.value = 0.15; // Increased idle volume

            noise.connect(filter);
            filter.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);
            noise.start();

            this.engineNode = noise;
            this.engineFilter = filter;
        },

        updateEngine: function (speed) {
            if (!this.ctx || !this.engineGain || !this.engineFilter) return;

            // Volume based on speed (Base 0.15 for idle, max +0.25)
            const vol = 0.15 + Math.min(speed * 2, 0.25);
            this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);

            // Pitch/Tone based on speed (Filter Frequency)
            // Idle: 100Hz, Max Speed: ~700Hz
            const freq = 100 + (speed * 800);
            this.engineFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        },

        playWhistle: function () {
            if (!this.ctx) return;
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc1.type = 'triangle';
            osc2.type = 'triangle';

            // Train Horn Chord
            osc1.frequency.value = 300;
            osc2.frequency.value = 360; // Minor third

            gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);

            osc1.start();
            osc2.start();
            osc1.stop(this.ctx.currentTime + 1);
            osc2.stop(this.ctx.currentTime + 1);
        },

        playBrake: function () {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(2000, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.5);

            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.5);
        }
    };

    // --- Game Configuration ---
    const config = {
        stations: [
            { id: 'hero', x: 0, name: 'Home' }, // Renamed to Home for label
            { id: 'about', x: 100, name: 'About' },
            { id: 'skills', x: 200, name: 'Skills' },
            { id: 'resume', x: 300, name: 'Resume' },
            { id: 'projects', x: 400, name: 'Projects' },
            { id: 'contact', x: 500, name: 'Contact' }
        ],
        stationThreshold: 20, // Distance to show station
        maxTrackLength: 600
    };

    // Game State
    const state = {
        trainPosition: 0,
        trainSpeed: 0,
        maxSpeed: 0.8,
        acceleration: 0.02,
        friction: 0.96,
        targetPosition: null, // For auto-driving
        isAutoDriving: false
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.FogExp2(0x050505, 0.015);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Station Lights & Markers
    const stationColors = [0xffffff, 0x00f2ea, 0xff0055, 0x2ecc71, 0xffd700, 0x4facfe];
    const stationMarkers = []; // Store positions for labels

    config.stations.forEach((station, index) => {
        const light = new THREE.PointLight(stationColors[index], 2, 40);
        light.position.set(station.x, 5, 0);
        scene.add(light);

        // Add a simple "Station Marker" (Glowing pole)
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 5, 8);
        const poleMat = new THREE.MeshBasicMaterial({ color: stationColors[index] });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(station.x, 2.5, -3);
        scene.add(pole);

        // Store 3D position for label
        stationMarkers.push({
            position: new THREE.Vector3(station.x, 6, -3),
            name: station.name,
            element: null // Will be created
        });
    });

    // --- Build World ---
    // Ground
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.8, metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(2000, 100, 0x00f2ea, 0x222222);
    scene.add(gridHelper);

    // Track Group
    const trackGroup = new THREE.Group();
    scene.add(trackGroup);

    // Rails
    const railLength = config.maxTrackLength + 200;
    const railGeo = new THREE.BoxGeometry(railLength, 0.2, 0.2);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });

    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(railLength / 2 - 100, 0, -1); // Center offset
    leftRail.rotation.y = 0; // Already along X
    trackGroup.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(railLength / 2 - 100, 0, 1);
    trackGroup.add(rightRail);

    // Sleepers
    const sleeperGeo = new THREE.BoxGeometry(0.5, 0.2, 3);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });

    for (let i = -50; i < railLength / 2; i++) {
        const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
        sleeper.position.set(i * 2, -0.1, 0);
        sleeper.castShadow = true;
        trackGroup.add(sleeper);
    }

    // --- Build Train ---
    const trainGroup = new THREE.Group();
    scene.add(trainGroup);

    // Train Body
    const bodyGeo = new THREE.BoxGeometry(3, 1.5, 1.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0055, metalness: 0.5, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    body.castShadow = true;
    trainGroup.add(body);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(1.5, 1.5, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(-0.8, 2.5, 0);
    cabin.castShadow = true;
    trainGroup.add(cabin);

    // Engine Windows
    const engineWindowMat = new THREE.MeshStandardMaterial({
        color: 0xccffff,
        emissive: 0xccffff,
        emissiveIntensity: 0.1, // Reduced glare
        transparent: true,
        opacity: 0.1 // Almost invisible
    });

    // Side Windows
    const sideWindowGeo = new THREE.BoxGeometry(1, 0.8, 1.9); // Slightly wider than cabin
    const sideWindow = new THREE.Mesh(sideWindowGeo, engineWindowMat);
    sideWindow.position.set(-0.8, 2.8, 0);
    trainGroup.add(sideWindow);

    // Front Window
    const frontWindowGeo = new THREE.BoxGeometry(0.1, 0.8, 1.2);
    const frontWindow = new THREE.Mesh(frontWindowGeo, engineWindowMat);
    frontWindow.position.set(0, 2.8, 0); // Front face of cabin
    trainGroup.add(frontWindow);

    // Chimney (Silencer)
    const chimneyGeo = new THREE.CylinderGeometry(0.4, 0.3, 1.2, 16);
    const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
    chimney.position.set(1, 2.1, 0);
    trainGroup.add(chimney);

    // Headlight
    const headlightGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 16);
    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 2 });
    const headlightMesh = new THREE.Mesh(headlightGeo, headlightMat);
    headlightMesh.rotation.z = Math.PI / 2;
    headlightMesh.position.set(1.5, 1.2, 0); // Front of engine
    trainGroup.add(headlightMesh);

    const headlight = new THREE.SpotLight(0xffffaa, 5, 40, Math.PI / 4, 0.5, 1);
    headlight.position.set(1.6, 1.2, 0);
    headlight.target.position.set(10, 0, 0); // Point forward
    trainGroup.add(headlight);
    trainGroup.add(headlight.target);

    // Wheels Factory
    function createWheel() {
        const wheelGroup = new THREE.Group();

        // Materials
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            metalness: 0.8,
            roughness: 0.2
        });
        const darkSteelMat = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.7,
            roughness: 0.4
        });

        // 1. Main Running Surface (The part that touches the rail)
        const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 32);
        const tire = new THREE.Mesh(tireGeo, steelMat);
        tire.rotation.x = Math.PI / 2;
        wheelGroup.add(tire);

        // 2. Flange (The inner rim that keeps it on track)
        const flangeGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.05, 32);
        const flange = new THREE.Mesh(flangeGeo, steelMat);
        flange.rotation.x = Math.PI / 2;
        flange.position.z = -0.08; // Behind the main tire
        wheelGroup.add(flange);

        // 3. Spokes (Heavy cast iron look)
        const spokeGeo = new THREE.BoxGeometry(0.1, 0.45, 0.05);
        for (let i = 0; i < 8; i++) {
            const spoke = new THREE.Mesh(spokeGeo, darkSteelMat);
            spoke.rotation.z = (i / 8) * Math.PI * 2;
            spoke.position.z = 0.02;
            wheelGroup.add(spoke);
        }

        // 4. Hub (Center)
        const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16);
        const hub = new THREE.Mesh(hubGeo, steelMat);
        hub.rotation.x = Math.PI / 2;
        wheelGroup.add(hub);

        // 5. Counterweight & Coupling Pin (For that steam engine look)
        const weightGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 8, 1, false, 0, Math.PI / 3);
        const weight = new THREE.Mesh(weightGeo, darkSteelMat);
        weight.rotation.x = Math.PI / 2;
        weight.position.z = 0.02;
        wheelGroup.add(weight);

        const pinGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8);
        const pin = new THREE.Mesh(pinGeo, steelMat);
        pin.rotation.x = Math.PI / 2;
        pin.position.set(0.3, 0.3, 0.1); // Offset for crank action
        wheelGroup.add(pin);

        // 6. Glowing Rim (Neon Light)
        const glowGeo = new THREE.TorusGeometry(0.52, 0.02, 8, 32);
        const glowMat = new THREE.MeshStandardMaterial({
            color: 0x00f2ea,
            emissive: 0x00f2ea,
            emissiveIntensity: 2.0,
            toneMapped: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        // glow.rotation.x = Math.PI / 2; // Torus is already XY aligned usually, but let's check orientation
        // Torus default is in XY plane around Z axis. We need it to match the cylinder which is rotated X=90.
        // Cylinder rotated X=90 puts its caps in XZ plane? No, cylinder default is Y axis. Rotated X=90 is Z axis.
        // Wait, cylinder default is Y axis. Rotated X=90 aligns it with Z axis.
        // Torus default is Z axis. So it should be fine?
        // Let's align it with the tire. Tire is rotated X=90.
        // Let's try adding it without rotation first, or matching tire.
        // Actually, TorusGeometry is created around the Z axis.
        // If we want it to rim the wheel which is a cylinder along Z (after rotation), we need the torus to be in the XY plane?
        // No, the wheel is rolling along X. The axle is Z.
        // The cylinder is created along Y. Rotated X=90 makes it along Z.
        // So the circular face is in the XY plane.
        // The Torus is in the XY plane by default.
        // So we just need to position it correctly.

        // Let's just add it and see.
        wheelGroup.add(glow);

        return wheelGroup;
    }
    const wheels = [];
    const wheelPositions = [{ x: -1, z: 1 }, { x: 1, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }];

    wheelPositions.forEach(pos => {
        const wheel = createWheel();
        wheel.position.set(pos.x, 0.6, pos.z);
        // Rotate 90deg Y to face correct way? No, Torus is XY plane.
        // We need to rotate the GROUP to face Z.
        // Actually, Torus is in XY plane. Train moves along X. Wheels are on sides (Z).
        // So wheel face should be in X-Y plane? No, X-Y plane faces Z. Correct.
        // But we need to rotate it so it rolls along X.
        // Wait, Torus default is XY plane (donut facing Z).
        // If we roll along X, the wheel rotates around Z axis? No.
        // Wheel axle is Z. Wheel rotates around Z.
        // So the face is XY. This is correct.

        trainGroup.add(wheel);
        wheels.push(wheel);
    });

    // --- Coal Wagon ---
    const wagonGeo = new THREE.BoxGeometry(2.5, 1.2, 1.6);
    const wagonMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.5 });
    const wagon = new THREE.Mesh(wagonGeo, wagonMat);
    wagon.position.set(-3.5, 1, 0); // Behind engine
    wagon.castShadow = true;
    trainGroup.add(wagon);

    // Wagon Wheels
    const wagonWheelPositions = [{ x: -4.2, z: 1 }, { x: -2.8, z: 1 }, { x: -4.2, z: -1 }, { x: -2.8, z: -1 }];
    wagonWheelPositions.forEach(pos => {
        const wheel = createWheel();
        wheel.position.set(pos.x, 0.6, pos.z);
        trainGroup.add(wheel);
        wheels.push(wheel);
    });

    // Connector 1
    const connectorGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
    const connectorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const conn1 = new THREE.Mesh(connectorGeo, connectorMat);
    conn1.rotation.z = Math.PI / 2;
    conn1.position.set(-2, 0.8, 0);
    trainGroup.add(conn1);

    // --- Passenger Carriage ---
    const carriageGeo = new THREE.BoxGeometry(4, 1.8, 1.7);
    const carriageMat = new THREE.MeshStandardMaterial({ color: 0x00f2ea, metalness: 0.3, roughness: 0.4 });
    const carriage = new THREE.Mesh(carriageGeo, carriageMat);
    carriage.position.set(-7.5, 1.2, 0); // Behind wagon
    carriage.castShadow = true;
    trainGroup.add(carriage);

    // Carriage Windows
    const windowGeo = new THREE.BoxGeometry(0.8, 0.6, 1.8);
    const windowMat = new THREE.MeshStandardMaterial({
        color: 0xccffff,
        emissive: 0x111111,
        transparent: true,
        opacity: 0.1 // Almost invisible
    });

    for (let i = -1; i <= 1; i++) {
        const win = new THREE.Mesh(windowGeo, windowMat);
        win.position.set(-7.5 + (i * 1.2), 1.5, 0);
        trainGroup.add(win);
    }

    // Carriage Wheels
    const carriageWheelPositions = [{ x: -8.8, z: 1 }, { x: -6.2, z: 1 }, { x: -8.8, z: -1 }, { x: -6.2, z: -1 }];
    carriageWheelPositions.forEach(pos => {
        const wheel = createWheel();
        wheel.position.set(pos.x, 0.6, pos.z);
        trainGroup.add(wheel);
        wheels.push(wheel);
    });

    // Connector 2
    const conn2 = new THREE.Mesh(connectorGeo, connectorMat);
    conn2.rotation.z = Math.PI / 2;
    conn2.position.set(-5.2, 0.8, 0);
    trainGroup.add(conn2);

    // --- Passenger Carriage 2 (Extra Length) ---
    const carriage2 = new THREE.Mesh(carriageGeo, carriageMat);
    carriage2.position.set(-11.8, 1.2, 0); // Behind carriage 1
    carriage2.castShadow = true;
    trainGroup.add(carriage2);

    // Carriage 2 Windows
    for (let i = -1; i <= 1; i++) {
        const win = new THREE.Mesh(windowGeo, windowMat);
        win.position.set(-11.8 + (i * 1.2), 1.5, 0);
        trainGroup.add(win);
    }

    // Carriage 2 Wheels
    const carriage2WheelPositions = [{ x: -13.1, z: 1 }, { x: -10.5, z: 1 }, { x: -13.1, z: -1 }, { x: -10.5, z: -1 }];
    carriage2WheelPositions.forEach(pos => {
        const wheel = createWheel();
        wheel.position.set(pos.x, 0.6, pos.z);
        trainGroup.add(wheel);
        wheels.push(wheel);
    });

    // Connector 3
    const conn3 = new THREE.Mesh(connectorGeo, connectorMat);
    conn3.rotation.z = Math.PI / 2;
    conn3.position.set(-9.5, 0.8, 0);
    trainGroup.add(conn3);

    // Brake Light (Rear)
    const brakeLightGeo = new THREE.BoxGeometry(0.1, 0.4, 0.8);
    const brakeLightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
    const brakeLightMesh = new THREE.Mesh(brakeLightGeo, brakeLightMat);
    brakeLightMesh.position.set(-13.8, 1.2, 0); // Back of last carriage
    trainGroup.add(brakeLightMesh);

    const brakeLight = new THREE.PointLight(0xff0000, 2, 10);
    brakeLight.position.set(-14, 1.2, 0);
    trainGroup.add(brakeLight);

    // --- Decorative Lights ---
    function createLEDs(length, count, color) {
        const group = new THREE.Group();
        const geo = new THREE.SphereGeometry(0.05, 8, 8);
        const mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 5 });

        const step = length / count;
        for (let i = 0; i < count; i++) {
            const led = new THREE.Mesh(geo, mat);
            led.position.x = (i * step) - (length / 2);
            group.add(led);
        }
        return group;
    }

    // Engine Roof LEDs (Cyan)
    const engineLEDs = createLEDs(1.4, 5, 0x00ffff);
    engineLEDs.position.set(-0.8, 3.3, 0); // Top of cabin
    trainGroup.add(engineLEDs);

    // Wagon LEDs (Yellow)
    const wagonLEDs = createLEDs(2.4, 6, 0xffff00);
    wagonLEDs.position.set(-3.5, 1.7, 0); // Top of wagon
    trainGroup.add(wagonLEDs);

    // Carriage 1 LEDs (Magenta)
    const car1LEDs = createLEDs(3.8, 8, 0xff00ff);
    car1LEDs.position.set(-7.5, 2.2, 0); // Top of carriage 1
    trainGroup.add(car1LEDs);

    // Carriage 2 LEDs (Magenta)
    const car2LEDs = createLEDs(3.8, 8, 0xff00ff);
    car2LEDs.position.set(-11.8, 2.2, 0); // Top of carriage 2
    trainGroup.add(car2LEDs);

    // Underglow (Blue)
    const underglow = new THREE.PointLight(0x0088ff, 3, 8);
    underglow.position.set(0, 0.5, 0); // Under engine
    trainGroup.add(underglow);

    // --- People ---
    function createPerson(color) {
        const personGroup = new THREE.Group();
        // Head
        const headGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffccaa }); // Skin tone
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.4;
        personGroup.add(head);

        // Body
        const bodyGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.6, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: color });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        personGroup.add(body);

        return personGroup;
    }

    // Driver Removed per user request
    // const driver = createPerson(0x3498db);
    // driver.position.set(-0.2, 2.6, 0);
    // trainGroup.add(driver);

    // Passengers
    const p1 = createPerson(0xe74c3c); // Red shirt
    p1.position.set(-7.5, 1.5, 0.4); // Right side
    trainGroup.add(p1);

    const p2 = createPerson(0x2ecc71); // Green shirt
    p2.position.set(-8.5, 1.5, -0.4); // Left side
    trainGroup.add(p2);

    // --- Create Station Labels ---
    const labelsContainer = document.getElementById('station-labels');
    stationMarkers.forEach(marker => {
        const label = document.createElement('div');
        label.className = 'station-label';
        label.textContent = marker.name;
        labelsContainer.appendChild(label);
        marker.element = label;
    });

    // --- Train Progress Bar Initialization ---
    const progressTrack = document.getElementById('train-progress-track');
    const progressBar = document.getElementById('train-progress-bar');
    const minX = config.stations[0].x; // Start (Hero)
    const maxX = config.stations[config.stations.length - 1].x; // End (Contact)
    const totalDist = maxX - minX;

    // Create dots for stations
    const stationDots = [];
    config.stations.forEach(station => {
        const dot = document.createElement('div');
        dot.className = 'station-dot';

        // Calculate percentage position
        const percent = ((station.x - minX) / totalDist) * 100;
        dot.style.left = `${percent}%`;

        // Tooltip (optional, maybe later)
        // dot.title = station.name;

        progressTrack.appendChild(dot);
        stationDots.push({ id: station.id, element: dot, x: station.x });
    });

    // --- Interaction ---
    // keys object removed

    // Unlock Audio on first interaction
    const unlockAudio = () => {
        SoundManager.init();
        if (SoundManager.ctx && SoundManager.ctx.state === 'suspended') {
            SoundManager.ctx.resume();
        }
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('click', unlockAudio);

        // Play whistle on start!
        SoundManager.playWhistle();
    };
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('click', unlockAudio);

    // Keydown/Keyup listeners for manual driving removed

    // --- Menu Integration ---
    const navLinks = document.querySelectorAll('.nav-links a, .btn[href^="#"]');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const station = config.stations.find(s => s.id === targetId);

            if (station) {
                state.isAutoDriving = true;
                state.targetPosition = station.x;

                // Close mobile menu
                document.querySelector('.hamburger').classList.remove('active');
                document.querySelector('.nav-links').classList.remove('active');
            }
        });
    });

    // --- Click to View Content (Removed: Auto-show enabled) ---
    // window.addEventListener('click', (e) => { ... });

    // --- UI Sync ---
    const sections = {};
    config.stations.forEach(s => {
        if (s.id === 'hero') {
            sections[s.id] = document.querySelector('.hero');
        } else {
            sections[s.id] = document.getElementById(s.id);
        }
    });

    document.body.classList.add('game-mode');

    function updateUI() {
        const pos = trainGroup.position.x;

        // Update Progress Bar
        const progressPercent = Math.min(100, Math.max(0, ((pos - minX) / totalDist) * 100));
        if (progressBar) progressBar.style.width = `${progressPercent}%`;

        // Update Dots
        stationDots.forEach(dot => {
            if (Math.abs(pos - dot.x) < 5) {
                dot.element.classList.add('active');
            } else {
                dot.element.classList.remove('active');
            }

            if (pos > dot.x + 2) {
                dot.element.classList.add('passed');
            } else {
                dot.element.classList.remove('passed');
            }
        });

        let atStation = false;

        config.stations.forEach(station => {
            const el = sections[station.id];
            if (!el) return;

            const distance = Math.abs(pos - station.x);

            // Check if we are "parked" at this station
            // Condition: Close enough AND moving very slowly (stopped)
            const isParked = distance < 5 && Math.abs(state.trainSpeed) < 0.05;

            const navLink = document.querySelector(`.nav-links a[href="#${station.id}"]`);

            if (isParked) {
                atStation = true;
                // Automatically show the section
                el.classList.add('active-station');
                if (navLink) navLink.classList.add('active');

                // Special handling for Hero departure state
                if (station.id === 'hero') {
                    el.classList.remove('departed');
                }
            } else {
                // If we move away, hide the section
                el.classList.remove('active-station');
                if (navLink) navLink.classList.remove('active');

                if (station.id === 'hero' && distance > 10) {
                    el.classList.add('departed');
                }
            }
        });

        // Toggle Focus Mode (Blur) - Only if content is visible
        // Since we auto-show, atStation implies content is visible
        if (atStation) {
            document.body.classList.add('station-mode');
        } else {
            document.body.classList.remove('station-mode');
        }

        // Hint removed as requested

        // Update Labels (Only show when NOT in station mode, handled by CSS opacity but we can optimize)
        stationMarkers.forEach(marker => {
            // Project 3D position to 2D screen
            const vector = marker.position.clone();
            vector.project(camera);

            const x = (vector.x * .5 + .5) * window.innerWidth;
            const y = (-(vector.y * .5) + .5) * window.innerHeight;

            if (vector.z < 1) {
                marker.element.style.display = 'block';
                marker.element.style.left = `${x}px`;
                marker.element.style.top = `${y}px`;

                const dist = Math.abs(trainGroup.position.x - marker.position.x);
                const opacity = Math.max(0, 1 - dist / 50);
                marker.element.style.opacity = opacity;
            } else {
                marker.element.style.display = 'none';
            }
        });
    }

    // --- Smoke Effect ---
    const smokeParticles = [];
    const smokeGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const smokeMat = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        transparent: true,
        opacity: 0.6,
        roughness: 1
    });

    function spawnSmoke() {
        // Clone material so each particle has its own opacity
        const particle = new THREE.Mesh(smokeGeo, smokeMat.clone());
        // Spawn at chimney top (relative to train group)
        // Chimney is at (1, 2.1, 0), top is roughly y=2.7
        particle.position.set(1, 2.8, 0);

        // Randomize slightly
        particle.position.x += (Math.random() - 0.5) * 0.2;
        particle.position.z += (Math.random() - 0.5) * 0.2;

        // Initial velocity
        particle.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.02, // Random drift X
                0.05 + Math.random() * 0.05,  // Upward speed
                (Math.random() - 0.5) * 0.02  // Random drift Z
            ),
            life: 1.0, // 100% life
            growth: 0.03 // Grow faster
        };

        trainGroup.add(particle);
        smokeParticles.push(particle);
    }

    // --- Animation Loop ---
    function animate() {
        requestAnimationFrame(animate);

        // Sound Update
        const speed = Math.abs(state.trainSpeed);
        SoundManager.updateEngine(speed);

        // Brake Sound Logic
        // If we were moving fast and now stopped (or very slow), play brake
        if (state.lastSpeed > 0.1 && speed < 0.01) {
            SoundManager.playBrake();
        }
        state.lastSpeed = speed;

        // Smoke Logic
        // speed variable already defined above
        // Spawn rate depends on speed (more speed = more smoke)
        // Idle: small chance, Moving: high chance
        const spawnChance = speed > 0.01 ? 0.8 : 0.05;

        if (Math.random() < spawnChance) {
            spawnSmoke();
        }

        // Update Particles
        for (let i = smokeParticles.length - 1; i >= 0; i--) {
            const p = smokeParticles[i];
            p.position.add(p.userData.velocity);

            // If moving, smoke should drift back relative to train
            // But since particles are children of trainGroup, they move WITH the train.
            // We need to push them BACK by the train's speed to simulate "trail"
            // Actually, simpler: just push them back based on speed direction
            if (speed > 0.01) {
                // If train moves right (+), smoke moves left (-)
                // If train moves left (-), smoke moves right (+)
                p.position.x -= state.trainSpeed * 1.2; // Move opposite to train
            }

            p.scale.addScalar(p.userData.growth);
            p.userData.life -= 0.015;

            // Increase visibility: Base opacity 0.6 * life
            p.material.opacity = p.userData.life * 0.6;

            if (p.userData.life <= 0) {
                trainGroup.remove(p);
                // Dispose geometry and material to prevent memory leaks
                p.material.dispose();
                smokeParticles.splice(i, 1);
            }
        }

        // Auto Driving Logic
        if (state.isAutoDriving && state.targetPosition !== null) {
            const diff = state.targetPosition - state.trainPosition;

            if (Math.abs(diff) < 0.5) {
                // Arrived
                state.trainPosition = state.targetPosition;
                state.trainSpeed = 0;
                state.isAutoDriving = false;
                state.targetPosition = null;
            } else {
                // Simple P-Controller for speed
                const targetSpeed = Math.sign(diff) * state.maxSpeed;
                // Smooth acceleration
                state.trainSpeed += (targetSpeed - state.trainSpeed) * 0.05;
            }
        }
        // Manual Driving Logic
        else {
            // Manual driving removed
            state.trainSpeed *= state.friction;
        }

        // Clamp Speed
        state.trainSpeed = Math.max(Math.min(state.trainSpeed, state.maxSpeed), -state.maxSpeed);
        if (Math.abs(state.trainSpeed) < 0.001) state.trainSpeed = 0;

        // Move Train
        state.trainPosition += state.trainSpeed;

        // Clamp Position (Don't go off track ends)
        state.trainPosition = Math.max(-20, Math.min(state.trainPosition, config.maxTrackLength));

        trainGroup.position.x = state.trainPosition;

        // Rotate Wheels
        wheels.forEach(wheel => {
            wheel.rotation.z -= state.trainSpeed * 0.5; // Rotate around Z axis for Torus
        });

        // Camera Follow
        const camOffset = 10;
        const targetCamX = state.trainPosition;
        camera.position.x += (targetCamX - camera.position.x) * 0.1;
        camera.lookAt(state.trainPosition, 0, 0);

        updateUI();
        renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    updateUI(); // Force initial UI update
    animate();
});
