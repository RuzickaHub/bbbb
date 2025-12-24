// Brick model 3005 (1x1 brick with studs)
const UNIT = 1.0;
const BRICK_H = 1.2;
const PLATE_H = 0.4;

function createBrick3005(color, isGhost = false, brickType = { w: 1, l: 1, type: 'brick' }) {
    const h = brickType.type === 'brick' ? BRICK_H : PLATE_H;
    const group = new THREE.Group();
    const mat = isGhost ? 
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, color }) : 
        new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });

    // Main brick body
    const bodyGeo = new THREE.BoxGeometry(brickType.w * UNIT, h, brickType.l * UNIT);
    const body = new THREE.Mesh(bodyGeo, mat);
    if(!isGhost) { 
        body.castShadow = true; 
        body.receiveShadow = true; 
        body.scale.set(0.99, 0.99, 0.99); 
    }
    group.add(body);

    // Stud geometry (cylinder)
    const studGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 12);
    const studOffsetX = (brickType.w - 1) * UNIT / 2;
    const studOffsetZ = (brickType.l - 1) * UNIT / 2;

    // Add studs
    for(let x = 0; x < brickType.w; x++) {
        for(let z = 0; z < brickType.l; z++) {
            const s = new THREE.Mesh(studGeo, mat);
            s.position.set(-studOffsetX + x * UNIT, (h + 0.15) / 2, -studOffsetZ + z * UNIT);
            group.add(s);
        }
    }

    group.userData = { 
        type: brickType.type, 
        w: brickType.w, 
        l: brickType.l,
        id: 'brick-' + Date.now()
    };

    return group;
}
