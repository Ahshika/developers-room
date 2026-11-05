import {
  BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type Object3D,
} from 'three';
import {
  CHAIR, DESK, KEYBOARD, MOUSE, RACKS, RACK_SIZE, ROOM, SCREEN, SECONDARY_MONITORS, SECONDARY_SCREEN, TOWER, WINDOW,
} from '../../config/layout';
import { createRandom } from '../../utils/random';

/**
 * PHASE 2 PLACEHOLDER ENVIRONMENT (ASSET_INVENTORY.md A01–A14): code-built geometry with correct
 * dimensions and pivots, replaced by Blender GLB assets in Phase 3. Every object is named
 * PLACEHOLDER_* so it can never be mistaken for a final asset.
 */

export interface Practical {
  material: MeshStandardMaterial;
  base: number;
}

export interface RoomParts {
  root: Group;
  /** Groups with their origin on the floor; the blueprint opening scales them in Y (extrusion). */
  risers: Group[];
  screenMesh: Mesh;
  chairPivot: Group;
  practicals: Practical[];
  /** Meshes that receive the key-light shadow. */
  shadowReceivers: Mesh[];
}

const DEG = Math.PI / 180;

function std(color: string, roughness: number, metalness = 0, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function box(name: string, w: number, h: number, d: number, mat: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.name = `PLACEHOLDER_${name}`;
  m.position.set(x, y, z);
  return m;
}

function riser(name: string): Group {
  const g = new Group();
  g.name = `PLACEHOLDER_Riser_${name}`;
  return g;
}

function practical(list: Practical[], color: string, intensity: number): MeshStandardMaterial {
  const material = std('#000000', 0.6, 0, { emissive: color, emissiveIntensity: intensity });
  list.push({ material, base: intensity });
  return material;
}

/** Static syntax-coloured "code" texture for the secondary monitors (synthetic, no real data). */
function secondaryScreenTexture(seed: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#070b12';
    g.fillRect(0, 0, c.width, c.height);
    const rnd = createRandom(seed);
    const palette = ['#42d9ff', '#1769ff', '#ff8a36', '#8aa0b8', '#e8eef5'];
    for (let row = 0; row < 18; row++) {
      let x = 16 + Math.floor(rnd() * 4) * 14;
      const y = 18 + row * 15;
      const tokens = 2 + Math.floor(rnd() * 6);
      for (let i = 0; i < tokens; i++) {
        const w = 14 + rnd() * 60;
        g.fillStyle = palette[Math.floor(rnd() * palette.length)] as string;
        g.globalAlpha = 0.55 + rnd() * 0.35;
        g.fillRect(x, y, w, 5);
        x += w + 8;
      }
    }
    g.globalAlpha = 1;
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Night-city backdrop: parallax layers of building silhouettes with lit windows. */
function cityLayer(seed: number, layer: number, layers: number): Mesh {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const rnd = createRandom(seed);
  const far = layer === layers - 1;
  if (g) {
    if (far) {
      const sky = g.createLinearGradient(0, 0, 0, c.height);
      sky.addColorStop(0, '#03070f');
      sky.addColorStop(0.6, '#0b1930');
      sky.addColorStop(1, '#1b2a44');
      g.fillStyle = sky;
      g.fillRect(0, 0, c.width, c.height);
    }
    const depth = layer / Math.max(1, layers - 1);
    let x = 0;
    while (x < c.width) {
      const w = 30 + rnd() * 70;
      const h = (0.25 + rnd() * 0.55) * c.height * (1 - depth * 0.35);
      const top = c.height - h;
      g.fillStyle = far ? '#08111f' : `rgb(${8 + layer * 3},${14 + layer * 4},${26 + layer * 6})`;
      g.fillRect(x, top, w, h);
      for (let wy = top + 8; wy < c.height - 6; wy += 9) {
        for (let wx = x + 5; wx < x + w - 5; wx += 7) {
          if (rnd() < 0.22) {
            g.fillStyle = rnd() < 0.75 ? '#ffb46b' : '#9fd8ff';
            g.globalAlpha = 0.35 + rnd() * 0.5 * (1 - depth * 0.5);
            g.fillRect(wx, wy, 3, 4);
          }
        }
      }
      g.globalAlpha = 1;
      x += w + rnd() * 12;
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const distance = 30 + layer * 45;
  const width = 60 + distance * 1.6;
  const height = width / 2;
  const mesh = new Mesh(
    new PlaneGeometry(width, height),
    new MeshBasicMaterial({ map: tex, transparent: !far, depthWrite: far, fog: false, toneMapped: true }),
  );
  mesh.name = `PLACEHOLDER_City_${layer}`;
  mesh.position.set(WINDOW.x - distance, height / 2 - 4 - layer * 2, -1);
  mesh.rotation.y = 90 * DEG;
  mesh.renderOrder = -10 - layer;
  return mesh;
}

export function buildRoom(screenMaterial: MeshBasicMaterial, cityLayers: number): RoomParts {
  const root = new Group();
  root.name = 'PLACEHOLDER_Room';
  const practicals: Practical[] = [];
  const risers: Group[] = [];
  const shadowReceivers: Mesh[] = [];

  const wallMat = std('#0d1624', 0.86);
  const panelMat = std('#111d30', 0.7, 0.05);
  const graphite = std('#1b2028', 0.42, 0.25);
  const metal = std('#2b323c', 0.32, 0.85);
  const plastic = std('#0b0d10', 0.5, 0.05);
  const bezel = std('#050607', 0.35, 0.3);

  // floor (always visible: the blueprint is drawn on it)
  const floor = new Mesh(new PlaneGeometry(ROOM.width, ROOM.depth), std('#0b111a', 0.5, 0.1));
  floor.name = 'PLACEHOLDER_Floor';
  floor.rotation.x = -90 * DEG;
  floor.receiveShadow = true;
  shadowReceivers.push(floor);
  root.add(floor);

  // walls
  const walls = riser('Walls');
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  walls.add(box('BackWall', ROOM.width, ROOM.height, 0.1, wallMat, 0, ROOM.height / 2, -halfD - 0.05));
  for (let i = 0; i < 5; i++) {
    walls.add(box(`BackPanel_${i}`, 1.2, 2.2, 0.03, panelMat, -2.6 + i * 1.3, 1.25, -halfD + 0.015));
  }
  walls.add(box('RightWall', 0.1, ROOM.height, ROOM.depth, wallMat, halfW + 0.05, ROOM.height / 2, 0));
  walls.add(box('FrontWall', ROOM.width, ROOM.height, 0.1, wallMat, 0, ROOM.height / 2, halfD + 0.05));
  walls.add(box('BackLedStrip', 5.6, 0.018, 0.02, practical(practicals, '#1769ff', 2.2), 0, 2.6, -halfD + 0.04));
  risers.push(walls);

  // window wall: sill, header, mullions and glass
  const windowWall = riser('Window');
  const winLen = WINDOW.zMax - WINDOW.zMin;
  const winMid = (WINDOW.zMax + WINDOW.zMin) / 2;
  windowWall.add(box('WindowSill', 0.1, WINDOW.yMin, winLen, wallMat, WINDOW.x - 0.05, WINDOW.yMin / 2, winMid));
  windowWall.add(box('WindowHeader', 0.1, ROOM.height - WINDOW.yMax, winLen, wallMat, WINDOW.x - 0.05, (ROOM.height + WINDOW.yMax) / 2, winMid));
  windowWall.add(box('WindowWallBack', 0.1, ROOM.height, WINDOW.zMin + halfD, wallMat, WINDOW.x - 0.05, ROOM.height / 2, (-halfD + WINDOW.zMin) / 2));
  windowWall.add(box('WindowWallFront', 0.1, ROOM.height, halfD - WINDOW.zMax, wallMat, WINDOW.x - 0.05, ROOM.height / 2, (WINDOW.zMax + halfD) / 2));
  for (let z = WINDOW.zMin; z <= WINDOW.zMax + 1e-6; z += WINDOW.mullionSpacing) {
    windowWall.add(box('Mullion', 0.05, WINDOW.yMax - WINDOW.yMin, 0.04, metal, WINDOW.x, (WINDOW.yMax + WINDOW.yMin) / 2, z));
  }
  const glass = new Mesh(
    new PlaneGeometry(winLen, WINDOW.yMax - WINDOW.yMin),
    std('#9fc4ff', 0.05, 0.1, { transparent: true, opacity: 0.06, depthWrite: false, side: DoubleSide }),
  );
  glass.name = 'PLACEHOLDER_Glass';
  glass.position.set(WINDOW.x, (WINDOW.yMax + WINDOW.yMin) / 2, winMid);
  glass.rotation.y = 90 * DEG;
  windowWall.add(glass);
  risers.push(windowWall);

  // ceiling and linear fixtures (risen from the floor like everything else)
  const ceiling = riser('Ceiling');
  ceiling.add(box('Ceiling', ROOM.width, 0.06, ROOM.depth, wallMat, 0, ROOM.height + 0.03, 0));
  for (const z of [-2.0, 0.2]) {
    ceiling.add(box('CeilingFixture', 2.4, 0.02, 0.06, practical(practicals, '#9fc4ff', 0.6), 0.4, ROOM.height - 0.01, z));
  }
  risers.push(ceiling);

  // desk + workstation
  const desk = riser('Desk');
  const deskTopY = DESK.center[1] + DESK.thickness / 2;
  const deskTop = box('DeskTop', DESK.width, DESK.thickness, DESK.depth, graphite, DESK.center[0], DESK.center[1], DESK.center[2]);
  deskTop.receiveShadow = true;
  shadowReceivers.push(deskTop);
  desk.add(deskTop);
  for (const sx of [-1, 1]) {
    desk.add(box('DeskLeg', 0.05, DESK.center[1] - DESK.thickness / 2, DESK.depth - 0.1, metal, sx * (DESK.width / 2 - 0.08), (DESK.center[1] - DESK.thickness / 2) / 2, DESK.center[2]));
  }
  desk.add(box('DeskCove', DESK.width - 0.2, 0.012, 0.015, practical(practicals, '#42d9ff', 1.6), 0, DESK.center[1] - 0.03, DESK.center[2] + DESK.depth / 2 - 0.02));

  // main monitor: exact screen rectangle from the layout (transition target)
  const [sx, sy, sz] = SCREEN.center;
  const bezelW = SCREEN.width + SCREEN.bezel * 2;
  const bezelH = SCREEN.height + SCREEN.bezel * 2;
  desk.add(box('MonitorMainBezel', bezelW, bezelH, 0.025, bezel, sx, sy, sz - 0.0135));
  const screenMesh = new Mesh(new PlaneGeometry(SCREEN.width, SCREEN.height), screenMaterial);
  screenMesh.name = 'PLACEHOLDER_MonitorMainScreen';
  screenMesh.position.set(sx, sy, sz);
  desk.add(screenMesh);
  const standTop = sy - bezelH / 2;
  desk.add(box('MonitorStandNeck', 0.05, standTop - deskTopY, 0.03, metal, sx, (standTop + deskTopY) / 2, sz - 0.05));
  desk.add(box('MonitorStandFoot', 0.26, 0.012, 0.2, metal, sx, deskTopY + 0.006, sz - 0.03));

  const secondaryTex = secondaryScreenTexture(7);
  for (const [i, mon] of SECONDARY_MONITORS.entries()) {
    const g = new Group();
    g.name = `PLACEHOLDER_MonitorSecondary_${i}`;
    g.position.set(mon.center[0], mon.center[1], mon.center[2]);
    g.rotation.y = mon.yawDeg * DEG;
    const w = SECONDARY_SCREEN.width + 0.016;
    const h = SECONDARY_SCREEN.height + 0.016;
    g.add(box('SecondaryBezel', w, h, 0.025, bezel, 0, 0, -0.0135));
    const scr = new Mesh(
      new PlaneGeometry(SECONDARY_SCREEN.width, SECONDARY_SCREEN.height),
      practical(practicals, '#ffffff', 0.55),
    );
    (scr.material as MeshStandardMaterial).emissiveMap = secondaryTex;
    scr.name = 'PLACEHOLDER_SecondaryScreen';
    g.add(scr);
    g.add(box('SecondaryStand', 0.04, mon.center[1] - h / 2 - deskTopY, 0.03, metal, 0, -(mon.center[1] - deskTopY) / 2 - h / 4, -0.05));
    desk.add(g);
  }

  // keyboard with instanced key caps
  const [kx, ky, kz] = KEYBOARD.center;
  desk.add(box('KeyboardBase', KEYBOARD.width, 0.015, KEYBOARD.depth, plastic, kx, ky - 0.012, kz));
  const keys = new InstancedMesh(new BoxGeometry(0.024, 0.008, 0.022), std('#101216', 0.55), 15 * 5);
  keys.name = 'PLACEHOLDER_KeyCaps';
  const mtx = new Matrix4();
  let k = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 15; c++) {
      mtx.makeTranslation(kx - KEYBOARD.width / 2 + 0.024 + c * 0.0279, ky - 0.0005, kz - KEYBOARD.depth / 2 + 0.018 + r * 0.024);
      keys.setMatrixAt(k++, mtx);
    }
  }
  desk.add(keys);
  desk.add(box('Mouse', 0.065, 0.025, 0.11, plastic, MOUSE.center[0], MOUSE.center[1] - 0.004, MOUSE.center[2]));
  desk.add(box('Mousepad', 0.32, 0.003, 0.26, std('#0a0c10', 0.9), MOUSE.center[0] + 0.02, deskTopY + 0.0015, MOUSE.center[2]));
  const mug = new Mesh(new CylinderGeometry(0.04, 0.038, 0.1, 20), std('#202630', 0.35, 0.1));
  mug.name = 'PLACEHOLDER_Mug';
  mug.position.set(-0.78, deskTopY + 0.05, -2.18);
  desk.add(mug);
  risers.push(desk);

  // tower under the desk (orange internal glow)
  const tower = riser('Tower');
  const [tx, , tz] = TOWER.position;
  const [tw, th, td] = TOWER.size;
  tower.add(box('TowerCase', tw, th, td, std('#0d0f13', 0.4, 0.4), tx, th / 2 + 0.02, tz));
  tower.add(box('TowerGlow', 0.004, th * 0.7, td * 0.7, practical(practicals, '#ff8a36', 1.4), tx - tw / 2 - 0.002, th / 2 + 0.02, tz));
  risers.push(tower);

  // server racks
  for (const [i, rack] of RACKS.entries()) {
    const r = riser(`Rack_${i}`);
    const g = new Group();
    g.position.set(rack.position[0], 0, rack.position[2]);
    g.rotation.y = rack.yawDeg * DEG;
    g.add(box('RackFrame', RACK_SIZE.width, RACK_SIZE.height, RACK_SIZE.depth, std('#0c0f14', 0.45, 0.6), 0, RACK_SIZE.height / 2, 0));
    for (let u = 0; u < 10; u++) {
      g.add(box('RackUnit', RACK_SIZE.width - 0.06, 0.15, 0.01, std('#161b22', 0.5, 0.5), 0, 0.2 + u * 0.172, RACK_SIZE.depth / 2 + 0.005));
    }
    const leds = new InstancedMesh(new BoxGeometry(0.008, 0.008, 0.004), practical(practicals, '#42d9ff', 3), 20);
    leds.name = 'PLACEHOLDER_RackLeds';
    const rnd = createRandom(31 + i);
    for (let u = 0; u < 20; u++) {
      mtx.makeTranslation(-0.22 + (u % 2) * 0.02, 0.2 + Math.floor(u / 2) * 0.172 + rnd() * 0.04, RACK_SIZE.depth / 2 + 0.012);
      leds.setMatrixAt(u, mtx);
    }
    g.add(leds);
    r.add(g);
    risers.push(r);
  }

  // chair: static base + rotating seat pivot on the gas-lift axis
  const chair = riser('Chair');
  const [cx, , cz] = CHAIR.pivot;
  for (let i = 0; i < 5; i++) {
    const leg = box('ChairBaseLeg', 0.04, 0.03, 0.32, metal, cx, 0.07, cz);
    leg.rotation.y = (i * 72) * DEG;
    leg.translateZ(0.16);
    chair.add(leg);
  }
  const lift = new Mesh(new CylinderGeometry(0.025, 0.03, CHAIR.seatHeight - 0.1, 12), metal);
  lift.name = 'PLACEHOLDER_ChairGasLift';
  lift.position.set(cx, (CHAIR.seatHeight - 0.1) / 2 + 0.07, cz);
  chair.add(lift);
  const chairPivot = new Group();
  chairPivot.name = 'PLACEHOLDER_ChairSeatPivot';
  chairPivot.position.set(cx, 0, cz);
  const fabric = std('#14171c', 0.9);
  chairPivot.add(box('ChairSeat', 0.5, 0.07, 0.48, fabric, 0, CHAIR.seatHeight - 0.035, -0.02));
  chairPivot.add(box('ChairBack', 0.46, 0.62, 0.07, fabric, 0, CHAIR.seatHeight + 0.42, 0.26));
  chairPivot.add(box('ChairBackRod', 0.05, 0.25, 0.04, metal, 0, CHAIR.seatHeight + 0.06, 0.27));
  for (const s of [-1, 1]) {
    chairPivot.add(box('ChairArmrest', 0.06, 0.03, 0.28, plastic, s * 0.27, CHAIR.seatHeight + 0.2, -0.02));
    chairPivot.add(box('ChairArmPost', 0.03, 0.2, 0.03, metal, s * 0.27, CHAIR.seatHeight + 0.1, 0.06));
  }
  chair.add(chairPivot);
  risers.push(chair);

  // the city belongs to the window riser, so it appears (rises) together with the glass
  for (let i = 0; i < cityLayers; i++) windowWall.add(cityLayer(101 + i * 17, i, cityLayers));

  for (const r of risers) root.add(r);

  root.traverse((o: Object3D) => {
    if ((o as Mesh).isMesh && o.name !== 'PLACEHOLDER_Floor') o.castShadow = false;
  });
  return { root, risers, screenMesh, chairPivot, practicals, shadowReceivers };
}
