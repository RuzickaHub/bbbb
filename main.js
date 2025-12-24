console.log('Script starting...');

const UNIT = 1.0, BRICK_H = 1.2, PLATE_H = 0.4, PLAYER_EYE_H = 1.8;

const COLORS = [
    { name: 'Red', hex: 0xff3b30 }, { name: 'Blue', hex: 0x007aff }, 
    { name: 'Green', hex: 0x34c759 }, { name: 'Yellow', hex: 0xffcc00 },
    { name: 'Purple', hex: 0xaf52de }, { name: 'White', hex: 0xffffff },
    { name: 'Black', hex: 0x222222 }, { name: 'Orange', hex: 0xff9500 }
];

const BRICK_TYPES = [
    { id: 'b11', name: 'Kostka', w: 1, l: 1, type: 'brick' },
    { id: 'b21', name: 'Kostka', w: 2, l: 1, type: 'brick' },
    { id: 'b41', name: 'Kostka', w: 4, l: 1, type: 'brick' },
    { id: 'b22', name: 'Kostka', w: 2, l: 2, type: 'brick' },
    { id: 'b24', name: 'Kostka', w: 2, l: 4, type: 'brick' },
    { id: 'p11', name: 'Plate', w: 1, l: 1, type: 'plate' },
    { id: 'p12', name: 'Plate', w: 1, l: 2, type: 'plate' }
];

let scene, camera, renderer, raycaster, clock;
let ghost, gridHelper, floor, gridMaterial;
let bricks = [], undoStack = [], redoStack = [];
let previewScenes = [];

let state = { 
    mode: 'BUILD', 
    colorIdx: 1, 
    brickTypeIdx: 0,
    move: {x:0, y:0}, 
    rot: {y:0, p:0}, 
    vel: new THREE.Vector3(), 
    canJump: false
};

const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 });

function createBrick(color, isGhost, brickType) {
    return createBrick3005(color, isGhost, brickType);
}

function initPreview(bt) {
    const container = document.getElementById(`preview-${bt.id}`);
    if (!container) {
        console.error('Preview container not found:', bt.id);
        return;
    }
    
    const width = 100, height = 80;
    const pScene = new THREE.Scene();
    const pCam = new THREE.PerspectiveCamera(45, width/height, 0.1, 100);
    pCam.position.set(4, 3, 4);
    pCam.lookAt(0, 0, 0);

    const pRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    pRenderer.setSize(width, height);
    pRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(pRenderer.domElement);

    pScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const pLight = new THREE.DirectionalLight(0xffffff, 0.5);
    pLight.position.set(5, 5, 5);
    pScene.add(pLight);

    const model = createBrick(COLORS[state.colorIdx].hex, false, bt);
    pScene.add(model);
    
    previewScenes.push({ 
        scene: pScene, 
        cam: pCam, 
        renderer: pRenderer, 
        model: model 
    });
}

