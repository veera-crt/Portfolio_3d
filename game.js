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
            this.engineGain.gain.value = 0.1; // Reduced idle volume

            noise.connect(filter);
            filter.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);
            noise.start();

            this.engineNode = noise;
            this.engineFilter = filter;
        },

        updateEngine: function (speed) {
            if (!this.ctx || !this.engineGain || !this.engineFilter) return;

            // Volume based on speed (Base 0.1 for idle, max +0.2)
            const vol = 0.1 + Math.min(speed * 2, 0.2);
            this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);

            // Pitch/Tone based on speed (Filter Frequency)
            // Idle: 150Hz, Max Speed: ~1000Hz
            const freq = 150 + (speed * 1000);
            this.engineFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        },

        playWhistle: function () {
            if (!this.ctx) return;

            // Ensure context is running
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

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
        maxSpeed: 1.5, // Increased from 0.8
        acceleration: 0.04, // Increased from 0.02
        friction: 0.96,
        targetPosition: null, // For auto-driving
        isAutoDriving: false,
        // Gear System
        gear: 1,
        shiftTimer: 0,
        isShifting: false
    };

    // Gear Configuration
    const gearRatios = [
        { max: 0.38, label: 'D1' }, // ~1.5 / 4
        { max: 0.75, label: 'D2' },
        { max: 1.13, label: 'D3' },
        { max: 2.0, label: 'D4' }
    ];

    // --- Traffic Light System ---
    const trafficLight = {
        state: 'green', // green, yellow, red
        timer: 0,
        mesh: null,
        lights: {}
    };

    function createTrafficLight(x, z) {
        const group = new THREE.Group();

        // Pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        pole.position.y = 4;
        group.add(pole);

        // Box
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 2.5, 1),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        box.position.y = 7;
        group.add(box);

        // Lights
        const lightGeo = new THREE.CircleGeometry(0.3, 16);

        // Red
        const redMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
        const redLight = new THREE.Mesh(lightGeo, redMat);
        redLight.position.set(0, 7.8, 0.51);
        group.add(redLight);
        trafficLight.lights.red = redMat;

        // Yellow
        const yellowMat = new THREE.MeshBasicMaterial({ color: 0x333300 });
        const yellowLight = new THREE.Mesh(lightGeo, yellowMat);
        yellowLight.position.set(0, 7.0, 0.51);
        group.add(yellowLight);
        trafficLight.lights.yellow = yellowMat;

        // Green
        const greenMat = new THREE.MeshBasicMaterial({ color: 0x003300 });
        const greenLight = new THREE.Mesh(lightGeo, greenMat);
        greenLight.position.set(0, 6.2, 0.51);
        group.add(greenLight);
        trafficLight.lights.green = greenMat;

        group.position.set(x, 0, z);
        scene.add(group);
        trafficLight.mesh = group;
    }

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    // Add Fog for depth and smoothness (hides pop-in)
    scene.fog = new THREE.FogExp2(0x050505, 0.015);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer, better looking shadows
    container.appendChild(renderer.domElement);

    // Create Traffic Light at x=0, z=-10 (Between track and road)
    createTrafficLight(0, -12);

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

    // --- Scenery: Mountains (Instanced) ---
    const mountainCount = 100;
    const mountainGeo = new THREE.ConeGeometry(1, 1, 4); // Base geometry, scaled per instance
    const mountainMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });
    const mountainMesh = new THREE.InstancedMesh(mountainGeo, mountainMat, mountainCount);
    mountainMesh.castShadow = false; // Disable shadows for distant mountains
    mountainMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let mIdx = 0;

    for (let i = -200; i < config.maxTrackLength + 200; i += 80) {
        if (mIdx >= mountainCount) break;

        // Far background mountains
        const scale = 40 + Math.random() * 30;
        const height = 60 + Math.random() * 40;
        const z = -80 - Math.random() * 40;

        dummy.position.set(i, height / 2 - 2, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.set(scale, height, scale);
        dummy.updateMatrix();
        mountainMesh.setMatrixAt(mIdx++, dummy.matrix);

        // Closer hills
        if (Math.random() > 0.5 && mIdx < mountainCount) {
            const s2 = 15 + Math.random() * 10;
            const h2 = 20 + Math.random() * 15;
            const z2 = -40 - Math.random() * 10;

            dummy.position.set(i + 40, h2 / 2 - 2, z2);
            dummy.rotation.y = Math.random() * Math.PI;
            dummy.scale.set(s2, h2, s2);
            dummy.updateMatrix();
            mountainMesh.setMatrixAt(mIdx++, dummy.matrix);
        }
    }
    scene.add(mountainMesh);

    // --- Scenery: Trees (Instanced) ---
    const treeCount = 200;

    // Trunk Instanced Mesh
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2a });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    // Foliage Instanced Mesh (Merged levels for simplicity or separate?)
    // Let's use one cone for foliage to keep it simple and fast
    const foliageGeo = new THREE.ConeGeometry(3, 7, 6);
    const foliageMat = new THREE.MeshStandardMaterial({
        color: 0x0f3d3e,
        roughness: 0.8,
        flatShading: true
    });
    const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
    foliageMesh.castShadow = true;
    foliageMesh.receiveShadow = true;

    let tIdx = 0;
    for (let i = -50; i < config.maxTrackLength + 100; i += 15) {
        // Randomly place trees
        if (Math.random() > 0.3 && tIdx < treeCount) {
            const zOffset = 15 + Math.random() * 20;
            const x = i + Math.random() * 5;
            const z = (Math.random() > 0.5) ? zOffset : -zOffset; // Both sides

            // Trunk
            dummy.position.set(x, 1.5, z);
            dummy.rotation.set(0, Math.random() * Math.PI, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            trunkMesh.setMatrixAt(tIdx, dummy.matrix);

            // Foliage
            dummy.position.set(x, 5, z); // Higher up
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            foliageMesh.setMatrixAt(tIdx, dummy.matrix);

            tIdx++;
        }
    }
    scene.add(trunkMesh);
    scene.add(foliageMesh);

    // --- Scenery: Road ---
    const roadWidth = 12;
    const roadLength = config.maxTrackLength + 400;
    const roadGeo = new THREE.PlaneGeometry(roadLength, roadWidth);
    const roadMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.8
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(roadLength / 2 - 100, -0.95, -18);
    road.receiveShadow = true;
    scene.add(road);

    // Road Markings (Instanced)
    const lineCount = Math.ceil(roadLength / 8);
    const lineGeo = new THREE.PlaneGeometry(2, 0.5);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lineMesh = new THREE.InstancedMesh(lineGeo, lineMat, lineCount);

    let lIdx = 0;
    for (let i = -100; i < roadLength - 100; i += 8) {
        if (lIdx >= lineCount) break;
        dummy.position.set(i, -0.9, -18);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        lineMesh.setMatrixAt(lIdx++, dummy.matrix);
    }
    scene.add(lineMesh);

    // --- Scenery: Street Lights (Instanced - No Real Lights) ---
    // We will just render the mesh. Real lights are too expensive.
    const lightCount = Math.ceil((config.maxTrackLength + 150) / 60);

    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 10, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, lightCount);

    // Arm
    const armGeo = new THREE.BoxGeometry(0.2, 0.2, 3);
    const armMesh = new THREE.InstancedMesh(armGeo, poleMat, lightCount);

    // Bulb (Glowing)
    const bulbGeo = new THREE.BoxGeometry(0.5, 0.2, 0.8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, lightCount);

    // Volumetric Glow (Fake Light)
    const glowGeo = new THREE.ConeGeometry(2, 10, 32, 1, true);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, lightCount);

    let slIdx = 0;
    for (let i = -50; i < config.maxTrackLength + 100; i += 60) {
        if (slIdx >= lightCount) break;

        const x = i;
        const z = -24;

        // Pole
        dummy.position.set(x, 5, z);
        dummy.rotation.set(0, Math.PI, 0); // Face road
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poleMesh.setMatrixAt(slIdx, dummy.matrix);

        // Arm
        dummy.position.set(x, 9.5, z + 1.5); // Adjusted for rotation
        dummy.updateMatrix();
        armMesh.setMatrixAt(slIdx, dummy.matrix);

        // Bulb
        dummy.position.set(x, 9.4, z + 2.8);
        dummy.updateMatrix();
        bulbMesh.setMatrixAt(slIdx, dummy.matrix);

        // Glow
        dummy.position.set(x, 4.5, z + 2.8);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(slIdx, dummy.matrix);

        slIdx++;
    }

    scene.add(poleMesh);
    scene.add(armMesh);
    scene.add(bulbMesh);
    scene.add(glowMesh);

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
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, // Dark rubber
            roughness: 0.8
        });
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0xeeeeee, // Bright alloy
            metalness: 0.8,
            roughness: 0.2
        });
        const spokeMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc, // Silver spokes
            metalness: 0.7,
            roughness: 0.3
        });
        const neonMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00 // Bright green marker for visibility
        });

        // 1. Tire (The rubber part)
        const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 32);
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.x = Math.PI / 2;
        wheelGroup.add(tire);

        // 2. Rim (Inner metal ring)
        const rimGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.26, 32);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.x = Math.PI / 2;
        wheelGroup.add(rim);

        // 3. Modern Spokes (Turbine style)
        const spokeGeo = new THREE.BoxGeometry(0.12, 0.4, 0.28); // Stick out slightly
        for (let i = 0; i < 5; i++) {
            const spoke = new THREE.Mesh(spokeGeo, spokeMat);
            const angle = (i / 5) * Math.PI * 2;

            spoke.position.x = Math.cos(angle) * 0.2;
            spoke.position.y = Math.sin(angle) * 0.2;
            spoke.rotation.z = angle;

            wheelGroup.add(spoke);

            // Add neon marker to ONE spoke to make rotation obvious
            if (i === 0) {
                const markerGeo = new THREE.BoxGeometry(0.05, 0.3, 0.30);
                const marker = new THREE.Mesh(markerGeo, neonMat);
                marker.position.copy(spoke.position);
                marker.rotation.z = angle;
                wheelGroup.add(marker);
            }
        }

        // 4. Center Cap
        const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.32, 16);
        const cap = new THREE.Mesh(capGeo, rimMat);
        cap.rotation.x = Math.PI / 2;
        wheelGroup.add(cap);

        // 5. Lug Nuts (Detail)
        const nutGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6);
        for (let i = 0; i < 5; i++) {
            const nut = new THREE.Mesh(nutGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
            const angle = (i / 5) * Math.PI * 2 + (Math.PI / 5); // Offset from spokes
            nut.position.x = Math.cos(angle) * 0.15;
            nut.position.y = Math.sin(angle) * 0.15;
            nut.rotation.x = Math.PI / 2;
            wheelGroup.add(nut);
        }

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

    // --- Decorative Lights Helper ---
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

    // --- Passenger Carriages (10 Boxes) ---
    const carriageGeo = new THREE.BoxGeometry(4, 1.8, 1.7);
    const carriageMat = new THREE.MeshStandardMaterial({ color: 0x00f2ea, metalness: 0.3, roughness: 0.4 });
    const windowGeo = new THREE.BoxGeometry(0.8, 0.6, 1.8);
    const windowMat = new THREE.MeshStandardMaterial({
        color: 0xccffff,
        emissive: 0x111111,
        transparent: true,
        opacity: 0.1
    });

    const startX = -7.5;
    const spacing = 4.3;
    const numCarriages = 10;

    for (let c = 0; c < numCarriages; c++) {
        const cx = startX - (c * spacing);

        // Connector (Connects to previous vehicle)
        const conn = new THREE.Mesh(connectorGeo, connectorMat);
        conn.rotation.z = Math.PI / 2;
        conn.position.set(cx + 2.3, 0.8, 0);
        trainGroup.add(conn);

        // Carriage Body
        const carriage = new THREE.Mesh(carriageGeo, carriageMat);
        carriage.position.set(cx, 1.2, 0);
        carriage.castShadow = true;
        trainGroup.add(carriage);

        // Windows
        for (let i = -1; i <= 1; i++) {
            const win = new THREE.Mesh(windowGeo, windowMat);
            win.position.set(cx + (i * 1.2), 1.5, 0);
            trainGroup.add(win);
        }

        // Wheels
        const wheelOffsets = [-1.3, 1.3];
        wheelOffsets.forEach(xOff => {
            // Left and Right
            [1, -1].forEach(zOff => {
                const wheel = createWheel();
                wheel.position.set(cx + xOff, 0.6, zOff);
                trainGroup.add(wheel);
                wheels.push(wheel);
            });
        });

        // LEDs
        const leds = createLEDs(3.8, 8, 0xff00ff);
        leds.position.set(cx, 2.2, 0);
        trainGroup.add(leds);

        // Brake Light (Last Carriage Only)
        if (c === numCarriages - 1) {
            const brakeLightGeo = new THREE.BoxGeometry(0.1, 0.4, 0.8);
            const brakeLightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
            const brakeLightMesh = new THREE.Mesh(brakeLightGeo, brakeLightMat);
            brakeLightMesh.position.set(cx - 2.0, 1.2, 0);
            trainGroup.add(brakeLightMesh);

            const brakeLight = new THREE.PointLight(0xff0000, 2, 10);
            brakeLight.position.set(cx - 2.2, 1.2, 0);
            trainGroup.add(brakeLight);
        }
    }

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
    const keys = {
        ArrowLeft: false,
        ArrowRight: false
    };

    window.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = true;
            // Cancel auto-driving if user intervenes
            state.isAutoDriving = false;
            state.targetPosition = null;
        }
        // Horn Key
        if (e.key === 'h' || e.key === 'H') {
            SoundManager.playWhistle();
            // Visual feedback on button if it exists
            const btnHorn = document.getElementById('btn-horn');
            if (btnHorn) btnHorn.classList.add('active');
        }
    });

    window.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = false;
        }
        if (e.key === 'h' || e.key === 'H') {
            const btnHorn = document.getElementById('btn-horn');
            if (btnHorn) btnHorn.classList.remove('active');
        }
    });

    // UI Button Controls
    const btnBrake = document.getElementById('btn-brake');
    const btnAccel = document.getElementById('btn-accel');
    const gearDisplay = document.getElementById('gear-display'); // Cache for performance

    const handleBtnStart = (action) => {
        if (action === 'brake') keys.ArrowLeft = true; // Brake/Reverse
        if (action === 'accel') keys.ArrowRight = true; // Gas/Forward
        state.isAutoDriving = false;
        state.targetPosition = null;

        // Visual feedback
        const btn = action === 'brake' ? btnBrake : btnAccel;
        if (btn) btn.classList.add('active');
    };

    const handleBtnEnd = (action) => {
        if (action === 'brake') keys.ArrowLeft = false;
        if (action === 'accel') keys.ArrowRight = false;

        // Visual feedback
        const btn = action === 'brake' ? btnBrake : btnAccel;
        if (btn) btn.classList.remove('active');
    };

    if (btnBrake && btnAccel) {
        // Mouse Events
        btnBrake.addEventListener('mousedown', () => handleBtnStart('brake'));
        btnBrake.addEventListener('mouseup', () => handleBtnEnd('brake'));
        btnBrake.addEventListener('mouseleave', () => handleBtnEnd('brake'));

        btnAccel.addEventListener('mousedown', () => handleBtnStart('accel'));
        btnAccel.addEventListener('mouseup', () => handleBtnEnd('accel'));
        btnAccel.addEventListener('mouseleave', () => handleBtnEnd('accel'));

        // Touch Events
        btnBrake.addEventListener('touchstart', (e) => { e.preventDefault(); handleBtnStart('brake'); });
        btnBrake.addEventListener('touchend', (e) => { e.preventDefault(); handleBtnEnd('brake'); });

        btnAccel.addEventListener('touchstart', (e) => { e.preventDefault(); handleBtnStart('accel'); });
        btnAccel.addEventListener('touchend', (e) => { e.preventDefault(); handleBtnEnd('accel'); });
    }

    // Horn Button
    const btnHorn = document.getElementById('btn-horn');
    if (btnHorn) {
        const playHorn = (e) => {
            e.preventDefault();
            SoundManager.playWhistle();
            btnHorn.classList.add('active');
            setTimeout(() => btnHorn.classList.remove('active'), 200);
        };

        btnHorn.addEventListener('mousedown', playHorn);
        btnHorn.addEventListener('touchstart', playHorn);
    }

    // Unlock Audio on first interaction
    const unlockAudio = () => {
        SoundManager.init();
        if (SoundManager.ctx && SoundManager.ctx.state === 'suspended') {
            SoundManager.ctx.resume();
        }
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);

        // Play whistle on start!
        SoundManager.playWhistle();
    };
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

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

    // --- Traffic System ---
    const vehicles = [];
    const vehicleGroup = new THREE.Group();
    scene.add(vehicleGroup);

    function createVehicle(type, x, z, direction) {
        const group = new THREE.Group();

        // Materials
        const color = type === 'car' ?
            [0xff0000, 0x0000ff, 0xffffff, 0x111111, 0x888888][Math.floor(Math.random() * 5)] :
            [0xffaa00, 0x00ff00, 0xffffff, 0xcc0000][Math.floor(Math.random() * 4)];

        const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.6 });
        const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const chromeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.9 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 });

        // Helper to create a wheel
        function createCarWheel() {
            const wGroup = new THREE.Group();
            const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16), rubberMat);
            tire.rotation.z = Math.PI / 2;
            wGroup.add(tire);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 16), chromeMat);
            hub.rotation.z = Math.PI / 2;
            wGroup.add(hub);
            return wGroup;
        }

        if (type === 'car') {
            // --- Realistic Car ---
            // Main Chassis (Lower)
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 1.8), bodyMat);
            chassis.position.y = 0.6;
            chassis.castShadow = true;
            group.add(chassis);

            // Cabin (Upper)
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 1.6), bodyMat);
            cabin.position.set(-0.2, 1.35, 0);
            cabin.castShadow = true;
            group.add(cabin);

            // Windows
            const windowGeo = new THREE.BoxGeometry(2.55, 0.6, 1.65);
            const windows = new THREE.Mesh(windowGeo, glassMat);
            windows.position.set(-0.2, 1.35, 0);
            group.add(windows);

            // Wheels
            const wheelPositions = [
                { x: 1.4, z: 0.8 }, { x: 1.4, z: -0.8 },
                { x: -1.4, z: 0.8 }, { x: -1.4, z: -0.8 }
            ];
            wheelPositions.forEach(pos => {
                const wheel = createCarWheel();
                wheel.position.set(pos.x, 0.35, pos.z);
                group.add(wheel);
            });

            // Headlights (Detailed)
            const hlGeo = new THREE.BoxGeometry(0.1, 0.25, 0.4);
            const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 2 });
            const hlLeft = new THREE.Mesh(hlGeo, hlMat);
            hlLeft.position.set(2.1, 0.6, 0.6);
            group.add(hlLeft);
            const hlRight = new THREE.Mesh(hlGeo, hlMat);
            hlRight.position.set(2.1, 0.6, -0.6);
            group.add(hlRight);

            // Taillights
            const tlMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
            const tlLeft = new THREE.Mesh(hlGeo, tlMat);
            tlLeft.position.set(-2.1, 0.6, 0.6);
            group.add(tlLeft);
            const tlRight = new THREE.Mesh(hlGeo, tlMat);
            tlRight.position.set(-2.1, 0.6, -0.6);
            group.add(tlRight);

        } else {
            // --- Realistic Bike ---
            // Frame
            const frameGeo = new THREE.BoxGeometry(1.5, 0.4, 0.2);
            const frame = new THREE.Mesh(frameGeo, bodyMat);
            frame.position.set(0, 0.8, 0);
            group.add(frame);

            // Engine block
            const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), chromeMat);
            engine.position.set(0, 0.5, 0);
            group.add(engine);

            // Wheels
            const wheelGeo = new THREE.TorusGeometry(0.35, 0.08, 8, 16);
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

            const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
            frontWheel.position.set(0.8, 0.35, 0);
            group.add(frontWheel);

            const backWheel = new THREE.Mesh(wheelGeo, wheelMat);
            backWheel.position.set(-0.8, 0.35, 0);
            group.add(backWheel);

            // Handlebars
            const handleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.8);
            const handle = new THREE.Mesh(handleGeo, chromeMat);
            handle.position.set(0.5, 1.1, 0);
            group.add(handle);

            // Rider
            const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
            riderBody.position.set(-0.2, 1.2, 0);
            group.add(riderBody);

            const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.25), new THREE.MeshStandardMaterial({ color: 0xffffff })); // Helmet
            riderHead.position.set(-0.2, 1.7, 0);
            group.add(riderHead);

            // Headlight
            const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 2 }));
            hl.position.set(0.8, 0.9, 0);
            group.add(hl);

            // Taillight
            const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 }));
            tl.position.set(-0.8, 0.9, 0);
            group.add(tl);
        }

        // Orient based on direction (1 = moving right, -1 = moving left)
        if (direction === -1) {
            group.rotation.y = Math.PI; // Face left
        }

        group.position.set(x, 0, z);
        vehicleGroup.add(group);

        return {
            mesh: group,
            type: type,
            maxSpeed: (type === 'car' ? 0.3 : 0.45) * (0.8 + Math.random() * 0.4), // Store max speed
            currentSpeed: 0, // Start stopped or accelerate
            direction: direction,
            laneZ: z
        };
    }

    // Initialize Traffic
    // Lane 1: Z = -15 (Closer to track), Direction: Right (Same as train start)
    // Lane 2: Z = -21 (Farther), Direction: Left

    for (let i = 0; i < 15; i++) {
        // Lane 1 (Right)
        const type1 = Math.random() > 0.7 ? 'bike' : 'car';
        const x1 = (Math.random() * config.maxTrackLength) - 50;
        vehicles.push(createVehicle(type1, x1, -15, 1));

        // Lane 2 (Left)
        const type2 = Math.random() > 0.7 ? 'bike' : 'car';
        const x2 = (Math.random() * config.maxTrackLength) - 50;
        vehicles.push(createVehicle(type2, x2, -21, -1));
    }
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
        // Chimney is at (1, 2.8, 0)
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

        // --- Traffic Light Logic ---
        trafficLight.timer++;
        if (trafficLight.state === 'green' && trafficLight.timer > 300) {
            trafficLight.state = 'yellow';
            trafficLight.timer = 0;
            // Update Visuals
            trafficLight.lights.green.color.setHex(0x003300); // Dim
            trafficLight.lights.yellow.color.setHex(0xffff00); // Bright
        } else if (trafficLight.state === 'yellow' && trafficLight.timer > 100) {
            trafficLight.state = 'red';
            trafficLight.timer = 0;
            // Update Visuals
            trafficLight.lights.yellow.color.setHex(0x333300); // Dim
            trafficLight.lights.red.color.setHex(0xff0000); // Bright
        } else if (trafficLight.state === 'red' && trafficLight.timer > 250) {
            trafficLight.state = 'green';
            trafficLight.timer = 0;
            // Update Visuals
            trafficLight.lights.red.color.setHex(0x330000); // Dim
            trafficLight.lights.green.color.setHex(0x00ff00); // Bright
        }

        // Initial Light State Set (First frame)
        if (trafficLight.timer === 1 && trafficLight.state === 'green') {
            trafficLight.lights.green.color.setHex(0x00ff00);
        }

        // --- Traffic Update with Rules & Collision ---
        const stopLineX = 0;
        const safeDistance = 12; // Minimum gap between vehicles

        vehicles.forEach(v => {
            let targetSpeed = v.maxSpeed; // Default to max speed

            // 1. Traffic Light Rule
            // Lane 1 (Right, dir=1): Stop if x < stopLineX and x > stopLineX - 20
            // Lane 2 (Left, dir=-1): Stop if x > stopLineX and x < stopLineX + 20

            let approachingLight = false;
            if (trafficLight.state !== 'green') {
                if (v.direction === 1 && v.mesh.position.x < stopLineX && v.mesh.position.x > stopLineX - 30) {
                    approachingLight = true;
                } else if (v.direction === -1 && v.mesh.position.x > stopLineX && v.mesh.position.x < stopLineX + 30) {
                    approachingLight = true;
                }
            }

            if (approachingLight) {
                targetSpeed = 0;
            }

            // 2. Collision Avoidance (Car Following)
            // Find closest vehicle in front
            let closestDist = Infinity;

            vehicles.forEach(other => {
                if (v === other) return; // Skip self
                if (v.direction !== other.direction) return; // Skip other lane

                // Check if 'other' is in front
                let dist;
                if (v.direction === 1) { // Moving Right
                    dist = other.mesh.position.x - v.mesh.position.x;
                    // Handle wrapping (if other is way behind, it might be logically in front after wrap)
                    // Simplified: just check positive distance
                } else { // Moving Left
                    dist = v.mesh.position.x - other.mesh.position.x;
                }

                if (dist > 0 && dist < closestDist) {
                    closestDist = dist;
                }
            });

            if (closestDist < safeDistance) {
                // Too close! Match speed or stop
                targetSpeed = 0;
            }

            // Apply smooth acceleration/deceleration
            if (v.currentSpeed < targetSpeed) {
                v.currentSpeed += 0.01; // Accelerate
            } else if (v.currentSpeed > targetSpeed) {
                v.currentSpeed -= 0.02; // Brake
            }

            // Move
            v.mesh.position.x += v.currentSpeed * v.direction;

            // Loop logic
            const limit = config.maxTrackLength + 100;
            const start = -100;

            if (v.direction === 1 && v.mesh.position.x > limit) {
                v.mesh.position.x = start;
                v.currentSpeed = v.maxSpeed; // Reset speed on respawn
            } else if (v.direction === -1 && v.mesh.position.x < start) {
                v.mesh.position.x = limit;
                v.currentSpeed = v.maxSpeed;
            }
        });

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
        // OPTIMIZATION: Reduced spawn rates for better performance
        const spawnChance = speed > 0.01 ? 0.4 : 0.02;

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



        // --- Gear Shifting Logic (Global) ---
        const absSpeed = Math.abs(state.trainSpeed);
        let targetGear = 1;
        for (let i = 0; i < gearRatios.length; i++) {
            if (absSpeed > gearRatios[i].max) {
                targetGear = i + 2; // Next gear
            } else {
                break;
            }
        }
        // Cap at max gear
        targetGear = Math.min(targetGear, gearRatios.length);

        // Shift Event
        if (targetGear !== state.gear && !state.isShifting && state.shiftTimer === 0) {
            state.isShifting = true;
            state.shiftTimer = 15; // Slightly shorter pause (15 frames)
            state.gear = targetGear;

            // UI Update
            if (gearDisplay) {
                gearDisplay.textContent = gearRatios[state.gear - 1].label;
                gearDisplay.classList.add('shifting');
                setTimeout(() => gearDisplay.classList.remove('shifting'), 300);
            }
        }

        // Apply Shift Pause (Global)
        if (state.isShifting) {
            state.shiftTimer--;
            if (state.shiftTimer <= 0) {
                state.isShifting = false;
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
                // Smooth acceleration (Pause if shifting)
                if (!state.isShifting) {
                    state.trainSpeed += (targetSpeed - state.trainSpeed) * 0.05;
                }
            }
        }
        // Manual Driving Logic
        else {
            const powerBrake = 0.15; // Strong braking power

            if (keys.ArrowRight) {
                // If moving left (reversing), apply power brake to stop (Safety: Brake overrides shift)
                if (state.trainSpeed < -0.01) {
                    state.trainSpeed += powerBrake;
                } else if (!state.isShifting) {
                    state.trainSpeed += state.acceleration;
                }
            } else if (keys.ArrowLeft) {
                // If moving right (forward), apply power brake to stop (Safety: Brake overrides shift)
                if (state.trainSpeed > 0.01) {
                    state.trainSpeed -= powerBrake;
                } else if (!state.isShifting) {
                    state.trainSpeed -= state.acceleration;
                }
            } else {
                // Friction when no keys pressed
                state.trainSpeed *= state.friction;
            }
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

        // Camera Follow (Smoother Lerp)
        const camOffset = 10;
        const targetCamX = state.trainPosition;
        camera.position.x += (targetCamX - camera.position.x) * 0.05; // Reduced from 0.1 for smoother tracking
        camera.lookAt(state.trainPosition, 0, 0);

        // Dynamic Train Sway (Final Polish)
        // Adds a gentle rocking motion based on speed
        if (Math.abs(state.trainSpeed) > 0.01) {
            const swayAmount = 0.005 * (Math.abs(state.trainSpeed) / state.maxSpeed); // Reduced from 0.03
            trainGroup.rotation.z = Math.sin(Date.now() * 0.005) * swayAmount;
            // Also subtle vertical bounce
            trainGroup.position.y = Math.sin(Date.now() * 0.01) * 0.002 * (Math.abs(state.trainSpeed) / state.maxSpeed); // Reduced from 0.02
        } else {
            trainGroup.rotation.z = 0;
            trainGroup.position.y = 0;
        }

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