function setupUI() {
    console.log('Setting up UI...');
    
    // Brick selector
    const brickSel = document.getElementById('brick-selector');
    BRICK_TYPES.forEach((bt, i) => {
        const item = document.createElement('div');
        item.className = `brick-item ${i === state.brickTypeIdx ? 'active' : ''}`;
        item.innerHTML = `
            <div class="preview-canvas-container" id="preview-${bt.id}"></div>
            <div class="brick-name">${bt.name}</div>
            <div class="brick-dim">${bt.w}x${bt.l}</div>
        `;
        item.onclick = () => {
            state.brickTypeIdx = i;
            document.querySelectorAll('.brick-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            updateGhost();
        };
        brickSel.appendChild(item);
    });

    // Initialize previews after DOM is ready
    setTimeout(() => {
        BRICK_TYPES.forEach(bt => initPreview(bt));
    }, 100);

    // Color selector
    const colorSel = document.getElementById('color-selector');
    COLORS.forEach((c, i) => {
        const circle = document.createElement('div');
        circle.className = `color-circle ${i === state.colorIdx ? 'active' : ''}`;
        circle.style.backgroundColor = '#' + c.hex.toString(16).padStart(6, '0');
        circle.onclick = () => {
            state.colorIdx = i;
            document.querySelectorAll('.color-circle').forEach(el => el.classList.remove('active'));
            circle.classList.add('active');
            updateGhost();
            previewScenes.forEach(ps => {
                if (ps && ps.model) {
                    ps.model.children.forEach(child => {
                        if (child.material) child.material.color.set(c.hex);
                    });
                }
            });
        };
        colorSel.appendChild(circle);
    });

    // Inventory buttons
    document.getElementById('btn-open-inventory').onclick = () => {
        document.getElementById('inventory-panel').classList.add('show');
    };
    document.getElementById('close-inventory').onclick = () => {
        document.getElementById('inventory-panel').classList.remove('show');
    };

    // Joystick
    nipplejs.create({ 
        zone: document.getElementById('joy-container'), 
        mode: 'static', 
        position: {left: '50px', bottom: '50px'}, 
        size: 80, 
        color: 'white'
    }).on('move', (e, d) => { 
        state.move.x = d.vector.x; 
        state.move.y = d.vector.y; 
    }).on('end', () => { 
        state.move.x = 0; 
        state.move.y = 0; 
    });

    // Mouse/Touch controls
    let isDragging = false, startX, startY;
    
    window.addEventListener('mousedown', e => {
        if(!e.target.closest('.panel-row, #joy-container, .jump-btn, #inventory-panel')) { 
            isDragging = true; 
            startX = e.clientX; 
            startY = e.clientY; 
        }
    });
    
    window.addEventListener('mousemove', e => {
        if(!isDragging) return;
        state.rot.y -= (e.clientX - startX) * 0.005;
        state.rot.p = Math.max(-1.4, Math.min(1.4, state.rot.p - (e.clientY - startY) * 0.005));
        startX = e.clientX; 
        startY = e.clientY;
    });
    
    window.addEventListener('mouseup', e => {
        if(isDragging && Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) {
            performAction();
        }
        isDragging = false;
    });

    window.addEventListener('touchstart', e => {
        const t = e.touches[0];
        if(!e.target.closest('.panel-row, #joy-container, .jump-btn, #inventory-panel')) { 
            isDragging = true; 
            startX = t.clientX; 
            startY = t.clientY; 
        }
    });
    
    window.addEventListener('touchmove', e => {
        if(!isDragging) return;
        const t = e.touches[0];
        state.rot.y -= (t.clientX - startX) * 0.005;
        state.rot.p = Math.max(-1.4, Math.min(1.4, state.rot.p - (t.clientY - startY) * 0.005));
        startX = t.clientX; 
        startY = t.clientY;
    });
    
    window.addEventListener('touchend', () => {
        isDragging = false;
    });

    // Mode buttons
    document.getElementById('mode-build').onclick = () => { 
        state.mode = 'BUILD'; 
        updateUI(); 
    };
    document.getElementById('mode-erase').onclick = () => { 
        state.mode = 'ERASE'; 
        updateUI(); 
    };
    
    // Undo/Redo
    document.getElementById('btn-undo').onclick = undo;
    document.getElementById('btn-redo').onclick = redo;
    
    // Jump
    document.getElementById('jump-btn').onclick = () => { 
        if(state.canJump) { 
            state.vel.y = 10; 
            state.canJump = false; 
        }
    };

    console.log('UI setup complete');
}

function init() {
    console.log('Initializing...');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 20, 100);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(5, PLAYER_EYE_H, 10);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(30, 60, 30);
    sun.castShadow = true;
    scene.add(sun);

    floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    gridMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(0x007aff) },
            uPlayerPos: { value: new THREE.Vector3() },
            uRadius: { value: 25.0 }
        },
        transparent: true,
        vertexShader: `
            varying vec3 vPos;
            void main() {
                vPos = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform vec3 uPlayerPos;
            uniform float uRadius;
            varying vec3 vPos;
            void main() {
                float dist = distance(vPos.xz, uPlayerPos.xz);
                float fade = clamp(1.0 - (dist / uRadius), 0.0, 1.0);
                vec2 grid = abs(fract(vPos.xz + 0.5) - 0.5) / fwidth(vPos.xz);
                float line = min(grid.x, grid.y);
                float mask = 1.0 - smoothstep(0.0, 1.5, line);
                if (fade < 0.01 || mask < 0.01) discard;
                gl_FragColor = vec4(uColor, mask * fade * 0.4);
            }
        `
    });
    
    const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), gridMaterial);
    gridPlane.rotation.x = -Math.PI / 2;
    gridPlane.position.y = 0.005;
    scene.add(gridPlane);

    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();

    setupUI();
    updateGhost();
    updateUI();
    
    window.addEventListener('resize', onWindowResize);
    
    console.log('Starting animation loop...');
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    
    const dt = Math.min(clock.getDelta(), 0.1);
    
    // Camera rotation
    camera.rotation.set(state.rot.p, state.rot.y, 0);

    // Movement
    if (state.move.x || state.move.y) {
        const moveDirection = new THREE.Vector3(state.move.x, 0, -state.move.y)
            .applyAxisAngle(new THREE.Vector3(0,1,0), state.rot.y)
            .multiplyScalar(8 * dt);
        camera.position.add(moveDirection);
    }

    // Update grid position
    if(gridMaterial) {
        gridMaterial.uniforms.uPlayerPos.value.copy(camera.position);
    }

    // Gravity
    state.vel.y -= 25 * dt;
    camera.position.y += state.vel.y * dt;
    if (camera.position.y < PLAYER_EYE_H) {
        camera.position.y = PLAYER_EYE_H;
        state.vel.y = 0;
        state.canJump = true;
    }

    // Update preview scenes
    previewScenes.forEach(ps => {
        if (ps && ps.model && ps.renderer && ps.scene && ps.cam) {
            ps.model.rotation.y += 0.01;
            ps.renderer.render(ps.scene, ps.cam);
        }
    });

    // Raycasting
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const intersects = raycaster.intersectObjects([floor, ...bricks], true);
    
    if (intersects.length > 0 && state.mode === 'BUILD' && ghost) {
        const hit = intersects[0];
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        const brickType = BRICK_TYPES[state.brickTypeIdx];
        const currentH = brickType.type === 'brick' ? BRICK_H : PLATE_H;
        const pos = hit.point.clone().add(normal.multiplyScalar(0.01));
        
        const offX = (brickType.w % 2 !== 0) ? 0.5 : 0;
        const offZ = (brickType.l % 2 !== 0) ? 0.5 : 0;
        const gx = Math.round(pos.x - offX) + offX;
        const gz = Math.round(pos.z - offZ) + offZ;
        
        let gy;
        if (hit.object === floor) { 
            gy = currentH / 2; 
        } else {
            let target = hit.object;
            while(target.parent && target.parent !== scene) target = target.parent;
            const baseH = target.userData.type === 'brick' ? BRICK_H : PLATE_H;
            if (normal.y > 0.5) {
                gy = target.position.y + (baseH / 2) + (currentH / 2);
            } else if (normal.y < -0.5) {
                gy = Math.max(currentH/2, target.position.y - (baseH / 2) - (currentH / 2));
            } else {
                gy = target.position.y;
            }
        }

        ghost.visible = true;
        ghost.position.set(gx, gy, gz);
        
        if(!gridHelper || gridHelper.userData.id !== brickType.id) {
            if(gridHelper) scene.remove(gridHelper);
            gridHelper = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(brickType.w, currentH, brickType.l)),
                new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
            );
            gridHelper.userData.id = brickType.id;
            scene.add(gridHelper);
        }
        gridHelper.visible = true;
        gridHelper.position.set(gx, gy, gz);
        gridHelper.material.color.set(0xffffff);
        
    } else if (state.mode === 'ERASE') {
        const brickHits = raycaster.intersectObjects(bricks, true);
        if (brickHits.length > 0) {
            let target = brickHits[0].object;
            while(target.parent && target.parent !== scene) target = target.parent;
            
            if (gridHelper) {
                gridHelper.visible = true;
                gridHelper.position.copy(target.position);
                gridHelper.material.color.set(0xff3b30);
                const th = target.userData.type === 'brick' ? BRICK_H : PLATE_H;
                gridHelper.geometry.dispose();
                gridHelper.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(target.userData.w, th, target.userData.l));
                gridHelper.userData.id = 'ERASE_TARGET';
            }
            if (ghost) ghost.visible = false;
        } else {
            if(gridHelper) gridHelper.visible = false;
        }
    } else {
        if(ghost) ghost.visible = false;
        if(gridHelper) gridHelper.visible = false;
    }
    
    renderer.render(scene, camera);
}

function performAction() {
    if (state.mode === 'BUILD' && ghost && ghost.visible) {
        const b = createBrick(COLORS[state.colorIdx].hex, false, BRICK_TYPES[state.brickTypeIdx]);
        b.position.copy(ghost.position);
        scene.add(b);
        bricks.push(b);
        undoStack.push({ type: 'ADD', obj: b });
        redoStack = [];
        updateUI();
    } else if (state.mode === 'ERASE') {
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        const hits = raycaster.intersectObjects(bricks, true);
        if (hits.length > 0) {
            let target = hits[0].object;
            while(target.parent && target.parent !== scene) target = target.parent;
            scene.remove(target);
            bricks = bricks.filter(b => b !== target);
            undoStack.push({ type: 'REMOVE', obj: target });
            redoStack = [];
            updateUI();
        }
    }
}

function undo() {
    const action = undoStack.pop();
    if(!action) return;
    if(action.type === 'ADD') {
        scene.remove(action.obj);
        bricks = bricks.filter(b => b !== action.obj);
    } else {
        scene.add(action.obj);
        bricks.push(action.obj);
    }
    redoStack.push(action);
    updateUI();
}

function redo() {
    const action = redoStack.pop();
    if(!action) return;
    if(action.type === 'ADD') {
        scene.add(action.obj);
        bricks.push(action.obj);
    } else {
        scene.remove(action.obj);
        bricks = bricks.filter(b => b !== action.obj);
    }
    undoStack.push(action);
    updateUI();
}

function updateUI() {
    document.getElementById('mode-build').classList.toggle('active', state.mode === 'BUILD');
    document.getElementById('mode-erase').classList.toggle('active', state.mode === 'ERASE');
    document.getElementById('count').innerText = bricks.length;
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

function updateGhost() {
    if(ghost && scene) scene.remove(ghost);
    ghost = createBrick(COLORS[state.colorIdx].hex, true, BRICK_TYPES[state.brickTypeIdx]);
    if(scene) scene.add(ghost);
    if(gridHelper && scene) {
        scene.remove(gridHelper);
        gridHelper = null;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start button event listener
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, adding event listener...');
    
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            console.log('Start button clicked');
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('ui').style.display = 'block';
            init();
        });
        console.log('Event listener added');
    } else {
        console.error('Start button not found!');
    }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.querySelector('button[type="submit"]').click();
  }
});

console.log('Script loaded successfully');
